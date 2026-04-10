/* =============================================
   REMINDHUB — FRONTEND APP
   ============================================= */

const API = '';
let tasks = [];
let settings = { theme: 'cyberpunk' };
let editingId = null;
let activeFilter = 'all';
let activeView = 'dashboard';
let searchQuery = '';

// ─── INIT ────────────────────────────────────
async function init() {
  await loadSettings();
  await loadTasks();
  setupEventListeners();
  setupDetailsListeners();
  render();
  startNotificationPoller();
  // Init widgets after both scripts are loaded
  setTimeout(() => {
    if (typeof initClocks        === 'function') initClocks();
    if (typeof initPomodoro      === 'function') initPomodoro();
    if (typeof initNotes         === 'function') initNotes();
    if (typeof updateTodayRing   === 'function') { updateTodayRing(); updateStreak(); updateTopbarProgress(); renderQuote(); }
    if (typeof setupWidgetEvents === 'function') setupWidgetEvents();
  }, 0);
}

function switchView(name) {
  activeView = name;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.mnav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  closeMobileSidebar();
  render();
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
}

// ─── API ─────────────────────────────────────
async function apiGet(path) {
  const r = await fetch(API + path);
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function apiPut(path, body) {
  const r = await fetch(API + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function apiFetch(path) {
  const r = await fetch(API + path, { method: 'DELETE' });
  return r.json();
}

async function loadTasks() {
  tasks = await apiGet('/api/tasks');
}
async function loadSettings() {
  settings = await apiGet('/api/settings');
  applyTheme(settings.theme);
}

// ─── THEME ───────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  settings.theme = theme;
  document.querySelectorAll('.theme-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
}
async function saveTheme(theme) {
  applyTheme(theme);
  await apiPut('/api/settings', { theme });
}

// ─── EVENT LISTENERS ─────────────────────────
function setupEventListeners() {
  // View nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeView = btn.dataset.view;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + activeView).classList.add('active');
      render();
    });
  });

  // Filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  });

  // Sidebar toggle — desktop: collapsed class; mobile: open class + overlay
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) {
      const isOpen = sidebar.classList.toggle('open');
      overlay.classList.toggle('visible', isOpen);
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  // Close sidebar when overlay is tapped on mobile
  document.getElementById('sidebarOverlay').addEventListener('click', closeMobileSidebar);

  // Mobile bottom nav
  document.querySelectorAll('.mnav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      document.querySelectorAll('.mnav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchView(view);
    });
  });

  // Search
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    render();
  });

  // Add task button
  document.getElementById('addTaskBtn').addEventListener('click', () => openModal());

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('modalSave').addEventListener('click', saveTask);
  document.getElementById('addStepBtn').addEventListener('click', () => addStepField());

  // Theme picker
  document.getElementById('themeToggleBtn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('themePicker').classList.toggle('open');
  });
  document.querySelectorAll('.theme-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      saveTheme(btn.dataset.theme);
      document.getElementById('themePicker').classList.remove('open');
    });
  });
  document.addEventListener('click', () => {
    document.getElementById('themePicker').classList.remove('open');
  });

  // Sort/Group
  document.getElementById('sortSelect').addEventListener('change', render);
  document.getElementById('groupSelect').addEventListener('change', render);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Escape') { closeModal(); closeTaskDetails(); if (typeof closeShortcuts === 'function') closeShortcuts(); return; }
    if (typing) return;
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey) { openModal(); return; }
    if (e.key === '?') { if (typeof openShortcuts === 'function') openShortcuts(); return; }
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey) { if (typeof toggleFocusMode === 'function') toggleFocusMode(); return; }
    if (e.key === 'p' && !e.ctrlKey && !e.metaKey) { if (typeof togglePomodoro === 'function') togglePomodoro(); return; }
    const views = ['dashboard', 'tasks', 'matrix', 'calendar', 'notes'];
    const idx = parseInt(e.key) - 1;
    if (idx >= 0 && idx < views.length && !e.ctrlKey && !e.metaKey) switchView(views[idx]);
  });
}

