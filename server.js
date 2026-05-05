const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// node-notifier only works on desktop — skip on Railway/Linux
const notifier = process.platform === 'win32' ? require('node-notifier') : null;
const { exec } = require('child_process');
const nodemailer = require('nodemailer');

process.on('uncaughtException', err => console.error('CRASH:', err));
process.on('unhandledRejection', err => console.error('REJECTION:', err));

const app = express();
const PORT = process.env.PORT || 3747;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
const DATA_FILE = path.join(__dirname, 'data', 'tasks.json');
const KEYS_FILE = path.join(__dirname, 'data', 'keys.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ tasks: [], settings: { theme: 'cyberpunk' } }));
}
if (!fs.existsSync(KEYS_FILE)) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify({}));
}

// --- Email setup ---
const mailer = (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    })
  : null;

async function sendAccessEmail(email, key) {
  if (!mailer) return console.log('Email not configured — key for', email, ':', key);
  const appUrl = process.env.APP_URL || 'https://remindhub-production.up.railway.app';
  await mailer.sendMail({
    from: `"RemindHUB" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Your RemindHUB Access Key',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#00ffcc;">Welcome to RemindHUB ◈</h2>
        <p>Thanks for subscribing! Here's your personal access key:</p>
        <p style="font-family:monospace;font-size:1.2rem;background:#111;color:#00ffcc;padding:14px 18px;border-radius:8px;letter-spacing:2px;">${key}</p>
        <p>Go to <a href="${appUrl}">${appUrl}</a> and enter this key to unlock the app.</p>
        <p style="color:#888;font-size:0.85rem;">Keep this key safe — it's your login. If you lose it, reply to this email.</p>
      </div>
    `
  });
}

// --- Keys helpers ---
function readKeys() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch { return {}; }
}
function writeKeys(keys) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

// --- Stripe webhook (needs raw body — must come before express.json) ---
app.post('/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.sendStatus(400);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email;
    const key = crypto.randomBytes(16).toString('hex');
    const keys = readKeys();
    keys[key] = { email, createdAt: new Date().toISOString(), active: true };
    writeKeys(keys);
    sendAccessEmail(email, key).catch(err => console.error('Email error:', err));
    console.log('Access key created for', email);
  }
  res.json({ received: true });
});

app.use(express.json());

