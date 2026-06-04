'use strict';
const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET  = process.env.CRON_SECRET;

function fetchPage(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 8) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    try {
      const parsed = new URL(url);
      const req = lib.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let next = res.headers.location;
          if (!next.startsWith('http')) next = `${parsed.protocol}//${parsed.hostname}${next}`;
          res.resume();
          return fetchPage(next, depth + 1).then(resolve).catch(reject);
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    } catch (e) { reject(e); }
  });
}

function extractPrice(html) {
  const itemIdMatch = html.match(/"item_id":"(MLB\d+)"/);
  if (!itemIdMatch) return null;
  const idx = html.indexOf(itemIdMatch[1]);
  const win = html.slice(idx, idx + 4000);
  const priceM = win.match(/"current_price":\{"value":([\d.]+)/);
  const origM  = win.match(/"original_price":\{"value":([\d.]+)/);
  return {
    preco:          priceM ? parseFloat(priceM[1]) : null,
    preco_original: origM  ? parseFloat(origM[1])  : null,
  };
}

function sbFetch(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${SUPABASE_URL}/rest/v1${path}`);
    const bodyBuf = opts.body ? Buffer.from(opts.body) : null;
    const headers = {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    };
    if (bodyBuf) headers['Content-Length'] = bodyBuf.length;

    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve({ ok: res.statusCode < 300, data: JSON.parse(text) }); }
        catch { resolve({ ok: res.statusCode < 300, data: text }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Supabase timeout')); });
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  // Protege o endpoint com segredo opcional
  if (CRON_SECRET && req.headers['authorization'] !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { checked: 0, updated: 0, errors: [] };

  try {
    const { data: products } = await sbFetch(
      '/store_products?select=id,nome,link,preco,preco_original&ativo=eq.true&link=not.is.null'
    );

    if (!Array.isArray(products)) {
      return res.status(500).json({ error: 'Falha ao buscar produtos', raw: products });
    }

    for (const p of products) {
      const isMl = p.link && (p.link.includes('meli.la') || p.link.includes('mercadolivre.com'));
      if (!isMl) continue;

      results.checked++;
      try {
        const html = await fetchPage(p.link);
        const extracted = extractPrice(html);
        if (!extracted || !extracted.preco) continue;

        const updates = {};
        if (Math.abs(extracted.preco - (p.preco || 0)) >= 0.01) {
          updates.preco = extracted.preco;
        }
        if (extracted.preco_original !== null &&
            Math.abs((extracted.preco_original || 0) - (p.preco_original || 0)) >= 0.01) {
          updates.preco_original = extracted.preco_original;
        }

        if (Object.keys(updates).length) {
          updates.updated_at = new Date().toISOString();
          await sbFetch(`/store_products?id=eq.${p.id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
            headers: { 'Prefer': 'return=minimal' },
          });
          results.updated++;
          console.log(`[price-check] ${p.nome}: R$${p.preco} → R$${extracted.preco}`);
        }
      } catch (err) {
        results.errors.push({ id: p.id, nome: p.nome, error: err.message });
        console.error(`[price-check] erro em ${p.nome}:`, err.message);
      }
    }

    console.log('[price-check] concluído:', JSON.stringify(results));
    res.status(200).json({ ok: true, ...results });
  } catch (err) {
    console.error('[price-check] fatal:', err.message);
    res.status(500).json({ error: err.message });
  }
};