// ─── FILTERING & SORTING ─────────────────────
function getFilteredTasks() {
  return tasks.filter(t => {
    if (searchQuery) {
      const s = searchQuery;
      if (!t.title.toLowerCase().includes(s) &&
          !t.notes.toLowerCase().includes(s) &&
          !t.category.toLowerCase().includes(s) &&
          !(t.tags || []).join(' ').toLowerCase().includes(s)) return false;
    }
    if (activeFilter === 'all') return true;
    if (['todo', 'inprogress', 'done'].includes(activeFilter)) return t.status === activeFilter;
    if (['critical', 'high', 'medium', 'low'].includes(activeFilter)) return t.priority === activeFilter;
    return true;
  });
}

function sortTasks(arr) {
  const sort = document.getElementById('sortSelect')?.value || 'priority';
  const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...arr].sort((a, b) => {
    if (sort === 'priority') return (pOrder[a.priority] || 2) - (pOrder[b.priority] || 2);
    if (sort === 'due') {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    }
    if (sort === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sort === 'title') return a.title.localeCompare(b.title);
    return 0;
  });
}

function isOverdue(task) {
  if (!task.dueDate || task.status === 'done') return false;
  const due = new Date(task.dueDate + 'T23:59');
  return due < new Date();
}

// ─── RENDER ──────────────────────────────────
function render() {
  renderStats();
  if (activeView === 'dashboard') renderDashboard();
  if (activeView === 'tasks') renderAllTasks();
  if (activeView === 'matrix') renderMatrix();
  if (activeView === 'calendar') renderTimeline();
}

