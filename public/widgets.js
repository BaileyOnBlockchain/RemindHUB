/* =============================================
   REMINDHUB — WIDGETS
   (loaded after app.js — shares global scope)
   ============================================= */

// ─── TIMEZONE LIST ───────────────────────────
const TIMEZONES = [
  { tz: '',                    label: 'Local Time' },
  { tz: 'UTC',                 label: 'UTC' },
  { tz: 'America/New_York',    label: 'New York (ET)' },
  { tz: 'America/Chicago',     label: 'Chicago (CT)' },
  { tz: 'America/Denver',      label: 'Denver (MT)' },
  { tz: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { tz: 'America/Toronto',     label: 'Toronto (ET)' },
  { tz: 'America/Vancouver',   label: 'Vancouver (PT)' },
  { tz: 'America/Sao_Paulo',   label: 'São Paulo (BRT)' },
  { tz: 'America/Mexico_City', label: 'Mexico City (CST)' },
  { tz: 'America/Buenos_Aires',label: 'Buenos Aires (ART)' },
  { tz: 'Europe/London',       label: 'London (GMT/BST)' },
  { tz: 'Europe/Paris',        label: 'Paris (CET)' },
  { tz: 'Europe/Berlin',       label: 'Berlin (CET)' },
  { tz: 'Europe/Amsterdam',    label: 'Amsterdam (CET)' },
  { tz: 'Europe/Stockholm',    label: 'Stockholm (CET)' },
  { tz: 'Europe/Moscow',       label: 'Moscow (MSK)' },
  { tz: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
  { tz: 'Africa/Lagos',        label: 'Lagos (WAT)' },
  { tz: 'Africa/Nairobi',      label: 'Nairobi (EAT)' },
  { tz: 'Asia/Dubai',          label: 'Dubai (GST)' },
  { tz: 'Asia/Karachi',        label: 'Karachi (PKT)' },
  { tz: 'Asia/Kolkata',        label: 'Mumbai / Delhi (IST)' },
  { tz: 'Asia/Dhaka',          label: 'Dhaka (BST)' },
  { tz: 'Asia/Bangkok',        label: 'Bangkok (ICT)' },
  { tz: 'Asia/Singapore',      label: 'Singapore (SGT)' },
  { tz: 'Asia/Shanghai',       label: 'Shanghai / Beijing (CST)' },
  { tz: 'Asia/Tokyo',          label: 'Tokyo (JST)' },
  { tz: 'Asia/Seoul',          label: 'Seoul (KST)' },
  { tz: 'Australia/Perth',     label: 'Perth (AWST)' },
  { tz: 'Australia/Sydney',    label: 'Sydney (AEST)' },
  { tz: 'Pacific/Auckland',    label: 'Auckland (NZST)' },
  { tz: 'Pacific/Honolulu',    label: 'Honolulu (HST)' },
];

// ─── QUOTES ───────────────────────────────────
const QUOTES = [
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Focus is saying no to a thousand good ideas.", author: "Steve Jobs" },
  { text: "Done is better than perfect.", author: "Sheryl Sandberg" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Eat the frog — tackle your hardest task first.", author: "Brian Tracy" },
  { text: "Either you run the day or the day runs you.", author: "Jim Rohn" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Clarity is the antidote to anxiety.", author: "" },
  { text: "Productivity is never an accident. It is the result of commitment to excellence.", author: "Paul J. Meyer" },
  { text: "Small steps, every single day.", author: "" },
  { text: "Organize your life around your dreams.", author: "" },
  { text: "It's not about having time. It's about making time.", author: "" },
  { text: "If you spend too much time thinking about a thing, you'll never get it done.", author: "Bruce Lee" },
  { text: "Your future is created by what you do today.", author: "" },
  { text: "Energy flows where attention goes.", author: "" },
];

// ─── STATE ────────────────────────────────────
let clockTzArr = ['', 'UTC'];
let activeTzPicker = null;
let activeTzPickerEl = null; // the button that opened it (for positioning)
let focusMode = false;

// Floating clock state — persisted in localStorage
const floatState = {
  1: { active: false, size: 120, pos: { x: 120, y: 120 } },
  2: { active: false, size: 120, pos: { x: 300, y: 120 } },
};
let pomoSeconds = 25 * 60;
let pomoRunning = false;
let pomoBreak = false;
let pomoSessions = 0;
let pomoInterval = null;
let notesSaveTimer = null;

// ─── CLOCK SYSTEM ────────────────────────────
function initClocks() {
  if (settings.tz1 !== undefined) clockTzArr[0] = settings.tz1;
  if (settings.tz2 !== undefined) clockTzArr[1] = settings.tz2;
  updateClockLabels();
  tickClocks();
  setInterval(tickClocks, 1000);

  document.getElementById('clockTzBtn1')?.addEventListener('click', e => { e.stopPropagation(); openTzPicker(1, e.currentTarget); });
  document.getElementById('clockTzBtn2')?.addEventListener('click', e => { e.stopPropagation(); openTzPicker(2, e.currentTarget); });
  document.getElementById('tzSearch')?.addEventListener('input', e => renderTzList(e.target.value));
  document.getElementById('tzSearch')?.addEventListener('keydown', e => e.stopPropagation());

  // Float buttons
  document.getElementById('clockFloatBtn1')?.addEventListener('click', e => { e.stopPropagation(); detachClock(1); });
  document.getElementById('clockFloatBtn2')?.addEventListener('click', e => { e.stopPropagation(); detachClock(2); });

  // Restore any previously floated clocks
  loadFloatStates();
}

function tickClocks() {
  // Widget row clocks (always ticked for digital even if docked-out)
  drawClock('clock1', clockTzArr[0], 80);
  drawClock('clock2', clockTzArr[1], 80);
  const d1 = document.getElementById('clockDig1');
  const d2 = document.getElementById('clockDig2');
  if (d1) d1.textContent = getDigitalTime(clockTzArr[0]);
  if (d2) d2.textContent = getDigitalTime(clockTzArr[1]);

  // Floating clocks
  [1, 2].forEach(num => {
    if (!floatState[num].active) return;
    const sz = floatState[num].size;
    drawClock(`floatCanvas${num}`, clockTzArr[num - 1], sz);
    const dig = document.getElementById(`floatDig${num}`);
    if (dig) {
      dig.textContent = getDigitalTime(clockTzArr[num - 1]);
      dig.style.fontSize = Math.max(10, Math.round(sz / 8)) + 'px';
    }
  });
}

function getTimeInTz(tz) {
  const now = new Date();
  if (!tz) {
    return { h: now.getHours() % 12, m: now.getMinutes(), s: now.getSeconds() };
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false
    }).formatToParts(now);
    const get = type => parseInt(parts.find(p => p.type === type)?.value || '0');
    return { h: get('hour') % 12, m: get('minute'), s: get('second') };
  } catch(e) {
    return { h: 0, m: 0, s: 0 };
  }
}

function getDigitalTime(tz) {
  try {
    return new Date().toLocaleTimeString('en-GB', {
      timeZone: tz || undefined, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  } catch(e) { return '--:--:--'; }
}

function drawClock(canvasId, tz, logicalSize = 80) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width  = logicalSize + 'px';
  canvas.style.height = logicalSize + 'px';
  canvas.width  = logicalSize * dpr;
  canvas.height = logicalSize * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = logicalSize / 2, cy = logicalSize / 2, r = cx - 3;

  const cs = getComputedStyle(document.documentElement);
  const bg3    = cs.getPropertyValue('--bg3').trim()    || '#1a1a2e';
  const border = cs.getPropertyValue('--border').trim() || '#2a2a4a';
  const accent = cs.getPropertyValue('--accent').trim() || '#00ffcc';
  const text   = cs.getPropertyValue('--text').trim()   || '#e0e0f0';
  const text2  = cs.getPropertyValue('--text2').trim()  || '#8888aa';

  // Face
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bg3; ctx.fill();
  ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.stroke();

  // Ticks
  for (let i = 0; i < 60; i++) {
    const ang = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const isHour = i % 5 === 0;
    const len = isHour ? r * 0.16 : r * 0.07;
    const outerR = r - 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * outerR, cy + Math.sin(ang) * outerR);
    ctx.lineTo(cx + Math.cos(ang) * (outerR - len), cy + Math.sin(ang) * (outerR - len));
    ctx.strokeStyle = isHour ? text2 : border;
    ctx.lineWidth = isHour ? 1.5 : 0.8;
    ctx.stroke();
  }

  const { h, m, s } = getTimeInTz(tz);
  const hAng = ((h + m / 60) / 12)  * Math.PI * 2 - Math.PI / 2;
  const mAng = ((m + s / 60) / 60)  * Math.PI * 2 - Math.PI / 2;
  const sAng = (s / 60)              * Math.PI * 2 - Math.PI / 2;

  // Hour hand
  drawHand(ctx, cx, cy, hAng, r * 0.52, 2.8, text);
  // Minute hand
  drawHand(ctx, cx, cy, mAng, r * 0.76, 2.0, text);
  // Second hand + counterweight
  ctx.shadowColor = accent; ctx.shadowBlur = 8;
  drawHand(ctx, cx, cy, sAng, r * 0.84, 1.2, accent);
  drawHand(ctx, cx, cy, sAng + Math.PI, r * 0.18, 1.2, accent);
  ctx.shadowBlur = 0;

  // Center dot
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = accent; ctx.fill();
}

function drawHand(ctx, cx, cy, ang, len, w, color) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.stroke();
}

function updateClockLabels() {
  const getLabel = tz => {
    if (!tz) return 'Local';
    const found = TIMEZONES.find(t => t.tz === tz);
    return found ? found.label.split(' ')[0] : tz.split('/').pop().replace(/_/g, ' ');
  };
  const l1 = document.getElementById('clockTzLbl1');
  const l2 = document.getElementById('clockTzLbl2');
  if (l1) l1.textContent = getLabel(clockTzArr[0]);
  if (l2) l2.textContent = getLabel(clockTzArr[1]);
}

// ─── TIMEZONE PICKER ─────────────────────────
function openTzPicker(num, anchorEl) {
  activeTzPicker = num;
  const picker = document.getElementById('tzPicker');
  const btn = anchorEl || document.getElementById(`clockTzBtn${num}`);
  const rect = btn.getBoundingClientRect();
  const top = rect.bottom + 8;
  const left = Math.min(rect.left, window.innerWidth - 250);
  picker.style.top  = Math.min(top, window.innerHeight - 280) + 'px';
  picker.style.left = Math.max(8, left) + 'px';
  picker.classList.add('open');
  const search = document.getElementById('tzSearch');
  search.value = '';
  renderTzList('');
  setTimeout(() => search.focus(), 50);
}

function renderTzList(search) {
  const list = document.getElementById('tzList');
  if (!list) return;
  const q = search.toLowerCase();
  const filtered = TIMEZONES.filter(t =>
    !q || t.label.toLowerCase().includes(q) || t.tz.toLowerCase().includes(q)
  );
  list.innerHTML = filtered.map(t =>
    `<div class="tz-item${clockTzArr[activeTzPicker - 1] === t.tz ? ' active' : ''}" data-tz="${t.tz}">${t.label}</div>`
  ).join('');
  list.querySelectorAll('.tz-item').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); selectTimezone(el.dataset.tz); });
  });
}