// --- Unlock endpoint ---
app.post('/api/unlock', (req, res) => {
  // Always allow access from localhost
  const ip = req.ip || req.connection.remoteAddress || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    return res.json({ ok: true, email: 'owner' });
  }
  const { key } = req.body;
  if (!key) return res.status(400).json({ ok: false, message: 'No key provided.' });
  const keys = readKeys();
  if (keys[key] && keys[key].active) {
    res.json({ ok: true, email: keys[key].email });
  } else {
    res.status(401).json({ ok: false, message: 'Invalid access key.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// --- SSE: real-time sync ---
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('data: connected\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(type, payload) {
  const msg = `data: ${JSON.stringify({ type, payload })}\n\n`;
  sseClients.forEach(client => { try { client.write(msg); } catch {} });
}

// --- Data helpers ---
function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { tasks: [], settings: { theme: 'cyberpunk' } };
  }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- API Routes ---
app.get('/api/tasks', (req, res) => {
  const data = readData();
  res.json(data.tasks);
});

app.post('/api/tasks', (req, res) => {
  const data = readData();
  const task = {
    id: Date.now().toString(),
    title: req.body.title,
    notes: req.body.notes || '',
    priority: req.body.priority || 'medium', // critical | high | medium | low
    category: req.body.category || 'general',
    tags: req.body.tags || [],
    dueDate: req.body.dueDate || null,
    dueTime: req.body.dueTime || null,
    recurring: req.body.recurring || null, // daily | weekly | monthly | null
    status: 'todo', // todo | inprogress | done
    urgency: req.body.urgency || false,
    importance: req.body.importance || false,
    steps: req.body.steps || [],
    createdAt: new Date().toISOString(),
    completedAt: null,
    notified: false
  };
  data.tasks.push(task);
  writeData(data);
  broadcast('tasks', null);
  res.json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const data = readData();
  const idx = data.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const updated = { ...data.tasks[idx], ...req.body };
  if (req.body.status === 'done' && !data.tasks[idx].completedAt) {
    updated.completedAt = new Date().toISOString();
  }
  data.tasks[idx] = updated;
  writeData(data);
  broadcast('tasks', null);
  res.json(updated);
});

app.delete('/api/tasks/:id', (req, res) => {
  const data = readData();
  data.tasks = data.tasks.filter(t => t.id !== req.params.id);
  writeData(data);
  broadcast('tasks', null);
  res.json({ ok: true });
});

app.get('/api/settings', (req, res) => {
  res.json(readData().settings);
});

app.put('/api/settings', (req, res) => {
  const data = readData();
  data.settings = { ...data.settings, ...req.body };
  writeData(data);
  broadcast('settings', data.settings);
  res.json(data.settings);
});

// Notification trigger from frontend
app.post('/api/notify', (req, res) => {
  const { title, message, urgency } = req.body;
  if (notifier) notifier.notify({
    title: title || 'RemindHUB',
    message: message || 'You have a task due!',
    sound: true,
    wait: false,
    icon: path.join(__dirname, 'public', 'icon.png'),
    appID: 'RemindHUB'
  });
  res.json({ ok: true });
});

// News — Reddit JSON API, no API key, 10-min server cache
let newsCache = { articles: [], fetchedAt: 0 };
const NEWS_TTL = 10 * 60 * 1000;

const REDDIT_SUBS = [
  { sub: 'CryptoCurrency', cats: 'Blockchain|Trading', limit: 10 },
  { sub: 'Bitcoin',        cats: 'BTC|Finance',        limit: 8  },
  { sub: 'ethereum',       cats: 'ETH|Blockchain',     limit: 8  },
  { sub: 'investing',      cats: 'Finance|Trading',    limit: 6  },
  { sub: 'technews',       cats: 'Technology',         limit: 6  },
];

async function fetchReddit({ sub, cats, limit }) {
  const url = `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'desktop:RemindHUB:1.0 (by /u/remindhub_app)' },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Reddit ${sub} HTTP ${res.status}`);
  const json = await res.json();
  const posts = json?.data?.children || [];
  const KEYWORDS = /bitcoin|btc|eth|ethereum|crypto|blockchain|defi|nft|altcoin|trading|finance|invest|market|token|wallet|solana|base|layer|web3|stock|nasdaq|inflation|fed |dollar|yield|bull|bear|rally|pump|dump|halving|mining|staking|lending|borrow|protocol|dao|exchange|binance|coinbase|uniswap|aave|compound/i;
  return posts
    .filter(p => !p.data.stickied && p.data.title && KEYWORDS.test(p.data.title))
    .map(p => {
      const d = p.data;
      // Pick a usable image
      let imageurl = '';
      if (d.thumbnail && d.thumbnail.startsWith('http')) imageurl = d.thumbnail;
      if (d.preview?.images?.[0]?.source?.url) {
        imageurl = d.preview.images[0].source.url.replace(/&amp;/g, '&');
      }
      const body = (d.selftext || '')
        .replace(/\n+/g, ' ').replace(/\[.*?\]\(.*?\)/g, '').trim().slice(0, 600)
        || d.url || '';
      return {
        title:            d.title,
        url:              d.url || `https://reddit.com${d.permalink}`,
        body,
        published_on:     Math.floor(d.created_utc),
        imageurl,
        categories:       cats,
        source:           `r/${d.subreddit}`,
        source_info:      { name: `r/${d.subreddit}` },
        reddit_score:     d.score,
        reddit_comments:  d.num_comments,
        reddit_permalink: `https://reddit.com${d.permalink}`,
      };
    });
}

// Fallback: Hacker News Algolia search (always public, no key)
async function fetchHNFallback() {
  const queries = ['bitcoin crypto', 'ethereum blockchain', 'cryptocurrency finance'];
  const results = await Promise.allSettled(queries.map(q =>
    fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=12`, {
      headers: { 'User-Agent': 'RemindHUB/1.0' },
      signal: AbortSignal.timeout(7000),
    }).then(r => r.json())
  ));
  const all = [];
  results.forEach((r, qi) => {
    if (r.status !== 'fulfilled') return;
    const hits = r.value?.hits || [];
    const cats = qi === 0 ? 'BTC|Finance' : qi === 1 ? 'ETH|Blockchain' : 'Blockchain|Finance';
    hits.forEach(h => {
      if (!h.title || !h.url) return;
      all.push({
        title:        h.title,
        url:          h.url,
        body:         h.story_text ? h.story_text.replace(/<[^>]+>/g,'').slice(0,600) : '',
        published_on: h.created_at_i || Math.floor(Date.now()/1000),
        imageurl:     '',
        categories:   cats,
        source:       'Hacker News',
        source_info:  { name: 'Hacker News' },
        reddit_score:    h.points || 0,
        reddit_comments: h.num_comments || 0,
        reddit_permalink: `https://news.ycombinator.com/item?id=${h.objectID}`,
      });
    });
  });
  return all;
}

