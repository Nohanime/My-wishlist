const express = require('express');
const axios   = require('axios');
const cheerio = require('cheerio');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app      = express();
const PORT     = process.env.PORT || 3000;
const DB_PATH  = path.join(__dirname, '../data.json');

// ── DB ───────────────────────────────────────────────────────
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return { items: [], nextId: 1 };
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch { return { items: [], nextId: 1 }; }
}
function writeDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ── SCRAPING ─────────────────────────────────────────────────

// Prix : trouve "49,99" ou "49.99" ou "49€" n'importe où dans le texte
// Retourne un float ex: 49.99
function extractPrice(raw) {
  if (!raw) return null;
  // Supprime espaces insécables et normaux
  const s = raw.replace(/[\s\u00a0\u202f]/g, '');
  // Format européen  "1 249,99" → cherche ddd,dd ou ddd.dd
  const m = s.match(/(\d{1,6})[.,](\d{2})(?!\d)/);
  if (m) return parseFloat(m[1] + '.' + m[2]);
  // Entier seul
  const n = s.match(/(\d{1,6})/);
  if (n) return parseFloat(n[1]);
  return null;
}

// Trouve le prix le plus pertinent dans une liste de candidats texte
function bestPrice(candidates) {
  for (const raw of candidates) {
    const p = extractPrice(raw);
    if (p && p > 0.5 && p < 50000) return p;
  }
  return null;
}

function absoluteUrl(src, base) {
  if (!src) return null;
  src = src.trim();
  if (src.startsWith('data:')) return null;
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return 'https:' + src;
  try { return new URL(src, base).href; } catch { return null; }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function scrapeProduct(rawUrl) {
  const resp = await axios.get(rawUrl, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
    },
    timeout: 15000,
    maxRedirects: 5,
    decompress: true,
  });

  const html = resp.data;
  const $    = cheerio.load(html);
  const host = new URL(rawUrl).hostname.replace(/^www\./, '');

  // ── Helpers ────────────────────────────────────────────────
  const og    = (p) => $(`meta[property="og:${p}"]`).attr('content') || $(`meta[name="og:${p}"]`).attr('content') || '';
  const meta  = (n) => $(`meta[name="${n}"]`).attr('content') || $(`meta[property="${n}"]`).attr('content') || '';
  const itprop = (p) => $(`[itemprop="${p}"]`).attr('content') || $(`[itemprop="${p}"]`).first().text() || '';

  let title = null, price = null, image = null;

  // ── Titre : og:title est fiable sur tous les sites ────────
  title = og('title') || meta('twitter:title') || $('title').text() || $('h1').first().text();
  title = title.trim().replace(/\s+/g, ' ').slice(0, 140);

  // ── Image : og:image est fiable sur tous les sites ────────
  image = og('image') || og('image:url') || meta('twitter:image');
  image = absoluteUrl(image, rawUrl);

  // ── Prix : stratégie par site puis fallback générique ─────

  if (host.includes('amazon')) {
    // Amazon rend le HTML statiquement pour les prix
    const dynRaw = $('#landingImage, #imgBlkFront').attr('data-a-dynamic-image');
    if (dynRaw) {
      try { const imgs = Object.keys(JSON.parse(dynRaw)); if (imgs.length) image = absoluteUrl(imgs[0], rawUrl); } catch {}
    }
    if (!image) image = absoluteUrl($('#landingImage, #imgBlkFront').attr('src'), rawUrl);

    // Prix Amazon : .a-offscreen contient "49,99 €" avec centimes
    price = bestPrice([
      $('.a-price .a-offscreen').first().text(),
      $('#priceblock_ourprice').text(),
      $('#priceblock_dealprice').text(),
      $('[data-a-color="price"] .a-offscreen').first().text(),
      $('.a-price-whole').first().text() + ',' + $('.a-price-fraction').first().text(),
    ]);

  } else if (host.includes('fnac')) {
    // Fnac : titre og ok, prix dans JSON-LD ou meta
    price = bestPrice([
      meta('product:price:amount'),
      itprop('price'),
      $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get()
        .flatMap(json => { try { const d = JSON.parse(json); return [d?.offers?.price, d?.offers?.lowPrice].map(String); } catch { return []; } })
        .find(p => p && p !== 'undefined') || '',
      $('.f-priceBox-price').first().text(),
      $('[class*="price"]').first().text(),
    ]);

  } else if (host.includes('cdiscount')) {
    price = bestPrice([
      meta('product:price:amount'),
      itprop('price'),
      $('[class*="price"]').first().text(),
      $('.prdtBILLprice').text(),
    ]);

  } else if (host.includes('ldlc')) {
    price = bestPrice([
      itprop('price'),
      meta('product:price:amount'),
      $('.price strong').text(),
      $('.price').first().text(),
    ]);

  } else if (host.includes('boulanger')) {
    price = bestPrice([
      meta('product:price:amount'),
      itprop('price'),
      $('[class*="price"]').first().text(),
    ]);

  } else if (host.includes('darty')) {
    price = bestPrice([
      meta('product:price:amount'),
      itprop('price'),
      $('[class*="price"]').first().text(),
      $('[data-price]').attr('data-price') || '',
    ]);

  } else {
    // ── Fallback générique ────────────────────────────────────
    // 1. JSON-LD structured data (le plus fiable)
    const jsonlds = $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get();
    for (const json of jsonlds) {
      try {
        const d = JSON.parse(json);
        const p = d?.offers?.price ?? d?.offers?.[0]?.price ?? d?.price;
        if (p) { price = bestPrice([String(p)]); if (price) break; }
      } catch {}
    }

    // 2. Microdata itemprop
    if (!price) price = bestPrice([itprop('price'), meta('product:price:amount')]);

    // 3. Sélecteurs CSS communs
    if (!price) {
      for (const sel of ['[class*="price"]', '[class*="Price"]', '[id*="price"]', '[data-testid*="price"]']) {
        const txt = $(sel).first().text();
        price = bestPrice([txt]);
        if (price) break;
      }
    }
  }

  // Fallback image : première grande image si og:image vide
  if (!image) {
    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
      const w   = parseInt($(el).attr('width') || '0');
      const h   = parseInt($(el).attr('height') || '0');
      if (src && (w > 200 || h > 200 || src.match(/product|item|article|main/i))) {
        image = absoluteUrl(src, rawUrl);
        return false;
      }
    });
  }

  return {
    title: title || null,
    price: price !== null ? price : null,   // float or null
    image: image || null,
    url: rawUrl,
  };
}

