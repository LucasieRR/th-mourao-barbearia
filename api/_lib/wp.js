// Helpers compartilhados pelas funções que renderizam o blog no servidor
// (blog.js, blog-post.js, sitemap.js). Os posts vêm do WordPress.com.

const fs   = require('fs');
const path = require('path');

const SITE_URL = 'https://www.thmourao.com.br';
const WP_SITE  = 'thmourao4.wordpress.com';
const WP_API   = `https://public-api.wordpress.com/wp/v2/sites/${WP_SITE}/posts`;
const HIDDEN_CATS = ['uncategorized', 'sem categoria', 'sem-categoria'];

// Cache de borda: 10 min fresco, até 1 dia servindo stale enquanto revalida
const CACHE_OK   = 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400';
const CACHE_FAIL = 'public, max-age=0, s-maxage=30';

const templates = {};
function readTemplate(file) {
  if (!templates[file]) {
    templates[file] = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
  }
  return templates[file];
}

async function wpFetch(query, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${WP_API}?${query}`, { signal: ctrl.signal });
    if (!res.ok) {
      const err = new Error(`WP API ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return {
      data: await res.json(),
      total: parseInt(res.headers.get('x-wp-total'), 10) || 0,
      totalPages: parseInt(res.headers.get('x-wp-totalpages'), 10) || 1,
    };
  } finally {
    clearTimeout(timer);
  }
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
function decodeEntities(str = '') {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

function escapeHtml(str = '') {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function plainText(html = '') {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function truncate(text, max = 160) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function postUrl(slug) {
  return `/blog/${encodeURIComponent(slug)}`;
}

// Links internos entre posts apontam para o WordPress — reescreve para o site
function rewriteWpLinks(html = '') {
  const re = new RegExp(`https?://${WP_SITE.replace(/\./g, '\\.')}/\\d{4}/\\d{2}/\\d{2}/([^/"'?#]+)/?`, 'g');
  return html.replace(re, (_, slug) => `${SITE_URL}/blog/${slug}`);
}

function extractPost(post) {
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  const categories = (post._embedded?.['wp:term']?.[0] || [])
    .map(c => decodeEntities(c.name))
    .filter(c => !HIDDEN_CATS.includes(c.toLowerCase()));
  return {
    slug: post.slug,
    titleHtml: post.title?.rendered || 'Sem título',
    title: decodeEntities(post.title?.rendered || 'Sem título'),
    excerpt: plainText(post.excerpt?.rendered || ''),
    content: rewriteWpLinks(post.content?.rendered || ''),
    dateISO: post.date_gmt ? `${post.date_gmt}Z` : post.date,
    modifiedISO: post.modified_gmt ? `${post.modified_gmt}Z` : post.modified,
    dateLabel: new Date(post.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    featuredImage: media?.source_url || null,
    imageAlt: media?.alt_text || '',
    categories,
    author: post._embedded?.author?.[0]?.name || 'TH Mourão',
  };
}

// Substitui um trecho obrigatório do template; lança erro se o marcador sumir
// (o handler então cai para o template estático renderizado no cliente).
function replaceOnce(html, search, replacement) {
  const idx = typeof search === 'string' ? html.indexOf(search) : html.search(search);
  if (idx === -1) throw new Error(`Template marker not found: ${search}`);
  return html.replace(search, typeof replacement === 'function' ? replacement : () => replacement);
}

module.exports = {
  SITE_URL, CACHE_OK, CACHE_FAIL,
  readTemplate, wpFetch, extractPost,
  escapeHtml, plainText, truncate, postUrl, replaceOnce,
};
