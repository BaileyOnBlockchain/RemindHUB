/* =============================================
   REMINDHUB — DRAW PAD
   ============================================= */

const DRAW_KEY     = 'rhDrawCanvas';
const MAX_HISTORY  = 25;
const DRAW_PALETTE = [
  '#ffffff','#c0c0c0','#000000',
  '#ff3366','#ff6b35','#ffd700',
  '#4ade80','#00ffcc','#00bfff',
  '#7b2fff','#ff00cc','#a78bfa',
];

let isDrawing   = false;
let drawTool    = 'pen';
let drawColor   = '#ffffff';
let drawSize    = 4;
let drawHistory = [];
let drawHistIdx = -1;
let lastPos     = null;

// ─── INIT ─────────────────────────────────────
function initDraw() {
  buildPalette();
  bindToolbar();
  bindModeToggle();
  bindCanvasEvents();
  // Restore saved drawing when view becomes active
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.dataset.view === 'notes') {
      btn.addEventListener('click', () => setTimeout(restoreDrawing, 50));
    }
  });
}

function buildPalette() {
  const row = document.getElementById('drawColorsRow');
  if (!row) return;

  // Use theme accent as first color
  const cs = getComputedStyle(document.documentElement);
  drawColor = cs.getPropertyValue('--accent').trim() || '#00ffcc';

  row.innerHTML = DRAW_PALETTE.map(c =>
    `<button class="draw-color-swatch${c === drawColor ? ' active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`
  ).join('') + `<input type="color" id="drawColorPicker" class="draw-color-picker" value="${drawColor}" title="Custom colour" />`;

  row.querySelectorAll('.draw-color-swatch').forEach(btn => {
    btn.addEventListener('click', () => setDrawColor(btn.dataset.color, btn));
  });

  const picker = document.getElementById('drawColorPicker');
  picker?.addEventListener('input', () => { setDrawColor(picker.value); });
}

function setDrawColor(color, btn) {
  drawColor = color;
  drawTool  = 'pen';
  document.querySelectorAll('.draw-color-swatch').forEach(b => b.classList.toggle('active', b.dataset.color === color));
  document.getElementById('drawPen')?.classList.add('active');
  document.getElementById('drawEraser')?.classList.remove('active');
  const picker = document.getElementById('drawColorPicker');
  if (picker) picker.value = color;
}

function bindToolbar() {
  document.getElementById('drawPen')?.addEventListener('click', () => {
    drawTool = 'pen';
    document.getElementById('drawPen').classList.add('active');
    document.getElementById('drawEraser').classList.remove('active');
    document.getElementById('drawCanvas').style.cursor = 'crosshair';
  });

  document.getElementById('drawEraser')?.addEventListener('click', () => {
    drawTool = 'eraser';
    document.getElementById('drawEraser').classList.add('active');
    document.getElementById('drawPen').classList.remove('active');
    document.getElementById('drawCanvas').style.cursor = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='10' fill='none' stroke='white' stroke-width='2'/></svg>") 12 12, crosshair`;
  });

  const sizeInput = document.getElementById('drawSize');
  const sizeVal   = document.getElementById('drawSizeVal');
  sizeInput?.addEventListener('input', () => {
    drawSize = parseInt(sizeInput.value);
    if (sizeVal) sizeVal.textContent = drawSize;
  });

  document.getElementById('drawUndo')?.addEventListener('click', undoDraw);
  document.getElementById('drawClear')?.addEventListener('click', clearCanvas);
  document.getElementById('drawSave')?.addEventListener('click', saveAsPNG);

  // Ctrl+Z undo
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'z' && drawMode) { e.preventDefault(); undoDraw(); }
  });
}

function bindModeToggle() {
  document.getElementById('padTextBtn')?.addEventListener('click', () => switchPadMode('text'));
  document.getElementById('padDrawBtn')?.addEventListener('click', () => {
    switchPadMode('draw');
    setTimeout(() => { resizeCanvas(); restoreDrawing(); }, 30);
  });
}

let drawMode = false;
function switchPadMode(mode) {
  drawMode = (mode === 'draw');
  const pad = document.getElementById('scratchPad');
  const dc  = document.getElementById('drawContainer');
  if (pad) pad.style.display = drawMode ? 'none' : '';
  if (dc)  dc.classList.toggle('active', drawMode);
  document.getElementById('padTextBtn')?.classList.toggle('active', !drawMode);
  document.getElementById('padDrawBtn')?.classList.toggle('active', drawMode);
}

// ─── CANVAS EVENTS ────────────────────────────
function bindCanvasEvents() {
  const canvas = document.getElementById('drawCanvas');
  if (!canvas) return;

  canvas.addEventListener('mousedown',  e => startStroke(e));
  canvas.addEventListener('mousemove',  e => stroke(e));
  canvas.addEventListener('mouseup',    () => endStroke());
  canvas.addEventListener('mouseleave', () => endStroke());

  canvas.addEventListener('touchstart', e => { e.preventDefault(); startStroke(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); stroke(e.touches[0]); },      { passive: false });
  canvas.addEventListener('touchend',   () => endStroke(),                                        { passive: false });

  window.addEventListener('resize', () => { if (drawMode) { resizeCanvas(true); } });
}