async function selectTimezone(tz) {
  if (!activeTzPicker) return;
  const num = activeTzPicker;
  clockTzArr[num - 1] = tz;
  updateClockLabels();
  updateFloatLabel(num);
  document.getElementById('tzPicker').classList.remove('open');
  const key = num === 1 ? 'tz1' : 'tz2';
  await apiPut('/api/settings', { [key]: tz });
  activeTzPicker = null;
}

// ─── POMODORO ─────────────────────────────────
function initPomodoro() {
  document.getElementById('pomoStart')?.addEventListener('click', togglePomodoro);
  document.getElementById('pomoReset')?.addEventListener('click', resetPomodoro);
  updatePomoDisplay();
}

function togglePomodoro() {
  if (pomoRunning) {
    clearInterval(pomoInterval);
    pomoRunning = false;
    document.getElementById('pomoStart').textContent = '▶';
    document.getElementById('pomoStart').classList.remove('running');
    document.getElementById('pomoTime').classList.remove('running');
  } else {
    pomoRunning = true;
    document.getElementById('pomoStart').textContent = '⏸';
    document.getElementById('pomoStart').classList.add('running');
    document.getElementById('pomoTime').classList.add('running');
    pomoInterval = setInterval(pomoTick, 1000);
  }
}

function resetPomodoro() {
  clearInterval(pomoInterval);
  pomoRunning = false;
  pomoBreak = false;
  pomoSeconds = 25 * 60;
  pomoSessions = 0;
  document.getElementById('pomoStart').textContent = '▶';
  document.getElementById('pomoStart').classList.remove('running');
  document.getElementById('pomoTime').classList.remove('running');
  updatePomoDisplay();
}

function pomoTick() {
  pomoSeconds--;
  if (pomoSeconds <= 0) {
    playPomoSound();
    if (pomoBreak) {
      pomoBreak = false;
      pomoSeconds = 25 * 60;
      apiPost('/api/notify', { title: 'RemindHUB — Pomodoro', message: 'Break over! Time to focus 🎯' });
    } else {
      pomoSessions++;
      pomoBreak = true;
      const isLong = pomoSessions % 4 === 0;
      pomoSeconds = isLong ? 15 * 60 : 5 * 60;
      apiPost('/api/notify', { title: 'RemindHUB — Pomodoro', message: isLong ? '4 sessions done! Take a long break (15 min) 🎉' : 'Session done! Take a 5-min break ☕' });
    }
  }
  updatePomoDisplay();
}

function updatePomoDisplay() {
  const mins = Math.floor(pomoSeconds / 60);
  const secs = pomoSeconds % 60;
  const el = document.getElementById('pomoTime');
  const modeEl = document.getElementById('pomoMode');
  const cntEl = document.getElementById('pomoCnt');
  if (el) el.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  if (modeEl) {
    const label = pomoBreak ? (pomoSessions % 4 === 0 ? 'LONG BREAK' : 'SHORT BREAK') : 'FOCUS';
    modeEl.textContent = label;
    modeEl.className = 'pomo-mode' + (pomoBreak ? ' break' : '');
  }
  if (cntEl) {
    const done = pomoSessions % 4;
    cntEl.innerHTML = Array.from({length: 4}, (_, i) =>
      `<span style="color:${i < done ? 'var(--accent)' : 'var(--border)'};transition:color 0.3s">◆</span>`
    ).join(' ');
  }
}