function renderStats() {
  const done = tasks.filter(t => t.status === 'done').length;
  const todo = tasks.filter(t => t.status === 'todo').length;
  const inprog = tasks.filter(t => t.status === 'inprogress').length;
  const overdue = tasks.filter(isOverdue).length;
  const critical = tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length;

  const od = document.getElementById('statOverdue');
  const cr = document.getElementById('statCritical');
  od.textContent = overdue ? `${overdue} OVERDUE` : '';
  od.className = 'stat-pill' + (overdue ? ' overdue' : '');
  cr.textContent = critical ? `${critical} CRITICAL` : '';
  cr.className = 'stat-pill' + (critical ? ' critical' : '');

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card s-warn"><div class="sc-value">${todo}</div><div class="sc-label">To Do</div></div>
    <div class="stat-card s-mid"><div class="sc-value">${inprog}</div><div class="sc-label">In Progress</div></div>
    <div class="stat-card s-success"><div class="sc-value">${done}</div><div class="sc-label">Completed</div></div>
    <div class="stat-card s-danger"><div class="sc-value">${overdue}</div><div class="sc-label">Overdue</div></div>
    <div class="stat-card"><div class="sc-value">${tasks.length}</div><div class="sc-label">Total Tasks</div></div>
    <div class="stat-card"><div class="sc-value">${tasks.length ? Math.round(done / tasks.length * 100) : 0}%</div><div class="sc-label">Complete</div></div>
  `;
}

function renderDashboard() {
  const urgent = tasks.filter(t => t.status !== 'done' && (t.priority === 'critical' || isOverdue(t)));
  const upnext = sortTasks(tasks.filter(t => t.status !== 'done' && !urgent.includes(t))).slice(0, 8);
  const recentDone = tasks.filter(t => t.status === 'done').sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 6);

  document.getElementById('urgentList').innerHTML = urgent.length
    ? urgent.map(t => taskCardHTML(t)).join('')
    : emptyState('No critical tasks');
  document.getElementById('upNextList').innerHTML = upnext.length
    ? upnext.map(t => taskCardHTML(t)).join('')
    : emptyState('All clear!');
  document.getElementById('recentDoneList').innerHTML = recentDone.length
    ? recentDone.map(t => taskCardHTML(t)).join('')
    : emptyState('No completed tasks yet');

  attachCardListeners();
}

function renderAllTasks() {
  const filtered = sortTasks(getFilteredTasks());
  const group = document.getElementById('groupSelect')?.value || 'none';
  const el = document.getElementById('allTasksList');

  if (!filtered.length) { el.innerHTML = emptyState('No tasks match this filter'); return; }

  if (group === 'none') {
    el.innerHTML = filtered.map(t => taskCardHTML(t)).join('');
  } else {
    const groups = {};
    filtered.forEach(t => {
      const key = group === 'priority' ? t.priority
        : group === 'category' ? (t.category || 'Uncategorized')
        : t.status;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    const pOrder = ['critical', 'high', 'medium', 'low'];
    const keys = group === 'priority'
      ? pOrder.filter(k => groups[k])
      : Object.keys(groups).sort();
    el.innerHTML = keys.map(k =>
      `<div class="group-header">${k.toUpperCase()} (${groups[k].length})</div>${groups[k].map(t => taskCardHTML(t)).join('')}`
    ).join('');
  }
  attachCardListeners();
}

function renderMatrix() {
  const active = tasks.filter(t => t.status !== 'done');
  const q1 = active.filter(t => t.urgency && t.importance);
  const q2 = active.filter(t => !t.urgency && t.importance);
  const q3 = active.filter(t => t.urgency && !t.importance);
  const q4 = active.filter(t => !t.urgency && !t.importance);

  ['qTasks1', 'qTasks2', 'qTasks3', 'qTasks4'].forEach((id, i) => {
    const arr = [q1, q2, q3, q4][i];
    document.getElementById(id).innerHTML = arr.length
      ? arr.map(t => `<div class="q-task-item" data-id="${t.id}">${priorityDot(t.priority)} ${escHtml(t.title)}</div>`).join('')
      : `<div style="color:var(--text2);font-size:12px;padding:8px">None</div>`;
  });

  document.querySelectorAll('.q-task-item').forEach(el => {
    el.addEventListener('click', () => openModal(el.dataset.id));
  });
}

function renderTimeline() {
  const withDates = tasks.filter(t => t.dueDate && t.status !== 'done');
  const overdue = tasks.filter(t => t.dueDate && isOverdue(t));
  const container = document.getElementById('timelineContainer');

  if (!withDates.length && !overdue.length) {
    container.innerHTML = emptyState('No tasks with due dates');
    return;
  }

  // Group by date
  const groups = {};
  [...withDates, ...overdue.filter(t => !withDates.includes(t))].forEach(t => {
    const d = t.dueDate;
    if (!groups[d]) groups[d] = [];
    if (!groups[d].includes(t)) groups[d].push(t);
  });

  const today = new Date().toISOString().slice(0, 10);
  const sorted = Object.keys(groups).sort();

  container.innerHTML = sorted.map(date => {
    const isToday = date === today;
    const isOD = date < today;
    const label = isOD ? `OVERDUE — ${formatDate(date)}` : isToday ? `TODAY — ${formatDate(date)}` : formatDate(date);
    const cls = isOD ? 'overdue' : isToday ? 'today' : '';
    return `
      <div class="timeline-day">
        <div class="timeline-day-header ${cls}">
          ${label}
          <span class="tl-badge">${groups[date].length}</span>
        </div>
        <div class="timeline-tasks">
          ${groups[date].map(t => taskCardHTML(t)).join('')}
        </div>
      </div>
    `;
  }).join('');

  attachCardListeners();
}

// ─── TASK CARD HTML ───────────────────────────
function taskCardHTML(task) {
  const overdue = isOverdue(task);
  const doneSteps = (task.steps || []).filter(s => s.done).length;
  const totalSteps = (task.steps || []).length;
  const pct = totalSteps ? Math.round(doneSteps / totalSteps * 100) : null;
  const dueFmt = task.dueDate ? `<span>${overdue ? '⚠ ' : ''}${formatDate(task.dueDate)}${task.dueTime ? ' ' + task.dueTime : ''}</span>` : '';
  const catBadge = task.category ? `<span class="task-tag">${escHtml(task.category)}</span>` : '';
  const recurBadge = task.recurring ? `<span class="recurring-badge">↺ ${task.recurring}</span>` : '';
  const tagBadges = (task.tags || []).filter(Boolean).map(t => `<span class="task-tag">${escHtml(t)}</span>`).join('');
  const statusIcon = task.status === 'done' ? '✓' : task.status === 'inprogress' ? '◎' : '';
  const stepsHTML = pct !== null ? `
    <div class="steps-mini">
      <div style="font-size:10px;color:var(--text2)">${doneSteps}/${totalSteps} steps</div>
      <div class="step-bar"><div class="step-bar-fill" style="width:${pct}%"></div></div>
    </div>` : '';

  return `
    <div class="task-card p-${task.priority} s-${task.status}${overdue ? ' overdue' : ''}" data-id="${task.id}">
      <div class="task-title-row">
        <div class="task-checkbox" data-id="${task.id}" data-action="toggle">${statusIcon}</div>
        <div class="task-title">${escHtml(task.title)}</div>
      </div>
      <div class="task-meta">
        <span class="task-priority-badge pb-${task.priority}">${task.priority}</span>
        ${catBadge}${dueFmt}${recurBadge}${tagBadges}
      </div>
      ${stepsHTML}
      <div class="task-actions">
        <button class="task-action-btn" data-id="${task.id}" data-action="status" title="Cycle Status">⟳</button>
        <button class="task-action-btn" data-id="${task.id}" data-action="edit" title="Edit">✎</button>
        <button class="task-action-btn del" data-id="${task.id}" data-action="delete" title="Delete">✕</button>
      </div>
    </div>
  `;
}

function attachCardListeners() {
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', async e => {
      e.stopPropagation();
      const id = el.dataset.id;
      const action = el.dataset.action;
      if (action === 'toggle') await cycleStatus(id);
      if (action === 'status') await cycleStatus(id);
      if (action === 'edit') openModal(id);
      if (action === 'delete') await deleteTask(id);
    });
  });
  // Click card body = details view (not edit)
  document.querySelectorAll('.task-card').forEach(el => {
    el.addEventListener('click', e => {
      if (!e.target.closest('[data-action]')) openTaskDetails(el.dataset.id);
    });
  });
}

// ─── TASK DETAILS (read-only popup) ──────────
let detailsTaskId = null;
function openTaskDetails(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  detailsTaskId = id;

  const pColors = { critical: 'var(--danger)', high: 'var(--warn)', medium: '#f0e020', low: 'var(--success)' };
  const pLabels = { critical: '🔴 Critical', high: '🟠 High', medium: '🟡 Medium', low: '🟢 Low' };
  const sLabels = { todo: 'To Do', inprogress: 'In Progress', done: 'Done' };

  // Priority bar
  const bar = document.getElementById('detailsPriorityBar');
  if (bar) bar.style.background = pColors[task.priority] || 'var(--border)';

  // Status badge
  const sb = document.getElementById('detailsStatusBadge');
  if (sb) { sb.textContent = sLabels[task.status] || task.status; sb.className = `details-status-badge ds-${task.status}`; }

  // Title
  document.getElementById('detailsTitle').textContent = task.title;

  // Body
  const body = document.getElementById('detailsBody');
  const doneSteps = (task.steps||[]).filter(s=>s.done).length;
  const totalSteps = (task.steps||[]).length;

  const chips = [
    { label: 'Priority',  value: pLabels[task.priority] || task.priority },
    task.category ? { label: 'Category', value: task.category } : null,
    task.dueDate  ? { label: 'Due',      value: formatDate(task.dueDate) + (task.dueTime ? ' ' + task.dueTime : '') } : null,
    task.recurring? { label: 'Recurring',value: task.recurring } : null,
  ].filter(Boolean);

  const matrixBadges = [
    task.urgency    ? `<span class="details-matrix-badge m-urgent">⚡ Urgent</span>` : '',
    task.importance ? `<span class="details-matrix-badge m-important">★ Important</span>` : '',
  ].filter(Boolean).join('');

  const tagsHTML = (task.tags||[]).filter(Boolean).length
    ? `<div class="details-section"><div class="details-label">TAGS</div><div class="details-tags">${task.tags.filter(Boolean).map(t=>`<span class="task-tag">${escHtml(t)}</span>`).join('')}</div></div>`
    : '';

  const notesHTML = task.notes
    ? `<div class="details-section"><div class="details-label">NOTES</div><div class="details-notes-block">${escHtml(task.notes)}</div></div>`
    : '';

  const stepsHTML = totalSteps
    ? `<div class="details-section">
        <div class="details-label">STEPS &nbsp;<span style="color:var(--accent)">${doneSteps}/${totalSteps}</span></div>
        <div class="details-step-bar-wrap"><div class="step-bar"><div class="step-bar-fill" style="width:${Math.round(doneSteps/totalSteps*100)}%"></div></div></div>
        <div class="details-step-list">${(task.steps||[]).map(s=>`
          <div class="details-step${s.done?' done':''}">
            <div class="details-step-check">${s.done?'✓':''}</div>
            <span>${escHtml(s.text)}</span>
          </div>`).join('')}
        </div>
      </div>`
    : '';

  const createdFmt = task.createdAt ? new Date(task.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
  const doneFmt    = task.completedAt ? new Date(task.completedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

  body.innerHTML = `
    <div class="details-chips">${chips.map(c=>`<div class="details-chip"><div class="details-chip-label">${c.label}</div><div class="details-chip-val">${escHtml(c.value)}</div></div>`).join('')}</div>
    ${matrixBadges ? `<div class="details-matrix-row">${matrixBadges}</div>` : ''}
    ${tagsHTML}
    ${notesHTML}
    ${stepsHTML}
    <div class="details-dates">
      ${createdFmt ? `<span>Created ${createdFmt}</span>` : ''}
      ${task.status==='done' ? `<span>Completed ${doneFmt}</span>` : ''}
    </div>
  `;

  document.getElementById('detailsOverlay').classList.add('open');
}

function closeTaskDetails() {
  document.getElementById('detailsOverlay')?.classList.remove('open');
  detailsTaskId = null;
}

function setupDetailsListeners() {
  document.getElementById('detailsClose')?.addEventListener('click', closeTaskDetails);
  document.getElementById('detailsCloseBtn')?.addEventListener('click', closeTaskDetails);
  document.getElementById('detailsOverlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('detailsOverlay')) closeTaskDetails();
  });
  document.getElementById('detailsEditBtn')?.addEventListener('click', () => {
    const id = detailsTaskId;
    closeTaskDetails();
    if (id) openModal(id);
  });
}

async function cycleStatus(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const next = { todo: 'inprogress', inprogress: 'done', done: 'todo' };
  const nextStatus = next[task.status];
  const updated = await apiPut(`/api/tasks/${id}`, { status: nextStatus });
  tasks = tasks.map(t => t.id === id ? updated : t);
  if (nextStatus === 'done') {
    if (typeof playCompleteSound === 'function') playCompleteSound();
    if (typeof triggerConfetti   === 'function') triggerConfetti();
  }
  if (typeof updateTodayRing      === 'function') updateTodayRing();
  if (typeof updateStreak         === 'function') updateStreak();
  if (typeof updateTopbarProgress === 'function') updateTopbarProgress();
  render();
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await apiFetch(`/api/tasks/${id}`);
  tasks = tasks.filter(t => t.id !== id);
  render();
}

// ─── MODAL ───────────────────────────────────
function openModal(id = null) {
  editingId = id;
  const task = id ? tasks.find(t => t.id === id) : null;
  document.getElementById('modalTitle').textContent = id ? 'Edit Task' : 'New Task';
  document.getElementById('taskTitle').value = task?.title || '';
  document.getElementById('taskNotes').value = task?.notes || '';
  document.getElementById('taskPriority').value = task?.priority || 'medium';
  document.getElementById('taskCategory').value = task?.category || '';
  document.getElementById('taskDueDate').value = task?.dueDate || '';
  document.getElementById('taskDueTime').value = task?.dueTime || '';
  document.getElementById('taskRecurring').value = task?.recurring || '';
  document.getElementById('taskTags').value = (task?.tags || []).join(', ');
  document.getElementById('taskUrgent').checked = task?.urgency || false;
  document.getElementById('taskImportant').checked = task?.importance || false;

  // Steps
  const sc = document.getElementById('stepsContainer');
  sc.innerHTML = '';
  if (task?.steps?.length) {
    const sl = document.createElement('div');
    sl.className = 'steps-list';
    sl.id = 'stepsList';
    sc.appendChild(sl);
    task.steps.forEach(s => addStepField(s));
  } else {
    const sl = document.createElement('div');
    sl.className = 'steps-list';
    sl.id = 'stepsList';
    sc.appendChild(sl);
  }

  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('taskTitle').focus(), 50);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}

function addStepField(step = null) {
  let sl = document.getElementById('stepsList');
  if (!sl) {
    sl = document.createElement('div');
    sl.className = 'steps-list';
    sl.id = 'stepsList';
    document.getElementById('stepsContainer').insertBefore(sl, document.getElementById('addStepBtn'));
  }
  const item = document.createElement('div');
  item.className = 'step-item';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = step?.done || false;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = step?.text || '';
  inp.placeholder = 'Step description...';
  const del = document.createElement('button');
  del.className = 'step-del';
  del.textContent = '✕';
  del.type = 'button';
  del.addEventListener('click', () => item.remove());
  item.appendChild(cb); item.appendChild(inp); item.appendChild(del);
  sl.appendChild(item);
  inp.focus();
}

async function saveTask() {
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) { document.getElementById('taskTitle').focus(); return; }

  const steps = [...document.querySelectorAll('#stepsList .step-item')].map(el => ({
    text: el.querySelector('input[type="text"]').value.trim(),
    done: el.querySelector('input[type="checkbox"]').checked
  })).filter(s => s.text);

  const payload = {
    title,
    notes: document.getElementById('taskNotes').value.trim(),
    priority: document.getElementById('taskPriority').value,
    category: document.getElementById('taskCategory').value.trim(),
    dueDate: document.getElementById('taskDueDate').value || null,
    dueTime: document.getElementById('taskDueTime').value || null,
    recurring: document.getElementById('taskRecurring').value || null,
    tags: document.getElementById('taskTags').value.split(',').map(t => t.trim()).filter(Boolean),
    urgency: document.getElementById('taskUrgent').checked,
    importance: document.getElementById('taskImportant').checked,
    steps
  };

  if (editingId) {
    const updated = await apiPut(`/api/tasks/${editingId}`, payload);
    tasks = tasks.map(t => t.id === editingId ? updated : t);
  } else {
    const created = await apiPost('/api/tasks', payload);
    tasks.push(created);
  }

  closeModal();
  render();
}

// ─── NOTIFICATIONS ────────────────────────────
function startNotificationPoller() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
  setInterval(() => {
    const now = new Date();
    tasks.forEach(task => {
      if (task.status === 'done' || !task.dueDate) return;
      const due = new Date(task.dueDate + (task.dueTime ? 'T' + task.dueTime : 'T23:59'));
      const diffMin = (due - now) / 60000;
      // Remind 30 min before
      if (diffMin > 29 && diffMin < 31) {
        showBrowserNotif(`RemindHUB — ${task.priority.toUpperCase()}`, `Due in 30 min: ${task.title}`);
      }
    });
  }, 60 * 1000);
}

function showBrowserNotif(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon.png' });
  }
  // Also ping server for OS notification
  apiPost('/api/notify', { title, message: body });
}

// ─── HELPERS ─────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}
function priorityDot(p) {
  const colors = { critical: 'var(--danger)', high: 'var(--warn)', medium: '#f0e020', low: 'var(--success)' };
  return `<span style="color:${colors[p] || 'var(--text2)'}">⬤</span>`;
}
function emptyState(msg) {
  return `<div class="empty-state"><div class="es-icon">◌</div>${msg}</div>`;
}

// ─── DEVICE DETECTION ────────────────────────
function isMobile() { return window.innerWidth <= 768; }

function applyDeviceLayout() {
  const sidebar = document.getElementById('sidebar');
  if (isMobile()) {
    // Mobile: sidebar starts closed (drawer mode)
    sidebar.classList.remove('collapsed', 'open');
  } else {
    // Desktop: restore collapse state from localStorage
    const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    sidebar.classList.toggle('collapsed', collapsed);
    sidebar.classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
  }
}

// Persist desktop sidebar state
document.getElementById('sidebarToggle').addEventListener('click', () => {
  if (!isMobile()) {
    const collapsed = document.getElementById('sidebar').classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', collapsed);
  }
}, true); // capture phase — runs before the handler in setupEventListeners

window.addEventListener('resize', applyDeviceLayout);

// ─── LIVE SYNC (SSE) ─────────────────────────
function startSSE() {
  const es = new EventSource('/api/events');

  es.onmessage = async (e) => {
    if (e.data === 'connected') return;
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    // Flash sync dot on any incoming event
    const dot = document.getElementById('syncDot');
    if (dot) { dot.classList.remove('pulse'); void dot.offsetWidth; dot.classList.add('pulse'); }

    // tasks: always reload & re-render (idempotent if data unchanged)
    if (msg.type === 'tasks') {
      tasks = await apiGet('/api/tasks');
      render();
      if (typeof updateTodayRing      === 'function') updateTodayRing();
      if (typeof updateStreak         === 'function') updateStreak();
      if (typeof updateTopbarProgress === 'function') updateTopbarProgress();
    }
    // settings: re-apply theme on the other device; ignore on the originator (same result)
    if (msg.type === 'settings') {
      applyTheme(msg.payload.theme);
    }
    // notes: sync to other device, never clobber active typing
    if (msg.type === 'notes') {
      const pad = document.getElementById('scratchPad');
      if (pad && document.activeElement !== pad) {
        pad.value = msg.payload.content;
      }
    }
  };

  es.onerror = () => {
    es.close();
    setTimeout(startSSE, 3000);
  };
}

// ─── START ────────────────────────────────────
applyDeviceLayout();
startSSE();
init();
