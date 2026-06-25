const axios   = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function extractPrice(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[\s\u00a0\u202f]/g, '');
  const m = s.match(/(\d{1,6})[.,](\d{2})(?!\d)/);
  if (m) return parseFloat(m[1] + '.' + m[2]);
  const n = s.match(/^(\d{1,6})$/);
  if (n) return parseFloat(n[1]);
  return null;
}

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

function detectBotWall(html, $) {
  const text = (html || '').slice(0, 5000).toLowerCase();
  const title = ($('title').text() || '').toLowerCase();
  const signals = [
    'checking your browser','just a moment','cf-browser-verification',
    'cloudflare','attention required','ddos protection by',
    'enable javascript and cookies','verify you are human',
    'access denied','request blocked','datadome','perimeterx',
    'are you a robot','captcha','bot detection',
  ];
  const titleSignals = ['just a moment','access denied','attention required','are you human'];
  if (titleSignals.some(s => title.includes(s))) return true;
  if (html.length < 3000 && signals.some(s => text.includes(s))) return true;
  return false;
}

class BotBlockedError extends Error {
  constructor(host) {
    super(`Le site ${host} bloque la récupération automatique.`);
    this.name = 'BotBlockedError';
    this.host = host;
  }
}

// ── Scraping direct ───────────────────────────────────────────
async function scrapeDirectly(rawUrl) {
  const resp = await axios.get(rawUrl, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'fr-FR,fr;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Sec-Fetch-Mode': 'navigate',
      'Upgrade-Insecure-Requests': '1',
    },
    timeout: 15000,
    maxRedirects: 5,
    decompress: true,
    validateStatus: s => s < 500,
  });

  const host = new URL(rawUrl).hostname.replace(/^www\./, '');
  if (resp.status === 403 || resp.status === 429) throw new BotBlockedError(host);

  const $ = cheerio.load(resp.data);
  if (detectBotWall(resp.data, $)) throw new BotBlockedError(host);

  const og     = (p) => $(`meta[property="og:${p}"]`).attr('content') || '';
  const meta   = (n) => $(`meta[name="${n}"]`).attr('content') || $(`meta[property="${n}"]`).attr('content') || '';
  const itprop = (p) => $(`[itemprop="${p}"]`).attr('content') || $(`[itemprop="${p}"]`).first().text() || '';

  let title = (og('title') || meta('twitter:title') || $('h1').first().text() || $('title').text()).trim().replace(/\s+/g, ' ').slice(0, 140);
  let image = absoluteUrl(og('image') || og('image:url') || meta('twitter:image'), rawUrl);
  let price = null;

  if (host.includes('amazon')) {
    const dynRaw = $('#landingImage, #imgBlkFront').attr('data-a-dynamic-image');
    if (dynRaw) {
      try { const imgs = Object.keys(JSON.parse(dynRaw)); if (imgs.length) image = imgs[0]; } catch {}
    }
    if (!image) image = absoluteUrl($('#landingImage, #imgBlkFront').attr('src'), rawUrl);
    price = bestPrice([
      $('.a-price .a-offscreen').first().text(),
      $('#priceblock_ourprice').text(),
      $('#priceblock_dealprice').text(),
      $('.a-price-whole').first().text() + ',' + $('.a-price-fraction').first().text(),
    ]);
  } else {
    const jsonlds = $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get();
    for (const json of jsonlds) {
      try {
        const d = JSON.parse(json);
        const p = d?.offers?.price ?? d?.offers?.[0]?.price ?? d?.price;
        if (p !== undefined && p !== null) { price = bestPrice([String(p)]); if (price) break; }
      } catch {}
    }
    if (!price) price = bestPrice([itprop('price'), meta('product:price:amount')]);
    if (!price) {
      for (const sel of ['[class*="price"]', '[class*="Price"]', '[id*="price"]', '[data-testid*="price"]']) {
        price = bestPrice([$(`${sel}`).first().text()]);
        if (price) break;
      }
    }
  }

  if (!image) {
    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      const w = parseInt($(el).attr('width') || '0');
      const h = parseInt($(el).attr('height') || '0');
      if (src && !src.startsWith('data:') && (w > 200 || h > 200 || /product|item|article|main/i.test(src))) {
        image = absoluteUrl(src, rawUrl); return false;
      }
    });
  }

  if (!title && !price) throw new BotBlockedError(host);

  return { title: title || null, price: price ?? null, image: image || null, url: rawUrl };
}

// ── Fallback : opengraph.io (gratuit, pas de clé requise) ─────
// Leur service fait tourner un vrai Chromium côté serveur — passe
// les protections anti-bot basiques comme Cloudflare JS Challenge.
// Limité à 500 req/mois sur le plan gratuit, ce qui est largement
// suffisant pour un usage personnel.
async function scrapeViaOpenGraph(rawUrl) {
  const encoded = encodeURIComponent(rawUrl);
  const apiUrl  = `https://opengraph.io/api/1.1/site/${encoded}?app_id=sample_app_id`;

  const resp = await axios.get(apiUrl, { timeout: 20000 });
  const data = resp.data;

  const og = data?.openGraph || {};
  const hy = data?.hybridGraph || {};

  const title = (hy.title || og.title || '').trim().slice(0, 140) || null;
  const image = hy.image || og.image?.url || og.image || null;
  // opengraph.io ne récupère généralement pas le prix — on retourne null
  // et l'utilisateur le saisit manuellement dans le champ pré-ouvert.
  const price = null;

  if (!title && !image) throw new Error('Aucune donnée récupérée via opengraph.io');

  return { title, price, image: typeof image === 'string' ? image : null, url: rawUrl };
}

// ── Point d'entrée principal ──────────────────────────────────
async function scrapeProduct(rawUrl) {
  try {
    return await scrapeDirectly(rawUrl);
  } catch (e) {
    if (e instanceof BotBlockedError || e.name === 'BotBlockedError') {
      // Fallback vers opengraph.io
      try {
        const result = await scrapeViaOpenGraph(rawUrl);
        // On marque le résultat comme "partiel" (pas de prix) pour que
        // le frontend sache qu'il faut demander le prix à l'utilisateur.
        return { ...result, partial: true };
      } catch (e2) {
        // Les deux méthodes ont échoué — on remonte l'erreur originale
        // avec un message clair et le flag botBlocked pour le frontend.
        const err = new Error(
          `Impossible de récupérer les infos automatiquement (${e.host}). Titre et image pré-remplis si disponibles, vérifie et complète le prix manuellement.`
        );
        err.botBlocked = true;
        throw err;
      }
    }
    throw e;
  }
}

async function scrapePriceOnly(rawUrl) {
  try {
    const data = await scrapeDirectly(rawUrl);
    return data.price;
  } catch { return null; }
}

module.exports = { scrapeProduct, scrapePriceOnly, BotBlockedError };