// ── ROUTES ───────────────────────────────────────────────────

app.get('/api/items', (req, res) => {
  res.json(readDB().items);
});

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL manquante' });
  try {
    const data = await scrapeProduct(url);
    if (!data.title) return res.status(422).json({ error: "Impossible d'extraire les données. Essaie l'ajout manuel (✏️)." });
    const db   = readDB();
    const item = { id: db.nextId++, ...data, reserved: false, reserved_by: null, created_at: new Date().toISOString() };
    db.items.unshift(item);
    writeDB(db);
    res.json(item);
  } catch (e) {
    console.error('Scrape error:', e.message);
    const status = e.response?.status;
    const msg = status === 403 || status === 429
      ? "Ce site bloque les robots. Utilise l'ajout manuel (✏️)."
      : "Erreur : " + e.message + ". Essaie l'ajout manuel (✏️).";
    res.status(500).json({ error: msg });
  }
});

app.post('/api/items', (req, res) => {
  const { title, price, image, url } = req.body;
  if (!title) return res.status(400).json({ error: 'Titre obligatoire' });
  const db   = readDB();
  const item = {
    id: db.nextId++, title,
    price: price ? parseFloat(String(price).replace(',', '.')) : null,
    image: image || null, url: url || null,
    reserved: false, reserved_by: null, created_at: new Date().toISOString()
  };
  db.items.unshift(item);
  writeDB(db);
  res.json(item);
});

app.patch('/api/items/:id/reserve', (req, res) => {
  const id   = parseInt(req.params.id);
  const { name } = req.body;
  const db   = readDB();
  const item = db.items.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Introuvable' });
  if (item.reserved) { item.reserved = false; item.reserved_by = null; }
  else { if (!name) return res.status(400).json({ error: 'Prénom requis' }); item.reserved = true; item.reserved_by = name; }
  writeDB(db);
  res.json(item);
});

app.delete('/api/items/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const db = readDB();
  db.items  = db.items.filter(i => i.id !== id);
  writeDB(db);
  res.json({ ok: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

app.listen(PORT, () => console.log(`✓ Wishlist → http://localhost:${PORT}`));