function canvasPos(e) {
  const canvas = document.getElementById('drawCanvas');
  const rect   = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}

function startStroke(e) {
  const canvas = document.getElementById('drawCanvas');
  const ctx    = canvas.getContext('2d');
  isDrawing = true;
  lastPos   = canvasPos(e);

  ctx.beginPath();
  ctx.moveTo(lastPos.x, lastPos.y);
  applyDrawStyle(ctx);

  // Draw a dot on single click
  ctx.arc(lastPos.x, lastPos.y, (drawTool === 'eraser' ? drawSize * 2 : drawSize) / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(lastPos.x, lastPos.y);
}

function stroke(e) {
  if (!isDrawing) return;
  const canvas = document.getElementById('drawCanvas');
  const ctx    = canvas.getContext('2d');
  const pos    = canvasPos(e);

  applyDrawStyle(ctx);
  ctx.beginPath();
  ctx.moveTo(lastPos.x, lastPos.y);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  lastPos = pos;
}

function endStroke() {
  if (!isDrawing) return;
  isDrawing = false;
  lastPos   = null;
  pushHistory();
  autosaveDraw();
}

function applyDrawStyle(ctx) {
  if (drawTool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle   = 'rgba(0,0,0,1)';
    ctx.lineWidth   = drawSize * 3;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = drawColor;
    ctx.fillStyle   = drawColor;
    ctx.lineWidth   = drawSize;
  }
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
}

// ─── HISTORY ──────────────────────────────────
function pushHistory() {
  const canvas = document.getElementById('drawCanvas');
  if (!canvas) return;
  drawHistory = drawHistory.slice(0, drawHistIdx + 1);
  drawHistory.push(canvas.toDataURL());
  if (drawHistory.length > MAX_HISTORY) drawHistory.shift();
  drawHistIdx = drawHistory.length - 1;
}

function undoDraw() {
  if (drawHistIdx <= 0) return;
  drawHistIdx--;
  restoreFromHistory(drawHistory[drawHistIdx]);
  autosaveDraw();
}

function restoreFromHistory(dataURL) {
  const canvas = document.getElementById('drawCanvas');
  const ctx    = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!dataURL) return;
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0);
  img.src = dataURL;
}

// ─── SAVE / RESTORE ───────────────────────────
function autosaveDraw() {
  const canvas = document.getElementById('drawCanvas');
  if (canvas) localStorage.setItem(DRAW_KEY, canvas.toDataURL('image/png'));
}

function restoreDrawing() {
  const canvas = document.getElementById('drawCanvas');
  if (!canvas) return;
  resizeCanvas(false);
  const saved = localStorage.getItem(DRAW_KEY);
  if (!saved) { pushHistory(); return; }
  const img = new Image();
  img.onload = () => {
    canvas.getContext('2d').drawImage(img, 0, 0);
    if (drawHistory.length === 0) pushHistory();
  };
  img.src = saved;
}

function resizeCanvas(preserveContent = true) {
  const canvas    = document.getElementById('drawCanvas');
  const container = document.getElementById('drawContainer');
  const toolbar   = document.getElementById('drawToolbar');
  if (!canvas || !container) return;

  const tbH = toolbar ? toolbar.offsetHeight + 1 : 52;
  const w   = container.clientWidth  || 900;
  const h   = Math.max(200, (container.clientHeight || 600) - tbH);

  if (canvas.width === w && canvas.height === h) return;

  let snapshot = '';
  if (preserveContent && canvas.width > 0) snapshot = canvas.toDataURL();

  canvas.width  = w;
  canvas.height = h;

  if (snapshot) {
    const img = new Image();
    img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0);
    img.src = snapshot;
  }
}

function clearCanvas() {
  if (!confirm('Clear the canvas?')) return;
  const canvas = document.getElementById('drawCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  localStorage.removeItem(DRAW_KEY);
  drawHistory = []; drawHistIdx = -1;
  pushHistory();
}

function saveAsPNG() {
  const canvas = document.getElementById('drawCanvas');
  if (!canvas) return;
  // Composite onto white background for PNG
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width; tmp.height = canvas.height;
  const ctx = tmp.getContext('2d');
  ctx.fillStyle = '#0e0b26';
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(canvas, 0, 0);
  const a = document.createElement('a');
  a.download = `remindhub-sketch-${Date.now()}.png`;
  a.href = tmp.toDataURL('image/png');
  a.click();
}

// ─── BOOT ─────────────────────────────────────
window.addEventListener('load', initDraw);
