const axios   = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SCRAPFLY_KEY = process.env.SCRAPFLY_KEY || '';

// ── Helpers ───────────────────────────────────────────────────

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
  const text  = (html || '').slice(0, 5000).toLowerCase();
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
    this.name  = 'BotBlockedError';
    this.host  = host;
  }
}

// ── Extraction depuis le HTML parsé ──────────────────────────
// Appelée aussi bien sur le HTML récupéré directement que sur
// celui fourni par Scrapfly — même logique, un seul endroit.
function extractFromHtml(html, rawUrl) {
  const $    = cheerio.load(html);
  const host = new URL(rawUrl).hostname.replace(/^www\./, '');

  const og     = (p) => $(`meta[property="og:${p}"]`).attr('content') || '';
  const meta   = (n) => $(`meta[name="${n}"]`).attr('content') || $(`meta[property="${n}"]`).attr('content') || '';
  const itprop = (p) => $(`[itemprop="${p}"]`).attr('content') || $(`[itemprop="${p}"]`).first().text() || '';

  let title = (og('title') || meta('twitter:title') || $('h1').first().text() || $('title').text())
                .trim().replace(/\s+/g, ' ').slice(0, 140);
  let image = absoluteUrl(og('image') || og('image:url') || meta('twitter:image'), rawUrl);
  let price = null;

  if (host.includes('amazon')) {
    // Amazon hi-res image
    const dynRaw = $('#landingImage, #imgBlkFront').attr('data-a-dynamic-image');
    if (dynRaw) {
      try {
        const imgs = Object.keys(JSON.parse(dynRaw));
        if (imgs.length) image = imgs[imgs.length - 1]; // dernière = plus grande résolution
      } catch {}
    }
    if (!image) image = absoluteUrl($('#landingImage, #imgBlkFront').attr('src'), rawUrl);

    // Titre Amazon : #productTitle est plus propre que og:title (qui contient "Amazon.fr : ...")
    const amazonTitle = $('#productTitle').text().trim();
    if (amazonTitle) title = amazonTitle.slice(0, 140);

    price = bestPrice([
      $('.a-price .a-offscreen').first().text(),
      $('#priceblock_ourprice').text(),
      $('#priceblock_dealprice').text(),
      $('[data-a-color="price"] .a-offscreen').first().text(),
      $('.a-price-whole').first().text() + ',' + $('.a-price-fraction').first().text(),
    ]);
  } else {
    // JSON-LD — le plus fiable sur Fnac, Cdiscount, LDLC, Boulanger, Darty…
    const jsonlds = $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get();
    for (const json of jsonlds) {
      try {
        const d = JSON.parse(json);
        const p = d?.offers?.price ?? d?.offers?.[0]?.price ?? d?.price;
        if (p !== undefined && p !== null) {
          price = bestPrice([String(p)]);
          if (price) break;
        }
      } catch {}
    }
    if (!price) price = bestPrice([itprop('price'), meta('product:price:amount')]);
    if (!price) {
      for (const sel of ['[class*="price"]','[class*="Price"]','[id*="price"]','[data-testid*="price"]']) {
        price = bestPrice([$(`${sel}`).first().text()]);
        if (price) break;
      }
    }

    // Fallback image
    if (!image) {
      $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        const w   = parseInt($(el).attr('width')  || '0');
        const h   = parseInt($(el).attr('height') || '0');
        if (src && !src.startsWith('data:') && (w > 200 || h > 200 || /product|item|article|main/i.test(src))) {
          image = absoluteUrl(src, rawUrl);
          return false;
        }
      });
    }
  }

  return { title: title || null, price: price ?? null, image: image || null };
}

// ── Méthode 1 : requête directe ───────────────────────────────
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

  const extracted = extractFromHtml(resp.data, rawUrl);
  if (!extracted.title && !extracted.price) throw new BotBlockedError(host);

  return { ...extracted, url: rawUrl };
}

