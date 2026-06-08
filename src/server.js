require('dotenv').config();
const express      = require('express');
const cookieParser = require('cookie-parser');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const path         = require('path');
const cors         = require('cors');

const db           = require('./db');
const { scrapeProduct } = require('./scraper');

const app       = express();
const PORT      = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme-in-production';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// ── Auth middleware ──────────────────────────────────────────

function getUser(req) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch { return null; }
}

function requireAdmin(req, res, next) {
  const user = getUser(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Accès refusé' });
  req.user = user;
  next();
}

function optionalAuth(req, res, next) {
  req.user = getUser(req);
  next();
}

// ── Auth routes ──────────────────────────────────────────────

// Register (n'importe qui peut créer un compte, mais seul ADMIN_EMAIL est admin)
app.post('/api/auth/register', async (req, res) => {
  const { email, password, pseudo } = req.body;
  if (!email || !password || !pseudo) return res.status(400).json({ error: 'Champs manquants' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 chars min)' });

  try {
    const existing = await db.getUserByEmail(email.toLowerCase());
    if (existing) return res.status(409).json({ error: 'Email déjà utilisé' });

    const hash    = await bcrypt.hash(password, 10);
    const isAdmin = email.toLowerCase().trim() === ADMIN_EMAIL;
    const user    = await db.createUser({ email: email.toLowerCase(), password: hash, pseudo, isAdmin });

    const token = jwt.sign({ id: user.id, email: user.email, pseudo: user.pseudo, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, secure: process.env.NODE_ENV === 'production' });
    res.json({ id: user.id, email: user.email, pseudo: user.pseudo, isAdmin: user.is_admin });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Champs manquants' });

  const user = await db.getUserByEmail(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  const token = jwt.sign({ id: user.id, email: user.email, pseudo: user.pseudo, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000, secure: process.env.NODE_ENV === 'production' });
  res.json({ id: user.id, email: user.email, pseudo: user.pseudo, isAdmin: user.is_admin });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// Me
app.get('/api/auth/me', optionalAuth, (req, res) => {
  if (!req.user) return res.json(null);
  res.json(req.user);
});

// ── Items routes ─────────────────────────────────────────────

app.get('/api/items', optionalAuth, async (req, res) => {
  const items = await db.getItems();
  res.json(items);
});

app.post('/api/scrape', requireAdmin, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL manquante' });
  try {
    const data = await scrapeProduct(url);
    if (!data.title) return res.status(422).json({ error: "Impossible d'extraire les données. Essaie l'ajout manuel." });
    const item = await db.createItem(data);
    res.json(item);
  } catch (e) {
    console.error('Scrape error:', e.message);
    const status = e.response?.status;
    const msg = (status === 403 || status === 429)
      ? "Ce site bloque les robots. Utilise l'ajout manuel."
      : "Erreur : " + e.message;
    res.status(500).json({ error: msg });
  }
});

app.post('/api/items', requireAdmin, async (req, res) => {
  const { title, price, image, url } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre obligatoire' });
  const item = await db.createItem({
    title, url: url || null, image: image || null,
    price: price ? parseFloat(String(price).replace(',', '.')) : null,
  });
  res.json(item);
});

app.delete('/api/items/:id', requireAdmin, async (req, res) => {
  await db.deleteItem(req.params.id);
  res.json({ ok: true });
});

// ── Participants routes ──────────────────────────────────────

// Rejoindre un cadeau
app.post('/api/items/:id/join', optionalAuth, async (req, res) => {
  const { name } = req.body;
  const userId   = req.user?.id || null;
  const finalName = req.user?.pseudo || name;

  if (!finalName) return res.status(400).json({ error: 'Prénom requis' });

  await db.addParticipant(req.params.id, finalName, userId);
  const item = await db.getItem(req.params.id);
  res.json(item);
});

// Quitter un cadeau
app.delete('/api/items/:id/join', optionalAuth, async (req, res) => {
  const { name } = req.body;
  const userId   = req.user?.id || null;
  const finalName = req.user?.pseudo || name;

  await db.removeParticipant(req.params.id, finalName, userId);
  const item = await db.getItem(req.params.id);
  res.json(item);
});

// ── Start ────────────────────────────────────────────────────

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

db.initDB().then(() => {
  app.listen(PORT, () => console.log(`✓ Wishlist → http://localhost:${PORT}`));
}).catch(e => { console.error('DB init failed:', e); process.exit(1); });
