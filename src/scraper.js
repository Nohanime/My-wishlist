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

  const $    = cheerio.load(resp.data);
  const host = new URL(rawUrl).hostname.replace(/^www\./, '');

  const og     = (p) => $(`meta[property="og:${p}"]`).attr('content') || '';
  const meta   = (n) => $(`meta[name="${n}"]`).attr('content') || $(`meta[property="${n}"]`).attr('content') || '';
  const itprop = (p) => $(`[itemprop="${p}"]`).attr('content') || $(`[itemprop="${p}"]`).first().text() || '';

  // Titre & image : og: tags toujours présents dans le HTML statique
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
    // JSON-LD — fonctionne sur Fnac, Cdiscount, LDLC, Boulanger, Darty...
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

  // Fallback image
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

  return { title: title || null, price: price ?? null, image: image || null, url: rawUrl };
}

module.exports = { scrapeProduct };