// ─── SOUNDS ───────────────────────────────────
function playCompleteSound() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [[523.25, 0], [659.25, 0.12], [783.99, 0.24]].forEach(([freq, delay]) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ac.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.12, ac.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.38);
      osc.start(ac.currentTime + delay);
      osc.stop(ac.currentTime + delay + 0.4);
    });
  } catch(e) {}
}

function playPomoSound() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.22, 0.44].forEach(delay => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.05, ac.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.18);
      osc.start(ac.currentTime + delay);
      osc.stop(ac.currentTime + delay + 0.2);
    });
  } catch(e) {}
}

// ─── CONFETTI ─────────────────────────────────
let confettiAF = null;
function triggerConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const cs = getComputedStyle(document.documentElement);
  const colors = [
    cs.getPropertyValue('--accent').trim(),
    cs.getPropertyValue('--accent2').trim(),
    cs.getPropertyValue('--accent3').trim(),
    '#ffffff', '#ffdd00', '#ff69b4',
  ].filter(Boolean);

  const particles = Array.from({length: 80}, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 80,
    vx: (Math.random() - 0.5) * 7,
    vy: Math.random() * 3 + 1.5,
    color: colors[Math.floor(Math.random() * colors.length)],
    w: Math.random() * 10 + 4,
    h: Math.random() * 6 + 3,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.28,
  }));

  cancelAnimationFrame(confettiAF);
  let alive = true;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    alive = false;
    particles.forEach(p => {
      if (p.y > canvas.height + 20) return;
      alive = true;
      p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, 2 * (1 - p.y / canvas.height)));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive) { confettiAF = requestAnimationFrame(animate); }
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  animate();
  setTimeout(() => { cancelAnimationFrame(confettiAF); ctx.clearRect(0, 0, canvas.width, canvas.height); }, 4500);
}

// ─── FOCUS MODE ───────────────────────────────
function toggleFocusMode() {
  focusMode = !focusMode;
  document.body.classList.toggle('focus-mode', focusMode);
  const btn = document.getElementById('focusBtn');
  if (btn) {
    btn.textContent = focusMode ? '◎ Exit Focus' : '◎ Focus';
    btn.classList.toggle('active', focusMode);
  }
}

// ─── TODAY RING ───────────────────────────────
function updateTodayRing() {
  const today = new Date().toISOString().slice(0, 10);
  const todayDue = tasks.filter(t => t.dueDate === today);
  const doneDue  = todayDue.filter(t => t.status === 'done').length;
  const allDoneToday = tasks.filter(t => t.completedAt?.slice(0,10) === today).length;
  const total = todayDue.length;
  const pct = total ? doneDue / total : 0;
  const circumference = 2 * Math.PI * 22; // r=22
  const offset = circumference * (1 - pct);

  const arc = document.getElementById('todayRingArc');
  const txt = document.getElementById('todayRingText');
  const sub = document.getElementById('todaySub');
  if (arc) arc.style.strokeDashoffset = offset;
  if (txt) txt.textContent = Math.round(pct * 100) + '%';
  if (sub) sub.textContent = `${allDoneToday} done today`;
}

