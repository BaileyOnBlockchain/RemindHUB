/* =============================================
   REMINDHUB — QUANT SIGNAL BOT
   ============================================= */

const QUANT_ASSETS = [
  { symbol: 'BTCUSDT',  name: 'BTC',  color: '#f7931a' },
  { symbol: 'ETHUSDT',  name: 'ETH',  color: '#627eea' },
  { symbol: 'SOLUSDT',  name: 'SOL',  color: '#9945ff' },
  { symbol: 'BNBUSDT',  name: 'BNB',  color: '#f3ba2f' },
  { symbol: 'XRPUSDT',  name: 'XRP',  color: '#00aae4' },
  { symbol: 'ADAUSDT',  name: 'ADA',  color: '#4a90d9' },
  { symbol: 'AVAXUSDT', name: 'AVAX', color: '#e84142' },
  { symbol: 'DOTUSDT',  name: 'DOT',  color: '#e6007a' },
  { symbol: 'LINKUSDT', name: 'LINK', color: '#2a5ada' },
  { symbol: 'MATICUSDT',name: 'MATIC',color: '#8247e5' },
];

const SWING_TFS = ['1h', '4h', '1d'];
const SCALP_TFS = ['5m', '15m', '1h'];

let quantMode      = 'swing';
let quantInterval  = '4h';
let quantActive    = '';
let quantData      = {};
let quantCountSecs = 60;
let quantCountTimer = null;
let quantLogItems  = [];
let quantPrevSigs  = {};
let quantFetching  = false;

// ─── INIT ─────────────────────────────────────
function initQuant() {
  document.getElementById('quantSwingBtn')?.addEventListener('click', () => setQuantMode('swing'));
  document.getElementById('quantScalpBtn')?.addEventListener('click', () => setQuantMode('scalp'));
  document.getElementById('quantRefreshBtn')?.addEventListener('click', () => {
    quantData = {};
    scanAll();
  });
  renderTfButtons();
  scanAll();
  startCountdown();
}

function setQuantMode(mode) {
  quantMode     = mode;
  quantInterval = mode === 'swing' ? '4h' : '15m';
  document.getElementById('quantSwingBtn')?.classList.toggle('active', mode === 'swing');
  document.getElementById('quantScalpBtn')?.classList.toggle('active', mode === 'scalp');
  renderTfButtons();
  quantData = {};
  scanAll();
}

function renderTfButtons() {
  const group = document.getElementById('quantTfGroup');
  if (!group) return;
  const tfs = quantMode === 'swing' ? SWING_TFS : SCALP_TFS;
  if (!tfs.includes(quantInterval)) quantInterval = tfs[1];
  group.innerHTML = tfs.map(tf =>
    `<button class="quant-tf-btn${tf === quantInterval ? ' active' : ''}" data-tf="${tf}">${tf}</button>`
  ).join('');
  group.querySelectorAll('.quant-tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      quantInterval = btn.dataset.tf;
      group.querySelectorAll('.quant-tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf === quantInterval));
      quantData = {};
      scanAll();
    });
  });
}

// ─── SCAN ─────────────────────────────────────
async function scanAll() {
  if (quantFetching) return;
  quantFetching = true;
  setLiveDot(false);

  const btn = document.getElementById('quantRefreshBtn');
  if (btn) { btn.style.transform = 'rotate(360deg)'; btn.style.transition = 'transform 0.6s'; }

  const results = await Promise.allSettled(
    QUANT_ASSETS.map(a =>
      apiGet(`/api/quant?symbol=${a.symbol}&interval=${quantInterval}&mode=${quantMode}`)
        .then(d => { quantData[a.symbol] = d; })
        .catch(() => {})
    )
  );

  checkNewSignals();
  renderScanner();
  if (quantActive && quantData[quantActive]) renderDetail(quantActive);

  quantFetching = false;
  setLiveDot(true);
  quantCountSecs = 60;
  if (btn) { btn.style.transform = ''; btn.style.transition = ''; }
}

function checkNewSignals() {
  QUANT_ASSETS.forEach(a => {
    const d = quantData[a.symbol];
    if (!d) return;
    const sig = d.signal.signal;
    const prev = quantPrevSigs[a.symbol];
    if (prev && prev !== sig) {
      addToLog(a, d);
    }
    quantPrevSigs[a.symbol] = sig;
  });
}

function addToLog(asset, data) {
  const now = new Date();
  const time = now.toTimeString().slice(0, 5);
  quantLogItems.unshift({ time, name: asset.name, color: asset.color, signal: data.signal, price: data.price });
  if (quantLogItems.length > 15) quantLogItems.pop();
  renderLog();
}

