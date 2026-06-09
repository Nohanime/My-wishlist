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
const PORT        = process.env.PORT || 3000;
const JWT_SECRET  = process.env.JWT_SECRET || 'changeme-in-production';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// ── Auth helpers ─────────────────────────────────────────────
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

// ── Auth routes ──────────────────────────────────────────────
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
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur serveur' }); }
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

// ── Items ────────────────────────────────────────────────────
app.get('/api/items', optionalAuth, async (req, res) => {
  res.json(await db.getItems());
});

app.post('/api/scrape', requireAdmin, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL manquante' });
  try {
    const data = await scrapeProduct(url);
    if (!data.title) return res.status(422).json({ error: "Impossible d'extraire les données. Essaie l'ajout manuel." });
    res.json(await db.createItem(data));
  } catch (e) {
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
  const updated = await db.updateItem(req.params.id, {
    title, url: url||null, image: image||null, details: details||null, options: options||null,
    price: price ? parseFloat(String(price).replace(',','.')) : null,
  });
  if (!updated) return res.status(404).json({ error: 'Introuvable' });
  res.json(await db.getItem(req.params.id));
});

app.delete('/api/items/:id', requireAdmin, async (req, res) => {
  await db.deleteItem(req.params.id); res.json({ ok: true });
});

// ── Participants ─────────────────────────────────────────────
app.post('/api/items/:id/join', optionalAuth, async (req, res) => {
  const name = req.user?.pseudo || req.body.name;
  if (!name) return res.status(400).json({ error: 'Prénom requis' });
  await db.addParticipant(req.params.id, name, req.user?.id || null);
  res.json(await db.getItem(req.params.id));
});

app.delete('/api/items/:id/join', optionalAuth, async (req, res) => {
  const name = req.user?.pseudo || req.body.name;
  await db.removeParticipant(req.params.id, name, req.user?.id || null);
  res.json(await db.getItem(req.params.id));
});

// ── Messages ─────────────────────────────────────────────────
app.post('/api/items/:id/messages', optionalAuth, async (req, res) => {
  const { content, name } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Message vide' });
  const author = req.user?.pseudo || name;
  if (!author) return res.status(400).json({ error: 'Prénom requis' });
  await db.addMessage(req.params.id, author, content.trim(), req.user?.id || null);
  res.json(await db.getItem(req.params.id));
});

app.delete('/api/items/:id/messages/:mid', optionalAuth, async (req, res) => {
  // Admin peut tout supprimer, sinon seulement ses propres messages
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  await db.deleteMessage(req.params.mid);
  res.json(await db.getItem(req.params.id));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

db.initDB().then(() => {
  app.listen(PORT, () => console.log(`✓ Wishlist → http://localhost:${PORT}`));
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });
