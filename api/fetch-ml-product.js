'use strict';
const https = require('https');
const http = require('http');

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
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
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
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout ao carregar o produto')); });
      req.end();
    } catch (e) { reject(e); }
  });
}

function extract(html) {
  const m = (re) => (html.match(re) || [])[1] || '';

  const ogTitle = m(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) ||
                  m(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/);
  const ogImage = m(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) ||
                  m(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/);

  // Detecta link de perfil da loja (não de produto)
  if (ogTitle.toLowerCase().includes('perfil social') ||
      ogTitle === 'Mercado Livre Brasil - Onde comprar e vender de Tudo') {
    return { _socialProfile: true };
  }

  const itemIdMatch = html.match(/"item_id":"(MLB\d+)"/);
  if (!itemIdMatch) {
    return ogTitle
      ? { nome: ogTitle, imagem: ogImage, preco: null, preco_original: null, avaliacao: 0, avaliacoes: 0 }
      : { _noProduct: true };
  }

  const itemId = itemIdMatch[1];
  const idx = html.indexOf(itemId);
  const win = html.slice(idx, idx + 4000);

  const priceM  = win.match(/"current_price":\{"value":([\d.]+)/);
  const origM   = win.match(/"original_price":\{"value":([\d.]+)/);
  const ratingM = win.match(/"average":([\d.]+),"total":(\d+)/);
  const picM    = win.match(/"pictures":\[.*?"id":"([^"]+)"/);
  const titleM  = win.match(/"title":\{"text":"([^"]+)"/);

  return {
    nome:           (titleM ? titleM[1] : ogTitle) || '',
    imagem:         picM ? `https://http2.mlstatic.com/D_NQ_NP_${picM[1]}-O.webp` : ogImage,
    preco:          priceM ? parseFloat(priceM[1]) : null,
    preco_original: origM  ? parseFloat(origM[1])  : null,
    avaliacao:      ratingM ? parseFloat(ratingM[1]) : 0,
    avaliacoes:     ratingM ? parseInt(ratingM[2], 10) : 0,
    item_id:        itemId,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  let body = '';
  await new Promise(r => { req.on('data', c => body += c); req.on('end', r); });

  try {
    const { url } = JSON.parse(body || '{}');
    if (!url) return res.status(400).json({ error: 'URL é obrigatória' });

    const html = await fetchPage(url);
    const product = extract(html);

    if (product._socialProfile) {
      return res.status(422).json({
        error: 'Este link é do perfil da loja, não de um produto específico. Use o link de um produto individual (ex: link gerado no ML para um item).',
      });
    }
    if (product._noProduct || !product.nome) {
      return res.status(422).json({ error: 'Nenhum produto encontrado nesta página. Verifique o link.' });
    }

    res.status(200).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro interno ao buscar produto' });
  }
};