function renderLog() {
  const el = document.getElementById('quantLog');
  if (!el) return;
  if (!quantLogItems.length) {
    el.innerHTML = `<span style="color:var(--text2);font-size:11px">No signal changes this session</span>`;
    return;
  }
  el.innerHTML = quantLogItems.map(item => `
    <div class="quant-log-item">
      <span class="quant-log-time">${item.time}</span>
      <span class="quant-log-name" style="color:${item.color}">${item.name}</span>
      <span class="quant-log-sig ${item.signal.cls}">${sigLabel(item.signal.signal)}</span>
      <span class="quant-log-price">${fmtPrice(item.price)}</span>
    </div>
  `).join('');
}

function startCountdown() {
  clearInterval(quantCountTimer);
  quantCountTimer = setInterval(() => {
    quantCountSecs--;
    const el = document.getElementById('quantCountdown');
    if (el) el.textContent = `${quantCountSecs}s`;
    if (quantCountSecs <= 0) {
      quantCountSecs = 60;
      const view = document.getElementById('view-quant');
      if (view && view.classList.contains('active')) scanAll();
    }
  }, 1000);
}

function setLiveDot(on) {
  document.getElementById('quantLiveDot')?.classList.toggle('live', on);
}

// ─── SCANNER ──────────────────────────────────
function renderScanner() {
  const container = document.getElementById('quantScanner');
  if (!container) return;

  container.innerHTML = QUANT_ASSETS.map(a => {
    const d = quantData[a.symbol];
    if (!d) return `
      <div class="quant-card quant-card-loading" data-sym="${a.symbol}">
        <div class="quant-card-name" style="color:${a.color}">${a.name}</div>
        <div class="quant-card-spinner">⟳</div>
      </div>`;

    const sig = d.signal;
    const chg = d.change24h;
    return `
      <div class="quant-card${quantActive === a.symbol ? ' active' : ''}" data-sym="${a.symbol}">
        <div class="quant-card-row">
          <span class="quant-card-name" style="color:${a.color}">${a.name}</span>
          <span class="quant-card-chg ${chg >= 0 ? 'pos' : 'neg'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>
        </div>
        <div class="quant-card-price">${fmtPrice(d.price)}</div>
        <canvas class="quant-spark" data-sym="${a.symbol}" width="148" height="36"></canvas>
        <div class="quant-badge ${sig.cls}">${sigLabel(sig.signal)}</div>
        <div class="quant-score-track">
          <div class="quant-score-fill ${sig.score >= 0 ? 'pos' : 'neg'}" style="width:${Math.abs(sig.score) * 10}%"></div>
        </div>
        <div class="quant-card-meta">RSI ${d.indicators.rsi} · Vol ×${d.indicators.volume.ratio}</div>
      </div>`;
  }).join('');

  // Draw sparklines
  QUANT_ASSETS.forEach(a => {
    const d = quantData[a.symbol];
    if (!d) return;
    const cv = container.querySelector(`.quant-spark[data-sym="${a.symbol}"]`);
    if (cv) drawSparkline(cv, d.sparkline, a.color, d.signal.signal);
  });

  // Click → detail
  container.querySelectorAll('.quant-card').forEach(card => {
    card.addEventListener('click', () => {
      const sym = card.dataset.sym;
      quantActive = sym;
      container.querySelectorAll('.quant-card').forEach(c => c.classList.toggle('active', c.dataset.sym === sym));
      if (quantData[sym]) renderDetail(sym);
    });
  });

  // Auto-select first asset with data
  if (!quantActive) {
    const first = QUANT_ASSETS.find(a => quantData[a.symbol]);
    if (first) {
      quantActive = first.symbol;
      container.querySelector(`[data-sym="${first.symbol}"]`)?.classList.add('active');
      renderDetail(first.symbol);
    }
  }
}

// ─── SPARKLINE ────────────────────────────────
function drawSparkline(canvas, prices, accentColor, signal) {
  if (!prices?.length) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.offsetWidth || 148;
  const h = canvas.offsetHeight || 36;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => ({
    x: (i / (prices.length - 1)) * w,
    y: h - 2 - ((p - min) / range) * (h - 4),
  }));

  const lineCol = signal.includes('BUY') ? '#4ade80' : signal.includes('SELL') ? '#f87171' : '#94a3b8';

  // Fill gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, lineCol + '55');
  grad.addColorStop(1, lineCol + '00');
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ─── DETAIL PANEL ─────────────────────────────
function renderDetail(symbol) {
  const d    = quantData[symbol];
  const meta = QUANT_ASSETS.find(a => a.symbol === symbol);
  const panel = document.getElementById('quantDetail');
  if (!panel || !d || !meta) return;

  const sig = d.signal;
  const ind = d.indicators;

  panel.innerHTML = `
    <div class="qd-header">
      <div>
        <span class="qd-name" style="color:${meta.color}">${meta.name}/USDT</span>
        <span class="qd-tf">${d.interval.toUpperCase()}</span>
      </div>
      <div class="qd-price-block">
        <span class="qd-price">${fmtPrice(d.price)}</span>
        <span class="qd-chg ${d.change24h >= 0 ? 'pos' : 'neg'}">${d.change24h >= 0 ? '+' : ''}${d.change24h.toFixed(2)}%</span>
      </div>
    </div>

    <div class="qd-main-sig ${sig.cls}">
      <div class="qd-sig-label">${sigLabel(sig.signal)}</div>
      <div class="qd-sig-score">Score ${sig.score > 0 ? '+' : ''}${sig.score} / 10</div>
    </div>

    ${sig.signal !== 'HOLD' ? `
    <div class="qd-levels">
      <div class="qd-level"><span class="qd-lbl">ENTRY</span><span class="qd-val">${fmtPrice(sig.entry)}</span></div>
      <div class="qd-level target"><span class="qd-lbl">TARGET</span><span class="qd-val">${sig.target ? fmtPrice(sig.target) : '—'}</span></div>
      <div class="qd-level stop"><span class="qd-lbl">STOP</span><span class="qd-val">${sig.stop ? fmtPrice(sig.stop) : '—'}</span></div>
      <div class="qd-level rr"><span class="qd-lbl">R:R</span><span class="qd-val">${sig.rr ? '1:' + sig.rr : '—'}</span></div>
    </div>` : ''}

    <div class="qd-ind-grid">
      ${widgetRSI(ind.rsi)}
      ${widgetMACD(ind.macd)}
      ${widgetBB(ind.bb)}
      ${widgetEMA(ind, d.price)}
      ${widgetStoch(ind.stochRSI)}
      ${widgetVol(ind.volume)}
    </div>

    <div class="qd-reasons">
      <div class="qd-reasons-hdr">Signal Drivers</div>
      ${sig.reasons.map(r => `<div class="qd-reason">▸ ${r}</div>`).join('')}
    </div>
  `;
}

// ─── INDICATOR WIDGETS ────────────────────────
function widgetRSI(rsi) {
  const col  = rsi < 30 ? '#4ade80' : rsi > 70 ? '#f87171' : '#94a3b8';
  const zone = rsi < 25 ? 'SEVERELY OVERSOLD' : rsi < 35 ? 'OVERSOLD' : rsi > 75 ? 'SEVERELY OVERBOUGHT' : rsi > 65 ? 'OVERBOUGHT' : rsi < 50 ? 'NEUTRAL' : 'NEUTRAL';
  return `<div class="qd-ind-card">
    <div class="qd-ind-lbl">RSI (14)</div>
    <div class="qd-ind-val" style="color:${col}">${rsi}</div>
    <div class="qd-bar-track">
      <div class="qd-bar" style="width:${rsi}%;background:${col}"></div>
      <div class="qd-bar-mark" style="left:30%" title="30"></div>
      <div class="qd-bar-mark" style="left:70%" title="70"></div>
    </div>
    <div class="qd-ind-zone" style="color:${col}">${zone}</div>
  </div>`;
}

function widgetMACD(macd) {
  const col = macd.trend.startsWith('bull') ? '#4ade80' : '#f87171';
  const labels = { bullish_cross:'↑ BULL CROSS', bullish:'↑ BULLISH', bearish_cross:'↓ BEAR CROSS', bearish:'↓ BEARISH', neutral:'— NEUTRAL' };
  return `<div class="qd-ind-card">
    <div class="qd-ind-lbl">MACD</div>
    <div class="qd-ind-val" style="color:${col}">${macd.hist >= 0 ? '+' : ''}${macd.hist.toFixed(2)}</div>
    <div class="qd-ind-zone" style="color:${col}">${labels[macd.trend] || macd.trend}</div>
    <div class="qd-ind-sub">M ${macd.value.toFixed(2)} · S ${macd.signal.toFixed(2)}</div>
  </div>`;
}