app.get('/api/news', async (req, res) => {
  const now = Date.now();
  if (newsCache.articles.length && now - newsCache.fetchedAt < NEWS_TTL) {
    return res.json(newsCache.articles);
  }
  let all = [];
  try {
    const results = await Promise.allSettled(REDDIT_SUBS.map(fetchReddit));
    results.forEach(r => {
      if (r.status === 'fulfilled') all.push(...r.value);
      else console.warn('Reddit fetch failed:', r.reason?.message);
    });
    console.log(`Reddit: got ${all.length} posts`);
  } catch(e) {
    console.warn('Reddit error:', e.message);
  }

  // If Reddit returned nothing, fall back to HN Algolia
  if (!all.length) {
    console.log('Reddit empty, trying HN fallback...');
    try {
      all = await fetchHNFallback();
      console.log(`HN fallback: got ${all.length} articles`);
    } catch(e) {
      console.warn('HN fallback error:', e.message);
    }
  }

  // Deduplicate by title prefix, sort by score then newest
  const seen = new Set();
  const unique = all
    .filter(a => { const k = a.title.slice(0, 60).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.reddit_score - a.reddit_score) || (b.published_on - a.published_on))
    .slice(0, 30);

  if (unique.length) {
    newsCache = { articles: unique, fetchedAt: now };
    return res.json(unique);
  }
  res.json(newsCache.articles.length ? newsCache.articles : []);
});

// Notes / Scratch Pad
app.get('/api/notes', (req, res) => {
  const data = readData();
  res.json({ content: data.notes || '' });
});
app.put('/api/notes', (req, res) => {
  const data = readData();
  data.notes = req.body.content || '';
  writeData(data);
  broadcast('notes', { content: data.notes });
  res.json({ ok: true });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  const data = readData();
  const tasks = data.tasks;
  const now = new Date();
  res.json({
    total: tasks.length,
    done: tasks.filter(t => t.status === 'done').length,
    inprogress: tasks.filter(t => t.status === 'inprogress').length,
    todo: tasks.filter(t => t.status === 'todo').length,
    overdue: tasks.filter(t => t.dueDate && t.status !== 'done' && new Date(t.dueDate) < now).length,
    critical: tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length,
    byPriority: {
      critical: tasks.filter(t => t.priority === 'critical').length,
      high: tasks.filter(t => t.priority === 'high').length,
      medium: tasks.filter(t => t.priority === 'medium').length,
      low: tasks.filter(t => t.priority === 'low').length
    }
  });
});

// ─── QUANT ENGINE ─────────────────────────────────────────────────────────────

function emaFull(values, period) {
  if (values.length < period) return values.map(() => values[values.length - 1]);
  const k = 2 / (period + 1);
  const seed = values.slice(0, period).reduce((a, b) => a + b) / period;
  const out = new Array(period).fill(seed);
  let ema = seed;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 2) return 50;
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgG += d; else avgL -= d;
  }
  avgG /= period; avgL /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  return avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
}

function calcRSISeries(closes, period = 14) {
  const out = new Array(period).fill(null);
  if (closes.length < period + 2) return out;
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgG += d; else avgL -= d;
  }
  avgG /= period; avgL /= period;
  out.push(avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out.push(avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  }
  return out;
}

function calcMACD(closes) {
  if (closes.length < 36) return { macd: 0, signal: 0, hist: 0, trend: 'neutral' };
  const e12 = emaFull(closes, 12);
  const e26 = emaFull(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const sigLine = emaFull(macdLine.slice(25), 9);
  const m0 = macdLine[macdLine.length - 1], m1 = macdLine[macdLine.length - 2];
  const s0 = sigLine[sigLine.length - 1],   s1 = sigLine[sigLine.length - 2];
  let trend = m0 > s0 ? 'bullish' : 'bearish';
  if (m0 > s0 && m1 <= s1) trend = 'bullish_cross';
  if (m0 < s0 && m1 >= s1) trend = 'bearish_cross';
  return { macd: m0, signal: s0, hist: m0 - s0, trend };
}

function calcBB(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const sl = closes.slice(-period);
  const sma = sl.reduce((a, b) => a + b) / period;
  const std = Math.sqrt(sl.reduce((a, b) => a + (b - sma) ** 2, 0) / period);
  const upper = sma + mult * std, lower = sma - mult * std;
  const price = closes[closes.length - 1];
  const range = upper - lower;
  return { upper, middle: sma, lower, pct: range ? (price - lower) / range : 0.5, width: range / sma };
}

function calcATR(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
  }
  return trs.slice(-period).reduce((a, b) => a + b) / period;
}

function calcStochRSI(closes, rsiPeriod = 14, stochPeriod = 14) {
  const rsiSeries = calcRSISeries(closes, rsiPeriod).filter(v => v !== null);
  if (rsiSeries.length < stochPeriod + 3) return { k: 50, d: 50 };
  const stochVals = [];
  for (let i = stochPeriod - 1; i < rsiSeries.length; i++) {
    const w = rsiSeries.slice(i - stochPeriod + 1, i + 1);
    const mn = Math.min(...w), mx = Math.max(...w);
    stochVals.push(mx === mn ? 50 : (rsiSeries[i] - mn) / (mx - mn) * 100);
  }
  const kLine = [];
  for (let i = 2; i < stochVals.length; i++)
    kLine.push((stochVals[i] + stochVals[i-1] + stochVals[i-2]) / 3);
  const dLine = [];
  for (let i = 2; i < kLine.length; i++)
    dLine.push((kLine[i] + kLine[i-1] + kLine[i-2]) / 3);
  return { k: kLine[kLine.length-1] ?? 50, d: dLine[dLine.length-1] ?? 50 };
}