// ─── STREAK ───────────────────────────────────
function updateStreak() {
  const dates = [...new Set(
    tasks.filter(t => t.completedAt).map(t => t.completedAt.slice(0, 10))
  )].sort().reverse();

  if (!dates.length) { setStreakUI(0); return; }
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dates[0] !== today && dates[0] !== yesterday) { setStreakUI(0); return; }

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = Math.round((new Date(dates[i-1]) - new Date(dates[i])) / 86400000);
    if (diff === 1) streak++; else break;
  }
  setStreakUI(streak);
}
function setStreakUI(n) {
  const el = document.getElementById('streakNum');
  if (el) el.textContent = n;
}

// ─── TOPBAR PROGRESS ──────────────────────────
function updateTopbarProgress() {
  const total = tasks.length;
  const done  = tasks.filter(t => t.status === 'done').length;
  const pct   = total ? (done / total * 100) : 0;
  const fill  = document.getElementById('topbarProgressFill');
  if (fill) fill.style.width = pct + '%';
}

// ─── SCRATCH PAD ──────────────────────────────
async function initNotes() {
  const data = await apiGet('/api/notes');
  const pad  = document.getElementById('scratchPad');
  if (!pad) return;
  pad.value = data.content || '';

  pad.addEventListener('input', () => {
    const indicator = document.getElementById('notesIndicator');
    if (indicator) { indicator.textContent = 'Saving...'; indicator.className = 'notes-indicator notes-saving'; }
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(async () => {
      await apiPut('/api/notes', { content: pad.value });
      if (indicator) {
        indicator.textContent = 'Saved ✓';
        indicator.className = 'notes-indicator notes-saved-ok';
        setTimeout(() => { indicator.textContent = ''; indicator.className = 'notes-indicator'; }, 2000);
      }
    }, 600);
  });

  // Tab key inserts spaces instead of changing focus
  pad.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = pad.selectionStart, end = pad.selectionEnd;
      pad.value = pad.value.slice(0, start) + '  ' + pad.value.slice(end);
      pad.selectionStart = pad.selectionEnd = start + 2;
      pad.dispatchEvent(new Event('input'));
    }
  });
}

// ─── QUOTE ────────────────────────────────────
function renderQuote() {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const t = document.getElementById('quoteText');
  const a = document.getElementById('quoteAuthor');
  if (t) t.textContent = q.text;
  if (a) a.textContent = q.author ? `— ${q.author}` : '';
}

// ─── SHORTCUTS MODAL ──────────────────────────
function openShortcuts() {
  document.getElementById('shortcutsOverlay')?.classList.add('open');
}
function closeShortcuts() {
  document.getElementById('shortcutsOverlay')?.classList.remove('open');
}

// ─── FLOATING CLOCKS ──────────────────────────
function getClockTzLabel(num) {
  const tz = clockTzArr[num - 1];
  if (!tz) return 'Local';
  const found = TIMEZONES.find(t => t.tz === tz);
  return found ? found.label.split(' ')[0] : tz.split('/').pop().replace(/_/g, ' ');
}

function createFloatPanel(num) {
  const div = document.createElement('div');
  div.className = 'float-clock';
  div.id = `floatClock${num}`;
  div.innerHTML = `
    <div class="float-clock-header" id="floatHeader${num}">
      <span class="float-tz-name" id="floatTzName${num}">Clock ${num}</span>
      <div class="float-clock-btns">
        <button class="fc-btn" id="fcMinus${num}" title="Smaller (−)">−</button>
        <button class="fc-btn" id="fcPlus${num}"  title="Larger (+)">+</button>
        <button class="fc-btn fc-dock" id="fcDock${num}" title="Dock back">✕</button>
      </div>
    </div>
    <canvas id="floatCanvas${num}"></canvas>
    <div class="float-digital" id="floatDig${num}">00:00:00</div>
    <button class="clock-tz-btn float-tz-btn" id="floatTzBtn${num}">
      <span id="floatTzLbl${num}">${getClockTzLabel(num)}</span> ⚙
    </button>
    <div class="float-resize-grip" id="floatGrip${num}"></div>
  `;
  document.body.appendChild(div);

  div.querySelector(`#fcMinus${num}`).addEventListener('click', e => { e.stopPropagation(); resizeFloat(num, floatState[num].size - 24); });
  div.querySelector(`#fcPlus${num}`).addEventListener('click',  e => { e.stopPropagation(); resizeFloat(num, floatState[num].size + 24); });
  div.querySelector(`#fcDock${num}`).addEventListener('click',  e => { e.stopPropagation(); dockClock(num); });
  div.querySelector(`#floatTzBtn${num}`).addEventListener('click', e => { e.stopPropagation(); openTzPicker(num, e.currentTarget); });

  makeDraggable(div, document.getElementById(`floatHeader${num}`), num);
  makeResizable(div, document.getElementById(`floatGrip${num}`), num);

  return div;
}

