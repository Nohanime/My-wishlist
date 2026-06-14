require('dotenv').config();
const express      = require('express');
const cookieParser = require('cookie-parser');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const path         = require('path');
const cors         = require('cors');

const db                = require('./db');
const { scrapeProduct } = require('./scraper');

const app         = express();
app.set('trust proxy', 1);
const PORT        = process.env.PORT || 3000;
const JWT_SECRET  = process.env.JWT_SECRET || 'changeme';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
const RESEND_KEY  = process.env.RESEND_API_KEY || '';
const BASE_URL    = process.env.BASE_URL || '';

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// ── Auth helpers ──────────────────────────────────────────────
function getUser(req) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch { return null; }
}
function requireAdmin(req, res, next) {
  const user = getUser(req);
  if (!user?.isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  req.user = user; next();
}
function optionalAuth(req, res, next) {
  req.user = getUser(req); next();
}

// ── Invite token middleware ───────────────────────────────────
async function requireInvite(req, res, next) {
  // Admin always passes
  const user = getUser(req);
  if (user?.isAdmin) { req.user = user; return next(); }

  const validToken = await db.getSetting('invite_token');
  const provided   = req.headers['x-invite-token'] || req.query.token;
  if (!provided || provided !== validToken) {
    return res.status(401).json({ error: 'Lien d\'invitation invalide ou manquant' });
  }
  req.user = user;
  next();
}

// ── Email ─────────────────────────────────────────────────────
// FROM_EMAIL : par défaut "onboarding@resend.dev" qui fonctionne sans
// vérification de domaine, mais Resend n'autorise alors l'envoi QUE vers
// l'adresse email du compte Resend lui-même. Pour envoyer vers n'importe
// quelle adresse (ex: ADMIN_EMAIL différent), il faut vérifier un domaine
// sur https://resend.com/domains et définir FROM_EMAIL=notif@tondomaine.fr
const FROM_EMAIL = process.env.FROM_EMAIL || 'Wishlist <onboarding@resend.dev>';

async function sendEmail(subject, html) {
  if (!RESEND_KEY || !ADMIN_EMAIL) return;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject,
        html,
      })
    });
    if (!r.ok) {
      const body = await r.text();
      console.error('Resend error:', r.status, body);
    }
  } catch(e) { console.error('Email error:', e.message); }
}
// ── Auth routes ───────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, pseudo } = req.body;
  if (!email || !password || !pseudo) return res.status(400).json({ error: 'Champs manquants' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 chars min)' });
  try {
    if (await db.getUserByEmail(email.toLowerCase())) return res.status(409).json({ error: 'Email déjà utilisé' });
    const hash    = await bcrypt.hash(password, 10);
    const isAdmin = email.toLowerCase().trim() === ADMIN_EMAIL;
    const user    = await db.createUser({ email: email.toLowerCase(), password: hash, pseudo, isAdmin });
    const token   = jwt.sign({ id: user.id, email: user.email, pseudo: user.pseudo, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30*24*3600*1000, secure: process.env.NODE_ENV === 'production' });
    res.json({ id: user.id, email: user.email, pseudo: user.pseudo, isAdmin: user.is_admin });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Champs manquants' });
  const user = await db.getUserByEmail(email.toLowerCase());
  if (!user || !await bcrypt.compare(password, user.password))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  const token = jwt.sign({ id: user.id, email: user.email, pseudo: user.pseudo, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30*24*3600*1000, secure: process.env.NODE_ENV === 'production' });
  res.json({ id: user.id, email: user.email, pseudo: user.pseudo, isAdmin: user.is_admin });
});

app.post('/api/auth/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
app.get('/api/auth/me', optionalAuth, (req, res) => res.json(req.user || null));

// ── Invite ────────────────────────────────────────────────────
app.get('/api/invite/token', requireAdmin, async (req, res) => {
  const token   = await db.getSetting('invite_token');
  const baseUrl = BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ token, url: `${baseUrl}/?invite=${token}` });
});

app.post('/api/invite/regenerate', requireAdmin, async (req, res) => {
  const crypto  = require('crypto');
  const token   = crypto.randomBytes(24).toString('hex');
  await db.setSetting('invite_token', token);
  const baseUrl = BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ token, url: `${baseUrl}/?invite=${token}` });
});

app.get('/api/invite/verify', async (req, res) => {
  const validToken = await db.getSetting('invite_token');
  const provided   = req.query.token;
  if (!provided || provided !== validToken) return res.status(401).json({ valid: false });
  res.json({ valid: true });
});

