// GET /sitemap.xml — páginas indexáveis + todos os posts do blog (WordPress).
// Páginas com noindex (minha-conta, booking, admin, assinaturas, termos, política) ficam de fora.

const { SITE_URL, wpFetch, escapeHtml, postUrl } = require('./_lib/wp');

const STATIC_PAGES = [
  { path: '/',                                    priority: '1.0', changefreq: 'weekly' },
  { path: '/corte-de-cabelo-masculino-blumenau',  priority: '0.9', changefreq: 'monthly' },
  { path: '/barba-blumenau',                      priority: '0.9', changefreq: 'monthly' },
  { path: '/limpeza-de-pele-masculina-blumenau',  priority: '0.9', changefreq: 'monthly' },
  { path: '/sobrancelha-masculina-blumenau',      priority: '0.9', changefreq: 'monthly' },
  { path: '/blog',                                priority: '0.8', changefreq: 'daily' },
  { path: '/store',                               priority: '0.6', changefreq: 'weekly' },
];

async function fetchAllPosts() {
  const fields = '_fields=slug,modified_gmt';
  const first = await wpFetch(`per_page=100&page=1&${fields}`);
  let posts = first.data;
  for (let page = 2; page <= first.totalPages; page++) {
    const next = await wpFetch(`per_page=100&page=${page}&${fields}`);
    posts = posts.concat(next.data);
  }
  return posts;
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return `  <url>
    <loc>${escapeHtml(loc)}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}${changefreq ? `
    <changefreq>${changefreq}</changefreq>` : ''}${priority ? `
    <priority>${priority}</priority>` : ''}
  </url>`;
}

module.exports = async function handler(req, res) {
  let posts = [];
  let ok = true;
  try {
    posts = await fetchAllPosts();
  } catch (err) {
    ok = false;
    console.error('[sitemap] WP fetch failed:', err.message);
  }

  const entries = [
    ...STATIC_PAGES.map(p => urlEntry({ loc: `${SITE_URL}${p.path}`, changefreq: p.changefreq, priority: p.priority })),
    ...posts.map(p => urlEntry({
      loc: `${SITE_URL}${postUrl(p.slug)}`,
      lastmod: p.modified_gmt ? `${p.modified_gmt}Z` : undefined,
      priority: '0.7',
    })),
  ];

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', ok
    ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
    : 'public, max-age=0, s-maxage=60');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`);
};