function widgetBB(bb) {
  if (!bb) return `<div class="qd-ind-card"><div class="qd-ind-lbl">Bollinger</div><div class="qd-ind-zone">—</div></div>`;
  const col  = bb.pct < 0.2 ? '#4ade80' : bb.pct > 0.8 ? '#f87171' : '#94a3b8';
  const zone = bb.pct < 0.1 ? 'AT LOWER BAND' : bb.pct < 0.3 ? 'NEAR LOWER' : bb.pct > 0.9 ? 'AT UPPER BAND' : bb.pct > 0.7 ? 'NEAR UPPER' : 'MID-RANGE';
  return `<div class="qd-ind-card">
    <div class="qd-ind-lbl">Bollinger %B</div>
    <div class="qd-ind-val" style="color:${col}">${(bb.pct * 100).toFixed(0)}%</div>
    <div class="qd-bar-track">
      <div class="qd-bar" style="width:${bb.pct * 100}%;background:${col}"></div>
    </div>
    <div class="qd-ind-zone" style="color:${col}">${zone}</div>
  </div>`;
}

function widgetEMA(ind, price) {
  const a20  = price > ind.ema20;
  const a50  = price > ind.ema50;
  const a200 = price > ind.ema200;
  const bull = a20 && a50 && a200;
  const bear = !a20 && !a50 && !a200;
  const col  = bull ? '#4ade80' : bear ? '#f87171' : '#fbbf24';
  return `<div class="qd-ind-card">
    <div class="qd-ind-lbl">EMA Trend</div>
    <div class="qd-ind-val" style="color:${col}">${bull ? '▲ BULLISH' : bear ? '▼ BEARISH' : '◆ MIXED'}</div>
    <div class="qd-ema-list">
      <span class="${a20 ? 'pos' : 'neg'}">EMA20 ${a20 ? '▲' : '▼'} ${fmtPrice(ind.ema20)}</span>
      <span class="${a50 ? 'pos' : 'neg'}">EMA50 ${a50 ? '▲' : '▼'} ${fmtPrice(ind.ema50)}</span>
      <span class="${a200 ? 'pos' : 'neg'}">EMA200 ${a200 ? '▲' : '▼'} ${fmtPrice(ind.ema200)}</span>
    </div>
  </div>`;
}

function widgetStoch(stoch) {
  const col  = stoch.k < 20 ? '#4ade80' : stoch.k > 80 ? '#f87171' : '#94a3b8';
  const zone = stoch.k < 20 ? 'OVERSOLD' : stoch.k > 80 ? 'OVERBOUGHT' : 'NEUTRAL';
  return `<div class="qd-ind-card">
    <div class="qd-ind-lbl">Stoch RSI</div>
    <div class="qd-ind-val" style="color:${col}">K ${stoch.k} · D ${stoch.d}</div>
    <div class="qd-bar-track">
      <div class="qd-bar" style="width:${stoch.k}%;background:${col}"></div>
      <div class="qd-bar-mark" style="left:20%"></div>
      <div class="qd-bar-mark" style="left:80%"></div>
    </div>
    <div class="qd-ind-zone" style="color:${col}">${zone}</div>
  </div>`;
}

function widgetVol(vol) {
  const col  = vol.ratio > 1.5 ? '#00ffcc' : vol.ratio < 0.7 ? '#6b7280' : '#94a3b8';
  const zone = vol.ratio > 2.5 ? 'EXTREME SPIKE' : vol.ratio > 1.5 ? 'ABOVE AVERAGE' : vol.ratio < 0.7 ? 'LOW VOLUME' : 'NORMAL';
  const barW = Math.min(100, vol.ratio * 40);
  return `<div class="qd-ind-card">
    <div class="qd-ind-lbl">Volume</div>
    <div class="qd-ind-val" style="color:${col}">×${vol.ratio}</div>
    <div class="qd-bar-track">
      <div class="qd-bar" style="width:${barW}%;background:${col}"></div>
      <div class="qd-bar-mark" style="left:40%" title="avg"></div>
    </div>
    <div class="qd-ind-zone" style="color:${col}">${zone}</div>
  </div>`;
}

// ─── HELPERS ──────────────────────────────────
function sigLabel(sig) {
  return { STRONG_BUY:'▲▲ STRONG BUY', BUY:'▲ BUY', HOLD:'◆ HOLD', SELL:'▼ SELL', STRONG_SELL:'▼▼ STRONG SELL' }[sig] || sig;
}

function fmtPrice(p) {
  if (!p && p !== 0) return '—';
  if (p >= 10000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 100)   return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 1)     return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

// ─── BOOT ─────────────────────────────────────
window.addEventListener('load', () => {
  if (typeof apiGet === 'function') initQuant();
});