function generateSignal(ind, price, mode) {
  const { rsi, macd, bb, ema20, ema50, ema200, stochK, stochD, volRatio, atr } = ind;
  let score = 0;
  const reasons = [];

  // RSI (max ±3)
  if      (rsi < 25) { score += 3; reasons.push(`RSI severely oversold (${rsi.toFixed(1)})`); }
  else if (rsi < 35) { score += 2; reasons.push(`RSI oversold (${rsi.toFixed(1)})`); }
  else if (rsi < 46) { score += 1; reasons.push(`RSI in bullish range`); }
  else if (rsi > 75) { score -= 3; reasons.push(`RSI severely overbought (${rsi.toFixed(1)})`); }
  else if (rsi > 65) { score -= 2; reasons.push(`RSI overbought (${rsi.toFixed(1)})`); }
  else if (rsi > 54) { score -= 1; reasons.push(`RSI in bearish range`); }

  // MACD (max ±3)
  if      (macd.trend === 'bullish_cross')  { score += 3; reasons.push('MACD bullish crossover'); }
  else if (macd.trend === 'bullish')        { score += 1; reasons.push('MACD above signal line'); }
  else if (macd.trend === 'bearish_cross')  { score -= 3; reasons.push('MACD bearish crossover'); }
  else                                      { score -= 1; reasons.push('MACD below signal line'); }

  // Bollinger Bands (max ±2)
  if (bb) {
    if      (bb.pct < 0.08) { score += 2; reasons.push('Price at lower Bollinger Band'); }
    else if (bb.pct < 0.3)  { score += 1; reasons.push('Price below BB midline'); }
    else if (bb.pct > 0.92) { score -= 2; reasons.push('Price at upper Bollinger Band'); }
    else if (bb.pct > 0.7)  { score -= 1; reasons.push('Price above BB midline'); }
  }

  // EMA alignment (max ±2)
  if      (ema20 > ema50 && ema50 > ema200) { score += 2; reasons.push('Full EMA bullish alignment (20>50>200)'); }
  else if (ema20 < ema50 && ema50 < ema200) { score -= 2; reasons.push('Full EMA bearish alignment (20<50<200)'); }
  else if (ema20 > ema50)                   { score += 1; reasons.push('Short-term EMA bullish (20>50)'); }
  else                                      { score -= 1; reasons.push('Short-term EMA bearish (20<50)'); }

  // Price vs EMA200 (max ±1)
  if      (price > ema200 * 1.001) { score += 1; reasons.push('Price above 200 EMA'); }
  else if (price < ema200 * 0.999) { score -= 1; reasons.push('Price below 200 EMA'); }

  // Stoch RSI (max ±1)
  if      (stochK < 20 && stochD < 20 && stochK > stochD) { score += 1; reasons.push('StochRSI oversold with K>D cross'); }
  else if (stochK > 80 && stochD > 80 && stochK < stochD) { score -= 1; reasons.push('StochRSI overbought with K<D cross'); }

  // Volume (max ±1)
  if (volRatio > 1.5 && score > 0)  { score += 1; reasons.push(`Volume spike confirms move (×${volRatio.toFixed(1)})`); }
  else if (volRatio > 1.5 && score < 0) { score -= 1; reasons.push(`Volume spike on decline (×${volRatio.toFixed(1)})`); }

  score = Math.max(-10, Math.min(10, score));

  let signal, cls;
  if      (score >= 7)  { signal = 'STRONG_BUY';  cls = 'sig-sbuy'; }
  else if (score >= 3)  { signal = 'BUY';          cls = 'sig-buy'; }
  else if (score <= -7) { signal = 'STRONG_SELL';  cls = 'sig-ssell'; }
  else if (score <= -3) { signal = 'SELL';         cls = 'sig-sell'; }
  else                  { signal = 'HOLD';         cls = 'sig-hold'; }

  const mult = mode === 'scalp' ? 1.0 : 1.5;
  let entry = price, target = null, stop = null, rr = null;
  if (signal.includes('BUY')) {
    stop   = price - atr * mult;
    target = price + atr * (mode === 'scalp' ? 2 : 3) * mult;
    rr = (target - price) / (price - stop);
  } else if (signal.includes('SELL')) {
    stop   = price + atr * mult;
    target = price - atr * (mode === 'scalp' ? 2 : 3) * mult;
    rr = (price - target) / (stop - price);
  }

  return { signal, cls, score, reasons, entry, target, stop, rr: rr ? Math.round(rr * 100) / 100 : null };
}

const quantCache = {};
const QUANT_TTL = 45 * 1000;

