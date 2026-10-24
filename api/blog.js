// GET /blog?page=N — renderiza a listagem do blog no servidor para o Google
// rastrear os posts. Usa blog.html como template; o JS da página só assume
// a renderização se o fetch aqui falhar.

const {
  SITE_URL, CACHE_OK, CACHE_FAIL,
  readTemplate, wpFetch, extractPost, escapeHtml, postUrl, replaceOnce,
} = require('./_lib/wp');

const PER_PAGE = 9;

function pageHref(p) { return p === 1 ? '/blog' : `/blog?page=${p}`; }

// Mesma marcação de renderCard() em blog.html
function renderCard(post, index) {
  const link = postUrl(post.slug);
  const reveal = index < 3 ? '' : ' fade-up';
  const imgBlock = post.featuredImage
    ? `<div class="post-card-img-wrap">
           <a href="${link}">
             <img src="${escapeHtml(post.featuredImage)}" alt="${escapeHtml(post.imageAlt || post.title)}" ${index < 3 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" />
           </a>
         </div>`
    : `<a href="${link}" class="post-card-img-placeholder" aria-label="${escapeHtml(post.title)}">
           <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
             <rect x="3" y="3" width="18" height="18" rx="3" stroke="#4A5A3A" stroke-width="1.4"/>
             <path d="M3 15l5-5 4 4 3-3 6 5" stroke="#4A5A3A" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>
         </a>`;
  const badge = post.categories[0] ? `<span class="post-cat-badge">${escapeHtml(post.categories[0])}</span>` : '';

  return `
      <article class="post-card card-lift${reveal}">
        ${imgBlock}
        <div class="post-card-body">
          ${badge}
          <h2 class="post-card-title">
            <a href="${link}">${post.titleHtml}</a>
          </h2>
          <p class="post-card-excerpt line-clamp-3">${escapeHtml(post.excerpt)}</p>
          <div class="post-card-footer">
            <time class="post-card-date" datetime="${escapeHtml(post.dateISO)}">${post.dateLabel}</time>
            <a href="${link}" class="post-card-link">
              Ler mais
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
          </div>
        </div>
      </article>`;
}

// Mesma marcação de renderPagination() em blog.html
function renderPagination(current, total) {
  if (total <= 1) return '';
  const arrow = (d) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="${d}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const navLink = (p, enabled, label, d) => enabled
    ? `<a class="pagination-btn" href="${pageHref(p)}" aria-label="${label}">${arrow(d)}</a>`
    : `<span class="pagination-btn" aria-disabled="true">${arrow(d)}</span>`;

  let html = navLink(current - 1, current > 1, 'Página anterior', 'M10 3L6 8l4 5');
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  for (let p = start; p <= end; p++) {
    html += `<a class="pagination-btn ${p === current ? 'active' : ''}" href="${pageHref(p)}"${p === current ? ' aria-current="page"' : ''}>${p}</a>`;
  }
  html += navLink(current + 1, current < total, 'Próxima página', 'M6 3l4 5-4 5');
  return html;
}

module.exports = async function handler(req, res) {
  const template = readTemplate('blog.html');
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  let result;
  try {
    result = await wpFetch(`per_page=${PER_PAGE}&page=${page}&_embed=1`);
  } catch (err) {
    // WordPress retorna 400 para página além do total
    if (err.status === 400) {
      res.statusCode = 404;
      res.setHeader('Cache-Control', CACHE_OK);
      return res.end(template.replace('<!--SSR:HEAD-->', '<meta name="robots" content="noindex" />'));
    }
    console.error('[blog] WP fetch failed:', err.message);
    res.setHeader('Cache-Control', CACHE_FAIL);
    return res.end(template);
  }

  try {
    const posts = result.data.map(extractPost);
    const { total, totalPages } = result;
    let html = template;

    if (page > 1) {
      html = replaceOnce(html, '<title>Blog | TH Mourão Barbearia & Spa</title>',
        `<title>Blog — Página ${page} | TH Mourão Barbearia & Spa</title>`);
      html = replaceOnce(html, '<link rel="canonical" href="https://www.thmourao.com.br/blog" />',
        `<link rel="canonical" href="${SITE_URL}${pageHref(page)}" />`);
    }
    html = replaceOnce(html, '<!--SSR:HEAD-->', `<script>window.__BLOG_SSR = ${JSON.stringify({ page, totalPages })};</script>`);
    html = replaceOnce(html, /<!--SSR:GRID-->[\s\S]*?<!--\/SSR:GRID-->/, posts.map(renderCard).join(''));
    html = replaceOnce(html, /<p id="posts-count"[^>]*>(?=<\/p>)/,
      (open) => `${open}${total} ${total === 1 ? 'publicação' : 'publicações'}`);
    html = replaceOnce(html, /<div id="pagination"[^>]*>(?=<\/div>)/, (open) => open + renderPagination(page, totalPages));

    res.setHeader('Cache-Control', CACHE_OK);
    return res.end(html);
  } catch (err) {
    console.error('[blog] render failed:', err.message);
    res.setHeader('Cache-Control', CACHE_FAIL);
    return res.end(template);
  }
};