function detachClock(num) {
  let panel = document.getElementById(`floatClock${num}`);
  if (!panel) panel = createFloatPanel(num);

  floatState[num].active = true;
  panel.classList.add('active');

  panel.style.left = floatState[num].pos.x + 'px';
  panel.style.top  = floatState[num].pos.y + 'px';

  document.getElementById(`clockWidget${num}`)?.classList.add('docked-out');
  resizeFloat(num, floatState[num].size, false); // apply size without saving
  updateFloatLabel(num);
  saveFloatState(num);
}

function dockClock(num) {
  floatState[num].active = false;
  const panel = document.getElementById(`floatClock${num}`);
  if (panel) panel.classList.remove('active');
  document.getElementById(`clockWidget${num}`)?.classList.remove('docked-out');
  saveFloatState(num);
}

function resizeFloat(num, newSize, save = true) {
  const size = Math.max(60, Math.min(300, newSize));
  floatState[num].size = size;
  const panel = document.getElementById(`floatClock${num}`);
  if (panel) {
    const padded = size + 24;
    panel.style.width = padded + 'px';
  }
  drawClock(`floatCanvas${num}`, clockTzArr[num - 1], size);
  const dig = document.getElementById(`floatDig${num}`);
  if (dig) dig.style.fontSize = Math.max(10, Math.round(size / 8)) + 'px';
  if (save) saveFloatState(num);
}

function updateFloatLabel(num) {
  const el = document.getElementById(`floatTzName${num}`);
  const lbl = document.getElementById(`floatTzLbl${num}`);
  const name = getClockTzLabel(num);
  if (el) el.textContent = name;
  if (lbl) lbl.textContent = name;
}

function makeDraggable(panel, handle, num) {
  let dragging = false, ox = 0, oy = 0;
  handle.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    ox = e.clientX - panel.offsetLeft;
    oy = e.clientY - panel.offsetTop;
    panel.style.transition = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const x = Math.max(0, Math.min(window.innerWidth  - panel.offsetWidth,  e.clientX - ox));
    const y = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, e.clientY - oy));
    panel.style.left = x + 'px';
    panel.style.top  = y + 'px';
    floatState[num].pos = { x, y };
  });
  document.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; saveFloatState(num); }
  });
}

function makeResizable(panel, grip, num) {
  let resizing = false, startX = 0, startSize = 0;
  grip.addEventListener('mousedown', e => {
    resizing = true;
    startX = e.clientX;
    startSize = floatState[num].size;
    e.preventDefault(); e.stopPropagation();
  });
  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const delta = e.clientX - startX;
    resizeFloat(num, startSize + delta, false);
  });
  document.addEventListener('mouseup', () => {
    if (resizing) { resizing = false; saveFloatState(num); }
  });
}

function saveFloatState(num) {
  localStorage.setItem(`rhFloatClock${num}`, JSON.stringify(floatState[num]));
}

function loadFloatStates() {
  [1, 2].forEach(num => {
    const saved = JSON.parse(localStorage.getItem(`rhFloatClock${num}`) || 'null');
    if (!saved) return;
    floatState[num] = { ...floatState[num], ...saved };
    if (floatState[num].active) {
      // Small delay so DOM is ready
      setTimeout(() => detachClock(num), 50);
    }
  });
}

// ─── SETUP (called from app.js init via setTimeout) ──
function setupWidgetEvents() {
  // Focus mode
  document.getElementById('focusBtn')?.addEventListener('click', toggleFocusMode);

  // Shortcuts modal
  document.getElementById('shortcutsBtn')?.addEventListener('click', e => { e.stopPropagation(); openShortcuts(); });
  document.getElementById('shortcutsClose')?.addEventListener('click', closeShortcuts);
  document.getElementById('shortcutsOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('shortcutsOverlay')) closeShortcuts();
  });

  // Close TZ picker on outside click
  document.addEventListener('click', () => {
    document.getElementById('tzPicker')?.classList.remove('open');
    activeTzPicker = null;
  });
}