async function fetchQuantData(symbol, interval, mode) {
  const cacheKey = `${symbol}:${interval}`;
  const now = Date.now();
  if (quantCache[cacheKey] && now - quantCache[cacheKey].ts < QUANT_TTL) {
    return quantCache[cacheKey].data;
  }

  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=250`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'RemindHUB/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Binance ${symbol} HTTP ${resp.status}`);
  const klines = await resp.json();

  const highs   = klines.map(k => parseFloat(k[2]));
  const lows    = klines.map(k => parseFloat(k[3]));
  const closes  = klines.map(k => parseFloat(k[4]));
  const volumes = klines.map(k => parseFloat(k[5]));

  const price    = closes[closes.length - 1];
  const open24   = closes[Math.max(0, closes.length - 25)];
  const change24h = ((price - open24) / open24) * 100;

  const rsi      = calcRSI(closes);
  const macd     = calcMACD(closes);
  const bb       = calcBB(closes);
  const e20      = emaFull(closes, 20);
  const e50      = emaFull(closes, 50);
  const e200     = emaFull(closes, 200);
  const ema20    = e20[e20.length - 1];
  const ema50    = e50[e50.length - 1];
  const ema200   = e200[e200.length - 1];
  const stoch    = calcStochRSI(closes);
  const atr      = calcATR(highs, lows, closes);
  const volAvg   = volumes.slice(-21, -1).reduce((a, b) => a + b) / 20;
  const volRatio = volumes[volumes.length - 1] / volAvg;

  const indicators = { rsi, macd, bb, ema20, ema50, ema200, stochK: stoch.k, stochD: stoch.d, volRatio, atr };
  const signal = generateSignal(indicators, price, mode);
  const sparkline = closes.slice(-60);

  const data = {
    symbol, interval, price, change24h,
    indicators: {
      rsi:      Math.round(rsi * 10) / 10,
      macd:     { value: +macd.macd.toFixed(4), signal: +macd.signal.toFixed(4), hist: +macd.hist.toFixed(4), trend: macd.trend },
      bb:       bb ? { upper: +bb.upper.toFixed(4), middle: +bb.middle.toFixed(4), lower: +bb.lower.toFixed(4), pct: +bb.pct.toFixed(3), width: +bb.width.toFixed(4) } : null,
      ema20:    +ema20.toFixed(4),
      ema50:    +ema50.toFixed(4),
      ema200:   +ema200.toFixed(4),
      stochRSI: { k: +stoch.k.toFixed(1), d: +stoch.d.toFixed(1) },
      volume:   { ratio: +volRatio.toFixed(2) },
      atr:      +atr.toFixed(4),
    },
    signal, sparkline, updatedAt: now,
  };

  quantCache[cacheKey] = { data, ts: now };
  return data;
}

app.get('/api/quant', async (req, res) => {
  const symbol   = (req.query.symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z]/g, '');
  const interval = req.query.interval || '4h';
  const mode     = req.query.mode === 'scalp' ? 'scalp' : 'swing';
  const ALLOWED_INTERVALS = ['1m','3m','5m','15m','30m','1h','2h','4h','6h','8h','12h','1d','3d','1w'];
  if (!ALLOWED_INTERVALS.includes(interval)) return res.status(400).json({ error: 'Bad interval' });
  try {
    const data = await fetchQuantData(symbol, interval, mode);
    res.json(data);
  } catch(e) {
    console.error('Quant error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Background notification checker (runs every minute)
function checkDueNotifications() {
  const data = readData();
  const now = new Date();
  let changed = false;

  data.tasks.forEach(task => {
    if (task.status === 'done' || task.notified) return;
    if (!task.dueDate) return;

    const due = new Date(task.dueDate + (task.dueTime ? 'T' + task.dueTime : 'T23:59'));
    const diffMs = due - now;
    const diffMin = diffMs / 60000;

    // Notify if due within 15 min or overdue
    if (diffMin <= 15 && diffMin > -1440) {
      const label = diffMin < 0 ? 'OVERDUE' : `due in ${Math.round(diffMin)}m`;
      if (notifier) notifier.notify({
        title: `RemindHUB — ${task.priority.toUpperCase()}`,
        message: `[${label}] ${task.title}`,
        sound: true,
        wait: false,
        appID: 'RemindHUB'
      });
      task.notified = true;
      changed = true;
    }
  });

  if (changed) writeData(data);
}

setInterval(checkDueNotifications, 60 * 1000);

// --- Stripe billing ---
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

app.post('/billing/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ message: 'Payment system is being configured — DM @BlockchainBail on X to get access now.' });
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ message: 'Valid email required.' });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: (process.env.APP_URL || 'https://remindhub-production.up.railway.app') + '?subscribed=1',
      cancel_url: 'https://odennetworkxr.com/#tools',
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let lanIP = 'your-pc-ip';
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) { lanIP = iface.address; break; }
    }
    if (lanIP !== 'your-pc-ip') break;
  }
  console.log(`\n  RemindHUB running at:`);
  console.log(`    Local:   http://localhost:${PORT}`);
  console.log(`    Mobile:  http://${lanIP}:${PORT}\n`);
  if (process.platform === 'win32') {
    exec(`start "" "http://localhost:${PORT}"`);
  }
});
