// GET /blog/:slug — renderiza o post no servidor (title, description,
// canonical, Open Graph e JSON-LD BlogPosting) usando blog-post.html como template.
// Também redireciona a URL antiga /blog-post.html?slug=... para /blog/:slug.

const {
  SITE_URL, CACHE_OK, CACHE_FAIL,
  readTemplate, wpFetch, extractPost, escapeHtml, truncate, postUrl, replaceOnce,
} = require('./_lib/wp');

function headTags(post, url, description) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: truncate(post.title, 110),
    description,
    datePublished: post.dateISO,
    dateModified: post.modifiedISO,
    author: { '@type': 'Person', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'TH Mourão Barbearia & Spa',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    inLanguage: 'pt-BR',
  };
  if (post.featuredImage) jsonLd.image = [post.featuredImage];

  const image = post.featuredImage || `${SITE_URL}/assets/foto-vista.jpg`;
  return `<link rel="canonical" href="${escapeHtml(url)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="TH Mourão Barbearia & Spa" />
  <meta property="og:title" content="${escapeHtml(post.title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(url)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:locale" content="pt_BR" />
  <meta property="article:published_time" content="${escapeHtml(post.dateISO)}" />
  ${post.featuredImage ? `<link rel="preload" as="image" href="${escapeHtml(post.featuredImage)}" fetchpriority="high" />` : ''}
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`;
}

function render(template, post) {
  const url = `${SITE_URL}${postUrl(post.slug)}`;
  const description = truncate(post.excerpt, 160);
  let html = template;

  html = replaceOnce(html, /<title id="page-title">[^<]*<\/title>/,
    `<title id="page-title">${escapeHtml(post.title)} | Blog TH Mourão</title>`);
  html = replaceOnce(html, /<meta name="description" id="page-desc" content="[^"]*" \/>/,
    `<meta name="description" id="page-desc" content="${escapeHtml(description)}" />`);
  html = replaceOnce(html, '<!--SSR:HEAD-->', headTags(post, url, description));

  html = replaceOnce(html, '<div id="post-skeleton" style="padding-bottom: 64px;">',
    '<div id="post-skeleton" style="display:none; padding-bottom: 64px;">');
  html = replaceOnce(html, '<article id="post-article" style="display:none; padding-bottom: 96px;">',
    '<article id="post-article" data-ssr="1" style="padding-bottom: 96px;">');
  if (post.categories[0]) {
    html = replaceOnce(html, '<span id="post-category" class="cat-badge" style="display:none; margin-bottom:16px;"></span>',
      `<span id="post-category" class="cat-badge" style="display:inline-block; margin-bottom:16px;">${escapeHtml(post.categories[0])}</span>`);
  }
  html = replaceOnce(html, /<h1 id="post-title"([^>]*)><\/h1>/, (_, attrs) => `<h1 id="post-title"${attrs}>${post.titleHtml}</h1>`);
  html = replaceOnce(html, /<time id="post-date"([^>]*)><\/time>/,
    (_, attrs) => `<time id="post-date" datetime="${escapeHtml(post.dateISO)}"${attrs}>${post.dateLabel}</time>`);
  if (post.featuredImage) {
    html = replaceOnce(html, '<div id="featured-img-wrap" style="display:none; margin-bottom: 48px;">',
      '<div id="featured-img-wrap" style="margin-bottom: 48px;">');
    html = replaceOnce(html, '<img id="featured-img" src="" alt=""',
      `<img id="featured-img" src="${escapeHtml(post.featuredImage)}" alt="${escapeHtml(post.imageAlt || post.title)}" fetchpriority="high"`);
  }
  html = replaceOnce(html, '<div id="post-content"></div>', `<div id="post-content">${post.content}</div>`);
  if (post.categories.length) {
    html = replaceOnce(html, '<div id="post-tags" style="display:none; ', '<div id="post-tags" style="');
    html = replaceOnce(html, /<div id="post-tags-list"([^>]*)><\/div>/, (_, attrs) => `<div id="post-tags-list"${attrs}>${
      post.categories.map(cat => `<span style="display:inline-block;font-size:11px;font-weight:700;color:var(--verde);background:rgba(74,90,58,0.1);border-radius:99px;padding:4px 12px;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(cat)}</span>`).join('')
    }</div>`);
  }
  html = replaceOnce(html, '<section id="post-cta" style="display:none; ', '<section id="post-cta" style="');
  return html;
}

module.exports = async function handler(req, res) {
  const pathname = (req.url || '').split('?')[0];
  const match = pathname.match(/^\/blog\/([^/]+)\/?$/);

  // URL antiga: /blog-post.html?slug=xxx → 301 /blog/xxx
  if (!match) {
    const legacySlug = req.query.slug;
    res.statusCode = 301;
    res.setHeader('Location', legacySlug ? postUrl(legacySlug) : '/blog');
    return res.end();
  }

  const slug = decodeURIComponent(match[1]);
  const template = readTemplate('blog-post.html');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  let posts;
  try {
    ({ data: posts } = await wpFetch(`slug=${encodeURIComponent(slug)}&_embed=1`));
  } catch (err) {
    console.error('[blog-post] WP fetch failed:', err.message);
    res.setHeader('Cache-Control', CACHE_FAIL);
    return res.end(template); // o cliente tenta de novo
  }

  if (!posts || posts.length === 0) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', CACHE_OK);
    return res.end(template
      .replace('<!--SSR:HEAD-->', '<meta name="robots" content="noindex" />')
      .replace('<div id="post-skeleton" style="padding-bottom: 64px;">', '<div id="post-skeleton" style="display:none; padding-bottom: 64px;">')
      .replace('<div id="error-state" style="display:none; ', '<div id="error-state" style="')
      .replace('<article id="post-article" style="display:none; ', '<article id="post-article" data-ssr="1" style="display:none; '));
  }

  try {
    const html = render(template, extractPost(posts[0]));
    res.setHeader('Cache-Control', CACHE_OK);
    return res.end(html);
  } catch (err) {
    console.error('[blog-post] render failed:', err.message);
    res.setHeader('Cache-Control', CACHE_FAIL);
    return res.end(template);
  }
};