// ── Méthode 2 : Scrapfly (vrai Chrome, contourne les anti-bots) ──
// Coût par requête :
//   - Sites normaux  : ~1 crédit
//   - Sites avec JS  : ~5 crédits  (render_js: true)
//   - Amazon & co    : ~50 crédits (asp: true = anti-scraping protection bypass)
// Plan gratuit : 1000 crédits/mois renouvelés
async function scrapeViaScrapfly(rawUrl) {
  if (!SCRAPFLY_KEY) {
    throw new Error('SCRAPFLY_KEY non configurée');
  }

  const host        = new URL(rawUrl).hostname.replace(/^www\./, '');
  const needsAsp    = /amazon|cdiscount|fnac|maxesport|boulanger|darty|ldlc/.test(host);
  const needsRender = !needsAsp && /javascript|react|vue|angular/.test(host);

  const params = new URLSearchParams({
    key:        SCRAPFLY_KEY,
    url:        rawUrl,
    render_js:  String(needsAsp || needsRender), // rend le JS si nécessaire
    asp:        String(needsAsp),                // anti-scraping bypass pour les gros sites
    country:    'fr',                             // IP française → prix en €
    lang:       'fr-FR',
  });

  const apiUrl = `https://api.scrapfly.io/scrape?${params}`;
  const resp   = await axios.get(apiUrl, { timeout: 30000 });

  if (resp.data?.result?.status_code === 200) {
    const html      = resp.data.result.content;
    const extracted = extractFromHtml(html, rawUrl);

    if (!extracted.title) {
      throw new Error('Scrapfly a récupéré la page mais impossible d\'en extraire le titre.');
    }

    return { ...extracted, url: rawUrl };
  }

  const scrapflyStatus = resp.data?.result?.status_code;
  throw new Error(`Scrapfly a retourné le statut ${scrapflyStatus} pour cette URL.`);
}

// ── Point d'entrée principal ──────────────────────────────────
// Ordre : direct → Scrapfly (si dispo) → opengraph.io (dernier recours)
async function scrapeProduct(rawUrl) {
  // 1. Essai direct
  try {
    return await scrapeDirectly(rawUrl);
  } catch (e) {
    if (!(e instanceof BotBlockedError)) throw e;
    // Site bloqué → on passe à la suite
  }

  // 2. Scrapfly si la clé est configurée
  if (SCRAPFLY_KEY) {
    try {
      console.log(`[scraper] Scrapfly fallback pour ${rawUrl}`);
      return await scrapeViaScrapfly(rawUrl);
    } catch (e) {
      console.error('[scraper] Scrapfly error:', e.message);
      // Pas fatal — on essaie opengraph.io en dernier recours
    }
  }

  // 3. opengraph.io — dernier recours (titre + image, sans prix)
  try {
    console.log(`[scraper] opengraph.io fallback pour ${rawUrl}`);
    const encoded = encodeURIComponent(rawUrl);
    const apiUrl  = `https://opengraph.io/api/1.1/site/${encoded}?app_id=sample_app_id`;
    const resp    = await axios.get(apiUrl, { timeout: 20000 });
    const og      = resp.data?.openGraph || {};
    const hy      = resp.data?.hybridGraph || {};

    const title = (hy.title || og.title || '').trim().slice(0, 140) || null;
    const image = hy.image || og.image?.url || og.image || null;

    if (!title && !image) throw new Error('opengraph.io: aucune donnée');

    // partial=true → le frontend ouvrira la modale d'édition sur le champ prix
    return {
      title,
      price: null,
      image: typeof image === 'string' ? image : null,
      url: rawUrl,
      partial: true,
    };
  } catch (e2) {
    // Tout a échoué
    const err     = new Error(
      'Impossible de récupérer les infos automatiquement. ' +
      (SCRAPFLY_KEY
        ? 'Vérifie que ta clé SCRAPFLY_KEY est valide dans Railway.'
        : 'Ajoute ta clé SCRAPFLY_KEY dans Railway pour améliorer la récupération.') +
      ' Tu peux aussi utiliser l\'ajout manuel (✏️).'
    );
    err.botBlocked = true;
    throw err;
  }
}

// Re-scrape uniquement le prix (pour la mise à jour auto quotidienne).
// Essaie Scrapfly si disponible, sinon direct seulement.
async function scrapePriceOnly(rawUrl) {
  try {
    const data = await scrapeDirectly(rawUrl);
    return data.price;
  } catch {
    if (SCRAPFLY_KEY) {
      try {
        const data = await scrapeViaScrapfly(rawUrl);
        return data.price;
      } catch {}
    }
    return null;
  }
}

module.exports = { scrapeProduct, scrapePriceOnly, BotBlockedError };