// ── Notifications ─────────────────────────────────────────────
app.get('/api/notifications', requireAdmin, async (req, res) => {
  const notifs = await db.getNotifications();
  res.json(notifs);
});

app.get('/api/notifications/unread', requireAdmin, async (req, res) => {
  const count = await db.getUnreadCount();
  res.json({ count });
});

app.post('/api/notifications/read', requireAdmin, async (req, res) => {
  await db.markAllRead();
  res.json({ ok: true });
});

// ── Items ─────────────────────────────────────────────────────
app.get('/api/items', requireInvite, async (req, res) => {
  const sort = req.query.sort || 'position';
  res.json(await db.getItems(sort));
});

app.post('/api/scrape', requireAdmin, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL manquante' });
  try {
    const data = await scrapeProduct(url);
    if (!data.title) return res.status(422).json({ error: "Impossible d'extraire les données. Essaie l'ajout manuel." });
    res.json(await db.createItem(data));
  } catch(e) {
    const msg = (e.response?.status === 403 || e.response?.status === 429)
      ? "Ce site bloque les robots. Utilise l'ajout manuel."
      : "Erreur : " + e.message;
    res.status(500).json({ error: msg });
  }
});

app.post('/api/items', requireAdmin, async (req, res) => {
  const { title, price, image, url, details, options } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre obligatoire' });
  res.json(await db.createItem({
    title, url: url||null, image: image||null, details: details||null, options: options||null,
    price: price ? parseFloat(String(price).replace(',','.')) : null,
  }));
});

app.put('/api/items/:id', requireAdmin, async (req, res) => {
  const { title, price, image, url, details, options } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre obligatoire' });
  await db.updateItem(req.params.id, {
    title, url: url||null, image: image||null, details: details||null, options: options||null,
    price: price ? parseFloat(String(price).replace(',','.')) : null,
  });
  res.json(await db.getItem(req.params.id));
});

app.delete('/api/items/:id', requireAdmin, async (req, res) => {
  await db.deleteItem(req.params.id); res.json({ ok: true });
});

// Drag & drop reorder
app.post('/api/items/reorder', requireAdmin, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids requis' });
  await db.updatePositions(ids);
  res.json({ ok: true });
});

// ── Participants ──────────────────────────────────────────────
app.post('/api/items/:id/join', requireInvite, async (req, res) => {
  const { name, contribution } = req.body;
  const finalName = req.user?.pseudo || name;
  if (!finalName) return res.status(400).json({ error: 'Prénom requis' });
  const contrib = contribution ? parseFloat(String(contribution).replace(',','.')) : null;

  await db.addParticipant(req.params.id, finalName, req.user?.id || null, contrib);
  const item = await db.getItem(req.params.id);

  // Notification
  const msg = contrib
    ? `${finalName} participe à "${item.title}" (contribue ${contrib}€)`
    : `${finalName} participe à "${item.title}"`;
  await db.addNotification('join', msg, item.id);
  await sendEmail(
    `🎁 ${finalName} participe à un cadeau`,
    `<p><b>${finalName}</b> vient de rejoindre l'achat de <b>${item.title}</b>${contrib ? ` avec une contribution de <b>${contrib}€</b>` : ''}.</p>`
  );

  res.json(item);
});

app.delete('/api/items/:id/join', requireInvite, async (req, res) => {
  const { name } = req.body;
  const finalName = req.user?.pseudo || name;
  await db.removeParticipant(req.params.id, finalName, req.user?.id || null);
  res.json(await db.getItem(req.params.id));
});

// ── Messages ──────────────────────────────────────────────────
app.post('/api/items/:id/messages', requireInvite, async (req, res) => {
  const { content, name } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Message vide' });
  const author = req.user?.pseudo || name;
  if (!author) return res.status(400).json({ error: 'Prénom requis' });

  await db.addMessage(req.params.id, author, content.trim(), req.user?.id || null);
  const item = await db.getItem(req.params.id);

  // Notification
  const msg = `${author} a envoyé un message sur "${item.title}" : "${content.trim().slice(0,80)}"`;
  await db.addNotification('message', msg, item.id);
  await sendEmail(
    `💬 Nouveau message de ${author}`,
    `<p><b>${author}</b> a envoyé un message sur <b>${item.title}</b> :</p><blockquote>${content.trim()}</blockquote>`
  );

  res.json(item);
});

app.delete('/api/items/:id/messages/:mid', requireAdmin, async (req, res) => {
  await db.deleteMessage(req.params.mid);
  res.json(await db.getItem(req.params.id));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

db.initDB().then(() => {
  app.listen(PORT, () => console.log(`✓ Wishlist → http://localhost:${PORT}`));
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });
