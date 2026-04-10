/* =============================================
   REMINDHUB — NEWS MODULE
   ============================================= */

let newsArticles = [];
let newsRefreshTimer = null;

// Category → display label + color class
const CAT_MAP = {
  BTC:        { label: 'Bitcoin',    cls: 'cat-btc' },
  ETH:        { label: 'Ethereum',   cls: 'cat-eth' },
  XRP:        { label: 'XRP',        cls: 'cat-xrp' },
  Blockchain: { label: 'Blockchain', cls: 'cat-chain' },
  Finance:    { label: 'Finance',    cls: 'cat-finance' },
  Trading:    { label: 'Trading',    cls: 'cat-trading' },
  NFT:        { label: 'NFT',        cls: 'cat-nft' },
  Regulation: { label: 'Regulation', cls: 'cat-reg' },
  Technology: { label: 'Tech',       cls: 'cat-tech' },
};

function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function newsTimeAgo(unixTs) {
  const diff = Math.floor((Date.now() / 1000) - unixTs);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function parseCats(catStr) {
  if (!catStr) return [];
  return catStr.split('|').map(c => c.trim()).filter(Boolean).slice(0, 3);
}

function catBadge(cat, small = false) {
  const info = CAT_MAP[cat] || { label: cat, cls: 'cat-default' };
  return `<span class="news-cat ${info.cls}${small ? ' news-cat-sm' : ''}">${info.label}</span>`;
}

// ─── FETCH ────────────────────────────────────
async function fetchNews(force = false) {
  try {
    const articles = await apiGet('/api/news');
    newsArticles = articles || [];
    renderNewsGrid();
  } catch(e) {
    const grid = document.getElementById('newsGrid');
    if (grid) grid.innerHTML = `<div class="news-loading news-error">Could not load news</div>`;
  }
}

// ─── RENDER GRID ──────────────────────────────
function renderNewsGrid() {
  const grid = document.getElementById('newsGrid');
  if (!grid) return;

  if (!newsArticles.length) {
    grid.innerHTML = `<div class="news-loading">No articles available</div>`;
    return;
  }

  grid.innerHTML = newsArticles.map((a, i) => {
    const cats = parseCats(a.categories);
    const time = newsTimeAgo(a.published_on);
    const src  = a.source_info?.name || a.source || '';
    const title = escHtml(a.title || '');
    const score = a.reddit_score != null ? fmtNum(a.reddit_score) : '';
    const comments = a.reddit_comments != null ? fmtNum(a.reddit_comments) : '';
    const hasImg = a.imageurl && a.imageurl.startsWith('http');
    return `
      <div class="news-card${hasImg ? ' news-card-img' : ''}" data-news-idx="${i}" title="${title}"${hasImg ? ` style="--card-img:url('${a.imageurl}')"` : ''}>
        <div class="news-card-top">
          ${cats.slice(0, 2).map(c => catBadge(c, true)).join('')}
          <span class="news-card-time">${time}</span>
        </div>
        <div class="news-card-title">${title}</div>
        <div class="news-card-footer">
          <span class="news-card-src">${escHtml(src)}</span>
          ${score ? `<span class="news-card-stats">▲ ${score} · 💬 ${comments}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.news-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.newsIdx);
      openNewsArticle(newsArticles[idx]);
    });
  });
}

// ─── ARTICLE MODAL ────────────────────────────
function openNewsArticle(article) {
  if (!article) return;

  const cats = parseCats(article.categories);
  const time = newsTimeAgo(article.published_on);
  const src  = article.source_info?.name || article.source || '';
  const imgUrl = article.imageurl || '';

  // Hero image
  const hero = document.getElementById('newsModalHero');
  if (hero) {
    if (imgUrl) {
      hero.style.display = 'block';
      hero.style.backgroundImage = `url('${imgUrl}')`;
    } else {
      hero.style.display = 'none';
    }
  }

  // Source
  const srcEl = document.getElementById('newsModalSource');
  if (srcEl) srcEl.textContent = src;

  // Category badges
  const catsEl = document.getElementById('newsModalCats');
  if (catsEl) catsEl.innerHTML = cats.map(c => catBadge(c)).join('');

  // Title
  const titleEl = document.getElementById('newsModalTitle');
  if (titleEl) titleEl.textContent = article.title || '';

  // Meta
  const metaEl = document.getElementById('newsModalMeta');
  if (metaEl) {
    const score    = article.reddit_score    != null ? `▲ ${fmtNum(article.reddit_score)}` : '';
    const comments = article.reddit_comments != null ? `💬 ${fmtNum(article.reddit_comments)}` : '';
    const stats    = [score, comments].filter(Boolean).join('  ');
    metaEl.textContent = stats ? `${time}  ·  ${stats}` : time;
  }

  // Body
  const bodyEl = document.getElementById('newsModalText');
  if (bodyEl) {
    const bodyText = article.body || '';
    bodyEl.textContent = bodyText.length > 900 ? bodyText.slice(0, 900) + '...' : bodyText;
  }

  // Links
  const linkEl = document.getElementById('newsModalLink');
  if (linkEl) linkEl.href = article.url || '#';

  // Reddit thread link (secondary)
  const redditLinkEl = document.getElementById('newsModalReddit');
  if (redditLinkEl) {
    if (article.reddit_permalink) {
      redditLinkEl.href = article.reddit_permalink;
      redditLinkEl.style.display = '';
    } else {
      redditLinkEl.style.display = 'none';
    }
  }

  document.getElementById('newsModalOverlay').classList.add('open');
}

function closeNewsModal() {
  document.getElementById('newsModalOverlay')?.classList.remove('open');
}

// ─── INIT ─────────────────────────────────────
function initNews() {
  fetchNews();

  // Auto-refresh every 10 min
  clearInterval(newsRefreshTimer);
  newsRefreshTimer = setInterval(fetchNews, 10 * 60 * 1000);

  // Refresh button
  document.getElementById('newsRefreshBtn')?.addEventListener('click', () => {
    const btn = document.getElementById('newsRefreshBtn');
    if (btn) { btn.style.transform = 'rotate(360deg)'; btn.style.transition = 'transform 0.5s'; }
    fetchNews(true);
    setTimeout(() => { if (btn) { btn.style.transform = ''; btn.style.transition = ''; } }, 600);
  });

  // Modal close buttons
  document.getElementById('newsModalClose')?.addEventListener('click', closeNewsModal);
  document.getElementById('newsModalClose2')?.addEventListener('click', closeNewsModal);
  document.getElementById('newsModalOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('newsModalOverlay')) closeNewsModal();
  });
}

// Boot — after app.js and widgets.js are ready
window.addEventListener('load', () => {
  if (typeof apiGet === 'function') initNews();
});
