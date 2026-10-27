const DATA_KEY = 'nuestra-casa-data-v1';
const CONFIG_KEY = 'nuestra-casa-github-v1';
const PAGE_NAMES = { tasks: 'Tarefas', shopping: 'Compra', calendar: 'Calendario', notes: 'Notas', settings: 'Axustes' };
const CATEGORIES = ['Froita e verdura', 'Carne e peixe', 'Lácteos e ovos', 'Despensa', 'Bebidas', 'Conxelados', 'Hixiene e fogar', 'Outros'];
const CATEGORY_TRANSLATIONS = { 'Fruta y verdura': 'Froita e verdura', 'Carne y pescado': 'Carne e peixe', 'Lácteos y huevos': 'Lácteos e ovos', 'Congelados': 'Conxelados', 'Higiene y hogar': 'Hixiene e fogar', 'Otros': 'Outros' };
function galicianCategory(category) { return CATEGORY_TRANSLATIONS[category] || category; }
const EMPTY = () => ({ version: 1, tasks: [], shopping: [], events: [], notes: [] });
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
let data = readJSON(DATA_KEY, EMPTY());
data.notes = Array.isArray(data.notes) ? data.notes : [];
let config = readJSON(CONFIG_KEY, {});
let page = 'tasks';
let taskFilter = 'pending';
let calendarMode = 'month';
let calendarCursor = new Date();
let selectedDate = isoDate(new Date());
let saving = false;
let saveTimer;
let toastTimer;
let sha = null;

function uid() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`; }
function isoDate(date) { const y = date.getFullYear(), m = `${date.getMonth() + 1}`.padStart(2, '0'), d = `${date.getDate()}`.padStart(2, '0'); return `${y}-${m}-${d}`; }
function fromISO(value) { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function escapeHTML(value = '') { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function visible(items) { return (items || []).filter(item => !item.deleted); }
function notify(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
function setStatus(state, label) { const el = document.querySelector('#sync-status'); if (!el) return; el.dataset.state = state; el.textContent = label; }
function persist() { localStorage.setItem(DATA_KEY, JSON.stringify(data)); render(); scheduleSync(); }
function stamp(item, changes = {}) { Object.assign(item, changes, { updatedAt: Date.now() }); }
function mergeData(a, b) {
  const merged = { version: 1 };
  for (const key of ['tasks', 'shopping', 'events', 'notes']) {
    const map = new Map();
    for (const item of [...(a[key] || []), ...(b[key] || [])]) {
      const old = map.get(item.id);
      if (!old || (item.updatedAt || 0) >= (old.updatedAt || 0)) map.set(item.id, item);
    }
    const cutoff = Date.now() - 90 * 86400000;
    merged[key] = [...map.values()].filter(item => !(item.deleted && (item.updatedAt || 0) < cutoff));
  }
  return merged;
}
function sameData(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function baseURL() { return `https://api.github.com/repos/${encodeURIComponent(config.owner || '')}/${encodeURIComponent(config.repo || '')}/contents/${(config.path || 'familia.json').split('/').map(encodeURIComponent).join('/')}`; }
function authHeaders() { return { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }
function decode64(value) { const binary = atob(value.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))); }
function encode64(value) { const bytes = new TextEncoder().encode(value); let binary = ''; bytes.forEach(byte => binary += String.fromCharCode(byte)); return btoa(binary); }
function readyToSync() { return Boolean(config.owner && config.repo && config.token); }
async function fetchRemote() {
  const url = `${baseURL()}?ref=${encodeURIComponent(config.branch || 'main')}`;
  const response = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `GitHub respondeu ${response.status}`);
  return { data: JSON.parse(decode64(body.content)), sha: body.sha };
}
async function writeRemote(payload, fileSha) {
  const response = await fetch(baseURL(), {
    method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Actualizar os datos da nosa casa', content: encode64(JSON.stringify(payload, null, 2)), branch: config.branch || 'main', ...(fileSha ? { sha: fileSha } : {}) })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.message || `GitHub respondeu ${response.status}`); error.status = response.status; throw error; }
  return body.content.sha;
}
function scheduleSync() {
  if (!readyToSync()) { setStatus('local', 'Só neste dispositivo'); return; }
  clearTimeout(saveTimer); saveTimer = setTimeout(() => syncNow(), 1000);
  setStatus('syncing', 'Pendente de gardar');
}
async function syncNow() {
  if (!readyToSync() || saving) return;
  if (!navigator.onLine) { setStatus('error', 'Sen conexión'); return; }
  saving = true; setStatus('syncing', 'Sincronizando…');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await fetchRemote();
      if (remote) { sha = remote.sha; data = mergeData(data, remote.data); localStorage.setItem(DATA_KEY, JSON.stringify(data)); }
      if (remote && sameData(data, remote.data)) {
        setStatus('synced', 'Sincronizado ✓');
        render();
        return;
      }
      try {
        sha = await writeRemote(data, remote?.sha || null);
        setStatus('synced', 'Sincronizado ✓');
        render();
        return;
      } catch (error) { if (error.status !== 409 && error.status !== 422) throw error; }
    }
    throw new Error('Non se puido resolver o conflito. Tenta sincronizar de novo.');
  } catch (error) {
    setStatus('error', 'Erro ao sincronizar');
    notify(error.message.includes('Bad credentials') ? 'Token non válido. Comproba os axustes.' : error.message);
  } finally { saving = false; }
}
async function pullRemote() {
  if (!readyToSync() || !navigator.onLine || saving) return;
  try {
    const remote = await fetchRemote();
    if (!remote) return;
    sha = remote.sha;
    const merged = mergeData(data, remote.data);
    if (!sameData(merged, data)) { data = merged; localStorage.setItem(DATA_KEY, JSON.stringify(data)); render(); }
    if (!sameData(merged, remote.data)) scheduleSync();
    else setStatus('synced', 'Sincronizado ✓');
  } catch { /* Keep local data available if the network is temporarily unavailable. */ }
}

function openModal(title, contents, onReady) {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${escapeHTML(title)}</h2><button class="modal-close" type="button" aria-label="Pechar">×</button></div>${contents}</section></div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('.modal-close').addEventListener('click', close);
  root.querySelector('.modal-backdrop').addEventListener('click', event => { if (event.target.classList.contains('modal-backdrop')) close(); });
  document.addEventListener('keydown', function esc(event) { if (event.key === 'Escape' && root.innerHTML) { close(); document.removeEventListener('keydown', esc); } }, { once: true });
  if (onReady) onReady(root, close);
  return close;
}
function showForm(title, fields, initial, onSave, onDelete) {
  const controls = fields.map(field => {
    const value = initial[field.name] ?? field.value ?? '';
    if (field.type === 'checkbox') return `<label class="check-label"><input type="checkbox" name="${field.name}" ${value ? 'checked' : ''}>${field.label}</label>`;
    if (field.type === 'select') return `<label class="form-label">${field.label}<select name="${field.name}">${field.options.map(option => `<option value="${escapeHTML(option.value)}" ${String(value) === String(option.value) ? 'selected' : ''}>${escapeHTML(option.label)}</option>`).join('')}</select></label>`;
    if (field.type === 'textarea') return `<label class="form-label">${field.label}<textarea name="${field.name}" placeholder="${escapeHTML(field.placeholder || '')}" ${field.required ? 'required' : ''}>${escapeHTML(value)}</textarea></label>`;
    return `<label class="form-label">${field.label}<input name="${field.name}" type="${field.type || 'text'}" value="${escapeHTML(value)}" placeholder="${escapeHTML(field.placeholder || '')}" ${field.required ? 'required' : ''}></label>`;
  }).join('');
  openModal(title, `<form class="modal-form"><div class="form-grid">${controls}</div><div class="modal-actions"><button class="primary" type="submit">Gardar</button><button class="secondary cancel" type="button">Cancelar</button></div>${onDelete ? '<div class="modal-footer"><button type="button" class="text-button delete-entry">Eliminar</button></div>' : ''}</form>`, (root, close) => {
    root.querySelector('.cancel').onclick = close;
    root.querySelector('form').onsubmit = event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const values = {};
      for (const field of fields) values[field.name] = field.type === 'checkbox' ? form.has(field.name) : form.get(field.name);
      onSave(values); close();
    };
    if (onDelete) root.querySelector('.delete-entry').onclick = () => { onDelete(); close(); };
    root.querySelector('input,textarea,select')?.focus();
  });
}
function itemById(kind, id) { return data[kind].find(item => item.id === id); }
function update(kind, id, changes) { const item = itemById(kind, id); if (item) stamp(item, changes); persist(); }
function remove(kind, id) { const item = itemById(kind, id); if (item) stamp(item, { deleted: true }); persist(); }

function renderTasks() {
  const tasks = visible(data.tasks).filter(item => taskFilter === 'all' || (taskFilter === 'pending' ? !item.done : item.done)).sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || b.createdAt - a.createdAt);
  const count = visible(data.tasks).filter(item => !item.done).length;
  return `<div class="section-intro"><div><h2>Vane non tolees que te coñezo!!</h2><p>${count ? `${count} tarefa${count === 1 ? '' : 's'} pendente${count === 1 ? '' : 's'}` : 'Todo ao día, moi ben!'}</p></div></div>
    <div class="filters"><button class="filter ${taskFilter === 'pending' ? 'active' : ''}" data-filter="pending">Pendentes</button><button class="filter ${taskFilter === 'all' ? 'active' : ''}" data-filter="all">Todas</button><button class="filter ${taskFilter === 'done' ? 'active' : ''}" data-filter="done">Feitas</button></div>
    <div class="task-list">${tasks.length ? tasks.map(task => `<article class="task-row card ${task.done ? 'completed' : ''}"><button class="check ${task.done ? 'checked' : ''}" aria-label="${task.done ? 'Marcar como pendente' : 'Completar'}" data-toggle-task="${task.id}">${task.done ? '✓' : ''}</button><div class="row-main" data-edit-task="${task.id}"><div class="row-title">${escapeHTML(task.title)}</div><div class="row-meta">${task.priority && task.priority !== 'normal' ? `<span class="priority ${task.priority}"></span>${task.priority === 'high' ? 'Importante' : 'Baixa'} · ` : ''}${task.dueDate ? `${escapeHTML(formatDate(task.dueDate))}${task.assignee ? ' · ' : ''}` : ''}${task.assignee ? `Para ${escapeHTML(task.assignee)}` : ''}${task.notes ? `${task.dueDate || task.assignee ? ' · ' : ''}${escapeHTML(task.notes)}` : ''}</div></div></article>`).join('') : `<div class="empty card"><strong>${taskFilter === 'done' ? 'Aínda non hai tarefas feitas' : 'Non hai tarefas por aquí'}</strong>Engade unha tarefa co botón +</div>`}</div><button class="fab" data-add-task aria-label="Engadir tarefa">+</button>`;
}
function taskForm(task) {
  showForm(task ? 'Editar tarefa' : 'Nova tarefa', [
    { name: 'title', label: 'Que hai que facer?', required: true }, { name: 'notes', label: 'Notas', type: 'textarea' },
    { name: 'dueDate', label: 'Data límite', type: 'date' }, { name: 'priority', label: 'Prioridade', type: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'Importante' }, { value: 'low', label: 'Cando se poida' }] },
    { name: 'assignee', label: 'Para quen? (opcional)', placeholder: 'Por exemplo, Ana' }
  ], task || { priority: 'normal' }, values => {
    if (task) update('tasks', task.id, values);
    else { const now = Date.now(); data.tasks.unshift({ id: uid(), ...values, done: false, createdAt: now, updatedAt: now }); persist(); }
  }, task ? () => remove('tasks', task.id) : null);
}

function renderShopping() {
  const items = visible(data.shopping); const pending = items.filter(item => !item.bought); const bought = items.filter(item => item.bought);
  const groups = CATEGORIES.map(category => ({ category, items: pending.filter(item => galicianCategory(item.category) === category) })).filter(group => group.items.length);
  const uncategorized = pending.filter(item => !CATEGORIES.includes(galicianCategory(item.category)));
  if (uncategorized.length) groups.unshift({ category: 'Outros', items: uncategorized });
  return `<div class="section-intro"><div><h2>Lista da compra</h2><p>${pending.length ? `${pending.length} cousa${pending.length === 1 ? '' : 's'} por mercar` : 'Todo o que fai falta, nun sitio'}</p></div></div>
    <form id="quick-add" class="quick-add"><input name="name" aria-label="Engadir á compra" placeholder="Engadir algo…" required><button class="primary" type="submit">Engadir</button></form>
    <div class="shopping-list">${groups.length ? groups.map(group => `<div><div class="shopping-group">${escapeHTML(group.category)}</div>${group.items.map(item => shoppingRow(item)).join('')}</div>`).join('') : '<div class="empty card"><strong>A lista está baleira</strong>Engade o que precisedes para a casa.</div>'}</div>
    ${bought.length ? `<div class="bought-block"><div class="section-intro"><div><h2 style="font-size:16px">Xa no carriño</h2><p>${bought.length} produto${bought.length === 1 ? '' : 's'}</p></div><button class="text-button" data-clear-bought>Retirar</button></div><div class="shopping-list">${bought.map(item => shoppingRow(item, true)).join('')}</div></div>` : ''}`;
}
function shoppingRow(item, bought = false) { const category = galicianCategory(item.category); return `<article class="shopping-row card ${bought ? 'bought' : ''}"><button class="check ${bought ? 'checked' : ''}" aria-label="${bought ? 'Devolver á lista' : 'Marcar como mercado'}" data-toggle-shopping="${item.id}">${bought ? '✓' : ''}</button><div class="row-main" data-edit-shopping="${item.id}"><div class="row-title">${escapeHTML(item.name)}${item.quantity ? `<span class="qty">${escapeHTML(item.quantity)}</span>` : ''}</div>${category && category !== 'Outros' ? `<div class="row-meta">${escapeHTML(category)}</div>` : ''}</div></article>`; }
function shoppingForm(item) {
  showForm(item ? 'Editar produto' : 'Engadir produto', [
    { name: 'name', label: 'Produto', required: true }, { name: 'quantity', label: 'Cantidade', placeholder: 'Por exemplo, 2 paquetes' },
    { name: 'category', label: 'Categoría', type: 'select', options: [{ value: '', label: 'Sen categoría' }, ...CATEGORIES.map(category => ({ value: category, label: category }))] }
  ], item ? { ...item, category: galicianCategory(item.category) } : {}, values => {
    if (item) update('shopping', item.id, values);
    else { const now = Date.now(); data.shopping.unshift({ id: uid(), ...values, bought: false, createdAt: now, updatedAt: now }); persist(); }
  }, item ? () => remove('shopping', item.id) : null);
}

const GALICIAN_MONTHS = ['Xaneiro', 'Febreiro', 'Marzo', 'Abril', 'Maio', 'Xuño', 'Xullo', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Decembro'];
const GALICIAN_SHORT_MONTHS = ['xan.', 'feb.', 'mar.', 'abr.', 'maio', 'xuñ.', 'xul.', 'ago.', 'set.', 'out.', 'nov.', 'dec.'];
const GALICIAN_WEEKDAYS = ['domingo', 'luns', 'martes', 'mércores', 'xoves', 'venres', 'sábado'];
function formatDate(value, options = { day: 'numeric', month: 'short' }) {
  const date = fromISO(value); const monthIndex = date.getMonth(); const month = options.month === 'short' ? GALICIAN_SHORT_MONTHS[monthIndex] : GALICIAN_MONTHS[monthIndex].toLowerCase();
  const parts = [];
  if (options.weekday) parts.push(`${GALICIAN_WEEKDAYS[date.getDay()]},`);
  if (options.day) parts.push(options.month === 'long' ? `${date.getDate()} de ${month}` : options.month === 'short' ? `${date.getDate()} ${month}` : `${date.getDate()}`);
  else if (options.month) parts.push(month);
  if (options.year) parts.push(`${options.month === 'long' ? 'de ' : ''}${date.getFullYear()}`);
  return parts.join(' ');
}
function monthName(date) { return `${GALICIAN_MONTHS[date.getMonth()]} de ${date.getFullYear()}`; }
function occurrences(event, start, end) {
  if (!event.repeatYearly) return event.date >= start && event.date <= end ? [event.date] : [];
  const original = fromISO(event.date); const result = [];
  for (let year = fromISO(start).getFullYear(); year <= fromISO(end).getFullYear(); year++) {
    const date = new Date(year, original.getMonth(), Math.min(original.getDate(), new Date(year, original.getMonth() + 1, 0).getDate()), 12);
    const value = isoDate(date); if (value >= start && value <= end) result.push(value);
  }
  return result;
}
function allOccurrences(start, end) {
  const result = [];
  for (const event of visible(data.events)) for (const date of occurrences(event, start, end)) result.push({ ...event, occurrenceDate: date });
  return result.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || (a.time || '').localeCompare(b.time || ''));
}
function eventStyle(event) { return event.type === 'medical' ? 'medical' : event.type === 'birthday' ? 'birthday' : ''; }
const CREATOR_CLASSES = { Vane: 'vane', Emilio: 'emilio', Dani: 'dani', Martina: 'martina' };
function creatorBadge(event) {
  if (!event.createdBy) return '';
  const style = CREATOR_CLASSES[event.createdBy] || 'other';
  return `<span class="creator-badge creator-${style}">${escapeHTML(event.createdBy)}</span>`;
}
function renderCalendar() {
  const year = calendarCursor.getFullYear(), month = calendarCursor.getMonth();
  const first = new Date(year, month, 1, 12); const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayOffset, 12); const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 41);
  const startISO = isoDate(gridStart), endISO = isoDate(gridEnd); const monthEvents = allOccurrences(startISO, endISO);
  const weekdays = ['Lun', 'Mar', 'Mér', 'Xov', 'Ven', 'Sáb', 'Dom'];
  const dayCells = Array.from({ length: 42 }, (_, index) => { const date = new Date(gridStart); date.setDate(gridStart.getDate() + index); const key = isoDate(date); const events = monthEvents.filter(event => event.occurrenceDate === key); return `<button class="day ${date.getMonth() !== month ? 'outside' : ''} ${key === isoDate(new Date()) ? 'today' : ''} ${selectedDate === key ? 'selected' : ''}" data-day="${key}" aria-label="${formatDate(key, { weekday: 'long', day: 'numeric', month: 'long' })}">${date.getDate()}${events.length ? `<span class="day-dots">${events.slice(0, 3).map(event => `<i class="day-dot ${eventStyle(event)}"></i>`).join('')}</span>` : ''}</button>`; }).join('');
  const visibleEvents = calendarMode === 'month' ? allOccurrences(`${year}-${`${month + 1}`.padStart(2, '0')}-01`, isoDate(new Date(year, month + 1, 0, 12))) : [];
  let weekStart;
  if (calendarMode === 'week') { const selected = fromISO(selectedDate); weekStart = new Date(selected); weekStart.setDate(selected.getDate() - ((selected.getDay() + 6) % 7)); }
  const weekEvents = calendarMode === 'week' ? allOccurrences(isoDate(weekStart), isoDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6, 12))) : [];
  const upcomingStart = isoDate(new Date()); const upcomingEnd = isoDate(new Date(Date.now() + 365 * 86400000)); const upcoming = allOccurrences(upcomingStart, upcomingEnd).slice(0, 5);
  return `<div class="calendar-head"><h2>${monthName(calendarCursor)}</h2><div class="calendar-controls"><button data-month="-1" aria-label="Mes anterior">‹</button><button class="today-button" data-go-today>Hoxe</button><button data-month="1" aria-label="Mes seguinte">›</button></div></div>
    <div class="view-toggle"><button class="${calendarMode === 'month' ? 'active' : ''}" data-mode="month">Mes</button><button class="${calendarMode === 'week' ? 'active' : ''}" data-mode="week">Semana</button></div>
   ${calendarMode === 'month' ? `<div class="card month-grid">${weekdays.map(day => `<div class="weekday">${day}</div>`).join('')}${dayCells}</div>` : `<div class="week-list">${Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); const key = isoDate(date); const todaysEvents = weekEvents.filter(event => event.occurrenceDate === key); return `<article class="week-day card"><div class="week-day-head">${formatDate(key, { weekday: 'long', day: 'numeric', month: 'long' })}</div>${todaysEvents.length ? todaysEvents.map(event => `<button class="week-event ${eventStyle(event)}" data-edit-event="${event.id}">${event.time ? `${escapeHTML(event.time)} · ` : ''}${escapeHTML(event.title)}${event.createdBy ? `<small class="creator-mini"> · ${escapeHTML(event.createdBy)}</small>` : ''}</button>`).join('') : '<span class="row-meta">Sen eventos</span>'}</article>`; }).join('')}</div>`}
    <h3 class="upcoming-title">Vindeiros eventos</h3><div class="event-list">${upcoming.length ? upcoming.map(event => `<article class="event-row card ${eventStyle(event)}" data-edit-event="${event.id}" data-occurrence="${event.occurrenceDate}"><div class="event-date"><strong>${fromISO(event.occurrenceDate).getDate()}</strong><span>${formatDate(event.occurrenceDate, { month: 'short' })}</span></div><div class="row-main"><div class="row-title">${escapeHTML(event.title)}</div><div class="event-type">${event.type === 'medical' ? 'Cita médica' : event.type === 'birthday' ? 'Cumpreanos' : 'Evento'}${event.time ? ` · ${escapeHTML(event.time)}` : ''}${event.repeatYearly ? ' · Cada ano' : ''}</div>${creatorBadge(event)}</div></article>`).join('') : '<div class="empty card"><strong>Sen eventos próximos</strong>Engade aniversarios, citas e datas importantes.</div>'}</div><button class="fab" data-add-event aria-label="Engadir evento">+</button>`;
}
function openEventForm(event, occurrenceDate) {
  const preferredCreator = localStorage.getItem('nuestra-casa-created-by') || 'Vane';
  const initial = event ? { ...event, date: occurrenceDate || event.date, reminder: event.reminder ?? '', repeatYearly: event.repeatYearly || false, createdBy: event.createdBy || preferredCreator } : { date: selectedDate || isoDate(new Date()), type: 'other', reminder: '', repeatYearly: false, createdBy: preferredCreator };
  showForm(event ? 'Editar evento' : 'Novo evento', [
    { name: 'title', label: 'Que tes anotado?', required: true }, { name: 'type', label: 'Tipo', type: 'select', options: [{ value: 'medical', label: 'Cita médica' }, { value: 'birthday', label: 'Cumpreanos' }, { value: 'other', label: 'Outro' }] },
    { name: 'date', label: 'Data', type: 'date', required: true }, { name: 'time', label: 'Hora (opcional)', type: 'time' },
    { name: 'createdBy', label: 'Quen crea esta cita?', type: 'select', options: ['Vane', 'Emilio', 'Dani', 'Martina'].map(name => ({ value: name, label: name })) },
    { name: 'repeatYearly', label: 'Repetir cada ano (cumpreanos)', type: 'checkbox' },
    { name: 'reminder', label: 'Aviso neste dispositivo', type: 'select', options: [{ value: '', label: 'Sen aviso' }, { value: '15', label: '15 minutos antes' }, { value: '60', label: '1 hora antes' }, { value: '180', label: '3 horas antes' }, { value: '1440', label: '1 día antes' }, { value: '10080', label: '1 semana antes' }] },
    { name: 'notes', label: 'Notas', type: 'textarea' }
  ], initial, values => {
    values.reminder = values.reminder === '' ? null : Number(values.reminder);
    localStorage.setItem('nuestra-casa-created-by', values.createdBy);
    if (event) update('events', event.id, values);
    else { const now = Date.now(); data.events.unshift({ id: uid(), ...values, createdAt: now, updatedAt: now }); persist(); }
    checkReminders();
  }, event ? () => remove('events', event.id) : null);
}
function openDay(date) {
  selectedDate = date;
  const events = allOccurrences(date, date);
  const content = `<div class="event-list">${events.length ? events.map(event => `<article class="event-row card ${eventStyle(event)}" data-day-edit="${event.id}" data-occurrence="${date}"><div class="row-main"><div class="row-title">${escapeHTML(event.title)}</div><div class="event-type">${event.time ? `${escapeHTML(event.time)} · ` : ''}${event.type === 'medical' ? 'Cita médica' : event.type === 'birthday' ? 'Cumpreanos' : 'Evento'}</div>${creatorBadge(event)}</div></article>`).join('') : '<div class="empty card"><strong>Non hai nada anotado</strong>Goza do día ou engade un evento.</div>'}</div><button class="primary" id="add-day-event" style="width:100%;margin-top:14px">＋ Engadir evento</button>`;
  openModal(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }), content, root => {
    root.querySelectorAll('[data-day-edit]').forEach(row => row.onclick = () => { const item = itemById('events', row.dataset.dayEdit); if (item) openEventForm(item, row.dataset.occurrence); });
    root.querySelector('#add-day-event').onclick = () => openEventForm(null, date);
  });
}

function renderNotes() {
  const notes = visible(data.notes).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  return `<div class="section-intro"><div><h2>Ideas para lembrar</h2><p>Notas compartidas para que non se vos escape nada</p></div></div>
    <div class="notes-list">${notes.length ? notes.map(note => `<article class="note-card card" data-edit-note="${note.id}"><div class="note-card-top"><h3>${escapeHTML(note.title)}</h3><span class="note-mark">✳</span></div><p class="note-content">${escapeHTML(note.content || '')}</p><div class="note-date">Actualizada · ${formatDate(isoDate(new Date(note.updatedAt || note.createdAt || Date.now())), { day: 'numeric', month: 'short', year: 'numeric' })}</div></article>`).join('') : '<div class="empty card"><strong>Aínda non hai notas</strong>Garda aquí ideas, teléfonos ou cousas que queirades lembrar.</div>'}</div>
    <button class="fab" data-add-note aria-label="Engadir nota">+</button>`;
}
function openNoteForm(note) {
  showForm(note ? 'Editar nota' : 'Nova nota', [
    { name: 'title', label: 'Título', required: true, placeholder: 'Por exemplo, ideas para a fin de semana' },
    { name: 'content', label: 'Nota', type: 'textarea', required: true, placeholder: 'Escribe aquí o que queirades lembrar…' }
  ], note || {}, values => {
    if (note) update('notes', note.id, values);
    else { const now = Date.now(); data.notes.unshift({ id: uid(), ...values, createdAt: now, updatedAt: now }); persist(); }
  }, note ? () => remove('notes', note.id) : null);
}

function renderSettings() {
  const syncText = readyToSync() ? `Sincronización configurada para <strong>${escapeHTML(config.owner)}/${escapeHTML(config.repo)}</strong>, ficheiro <code>${escapeHTML(config.path || 'familia.json')}</code>.` : 'Sen configurar: os datos só se gardan neste dispositivo.';
  return `<div class="section-intro"><div><h2>Axustes</h2><p>Sincronización e preferencias</p></div></div><div class="settings-stack">
    <section class="settings-card card"><h3>Sincronizar entre vós</h3><p>Usa un repositorio <strong>privado</strong> para gardar os datos. O token gárdase só neste navegador.</p><div class="form-grid">
      <label class="form-label">Usuario de GitHub<input id="cfg-owner" autocomplete="off" placeholder="o-teu-usuario" value="${escapeHTML(config.owner || '')}"></label>
      <label class="form-label">Repositorio privado para os datos<input id="cfg-repo" autocomplete="off" placeholder="datos-familia" value="${escapeHTML(config.repo || '')}"></label>
      <label class="form-label">Rama<input id="cfg-branch" value="${escapeHTML(config.branch || 'main')}"></label>
      <label class="form-label">Ruta do ficheiro<input id="cfg-path" value="${escapeHTML(config.path || 'familia.json')}"></label>
      <label class="form-label">Token de acceso persoal<input id="cfg-token" type="password" autocomplete="new-password" placeholder="github_pat_…" value="${escapeHTML(config.token || '')}"></label>
    </div><p class="help">Crea un token fine-grained limitado só a ese repositorio, co permiso <em>Contents: Read and write</em>. Configura os mesmos datos no móbil da túa muller. Garda a web nun repositorio público separado.</p>
    <div class="button-row"><button class="primary" id="save-config">Gardar e sincronizar</button><button class="secondary" id="sync-now">Sincronizar agora</button><button class="secondary" id="disconnect">Desconectar</button></div><div class="sync-note">${syncText}</div></section>
    <section class="settings-card card"><h3>Avisos</h3><p>As notificacións funcionan mentres a web está aberta no dispositivo. Cada persoa debe activalas por separado.</p><button class="secondary" id="enable-notifications">${'Notification' in window && Notification.permission === 'granted' ? 'Notificacións activadas ✓' : 'Activar notificacións'}</button></section>
    <section class="settings-card card"><h3>Copia de seguridade</h3><p>Descarga unha copia dos datos ou restaura unha copia anterior.</p><div class="button-row"><button class="secondary" id="export-data">Descargar copia</button><label class="secondary" style="display:inline-flex;align-items:center;cursor:pointer">Importar copia<input id="import-data" type="file" accept="application/json,.json" hidden></label></div></section>
    <section class="settings-card card"><h3>Instalar no móbil</h3><p>Abre a web no navegador e escolle <strong>“Engadir á pantalla de inicio”</strong> no menú de compartir/opcións. A app poderá abrirse como unha aplicación.</p></section>
  </div>`;
}

function render() {
  document.querySelector('#page-title').textContent = PAGE_NAMES[page];
  document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  const root = document.querySelector('#app');
  root.innerHTML = page === 'tasks' ? renderTasks() : page === 'shopping' ? renderShopping() : page === 'calendar' ? renderCalendar() : page === 'notes' ? renderNotes() : renderSettings();
  bindPage();
}
function bindPage() {
  document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { taskFilter = button.dataset.filter; render(); });
  document.querySelector('[data-add-task]')?.addEventListener('click', () => taskForm());
  document.querySelectorAll('[data-toggle-task]').forEach(button => button.onclick = () => update('tasks', button.dataset.toggleTask, { done: !itemById('tasks', button.dataset.toggleTask).done }));
  document.querySelectorAll('[data-edit-task]').forEach(row => row.onclick = () => taskForm(itemById('tasks', row.dataset.editTask)));
  document.querySelector('#quick-add')?.addEventListener('submit', event => { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get('name')).trim(); if (!name) return; const now = Date.now(); data.shopping.unshift({ id: uid(), name, quantity: '', category: 'Outros', bought: false, createdAt: now, updatedAt: now }); persist(); });
  document.querySelectorAll('[data-toggle-shopping]').forEach(button => button.onclick = () => update('shopping', button.dataset.toggleShopping, { bought: !itemById('shopping', button.dataset.toggleShopping).bought }));
  document.querySelectorAll('[data-edit-shopping]').forEach(row => row.onclick = () => shoppingForm(itemById('shopping', row.dataset.editShopping)));
  document.querySelector('[data-clear-bought]')?.addEventListener('click', () => { for (const item of visible(data.shopping).filter(item => item.bought)) stamp(item, { deleted: true }); persist(); });
  document.querySelectorAll('[data-month]').forEach(button => button.onclick = () => {
    if (calendarMode === 'week') {
      const next = fromISO(selectedDate); next.setDate(next.getDate() + Number(button.dataset.month) * 7); selectedDate = isoDate(next); calendarCursor = next;
    } else calendarCursor.setMonth(calendarCursor.getMonth() + Number(button.dataset.month));
    render();
  });
  document.querySelector('[data-go-today]')?.addEventListener('click', () => { calendarCursor = new Date(); selectedDate = isoDate(new Date()); render(); });
  document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => { calendarMode = button.dataset.mode; render(); });
  document.querySelectorAll('[data-day]').forEach(button => button.onclick = () => { selectedDate = button.dataset.day; calendarCursor = fromISO(selectedDate); render(); openDay(selectedDate); });
  document.querySelector('[data-add-event]')?.addEventListener('click', () => openEventForm());
  document.querySelectorAll('[data-edit-event]').forEach(row => row.onclick = () => { const event = itemById('events', row.dataset.editEvent); if (event) openEventForm(event, row.dataset.occurrence); });
  document.querySelectorAll('[data-save-event]').forEach(() => {});
  document.querySelector('[data-add-note]')?.addEventListener('click', () => openNoteForm());
  document.querySelectorAll('[data-edit-note]').forEach(row => row.onclick = () => openNoteForm(itemById('notes', row.dataset.editNote)));
  document.querySelector('#save-config')?.addEventListener('click', saveConfig);
  document.querySelector('#sync-now')?.addEventListener('click', syncNow);
  document.querySelector('#disconnect')?.addEventListener('click', () => { config = {}; localStorage.removeItem(CONFIG_KEY); setStatus('local', 'Só neste dispositivo'); render(); notify('Sincronización desconectada. Os datos locais consérvanse.'); });
  document.querySelector('#enable-notifications')?.addEventListener('click', enableNotifications);
  document.querySelector('#export-data')?.addEventListener('click', exportData);
  document.querySelector('#import-data')?.addEventListener('change', importData);
}
function saveConfig() {
  config = { owner: document.querySelector('#cfg-owner').value.trim(), repo: document.querySelector('#cfg-repo').value.trim(), branch: document.querySelector('#cfg-branch').value.trim() || 'main', path: document.querySelector('#cfg-path').value.trim() || 'familia.json', token: document.querySelector('#cfg-token').value.trim() };
  if (!readyToSync()) { notify('Completa o usuario, o repositorio e o token.'); return; }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); syncNow();
}
async function enableNotifications() {
  if (!('Notification' in window)) { notify('Este navegador non admite notificacións.'); return; }
  const permission = await Notification.requestPermission();
  notify(permission === 'granted' ? 'Notificacións activadas neste dispositivo.' : 'Non se autorizaron as notificacións.');
  render(); checkReminders();
}
function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = `nosa-casa-${isoDate(new Date())}.json`; link.click(); URL.revokeObjectURL(link.href);
}
function importData(event) {
  const file = event.target.files?.[0]; if (!file) return;
  const reader = new FileReader(); reader.onload = () => { try { const incoming = JSON.parse(reader.result); if (!incoming || !Array.isArray(incoming.tasks) || !Array.isArray(incoming.shopping) || !Array.isArray(incoming.events)) throw new Error('Formato non válido'); data = mergeData(data, incoming); persist(); notify('Copia importada.'); } catch { notify('Non se puido ler esa copia.'); } };
  reader.readAsText(file);
}
function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now(); const shown = readJSON('nuestra-casa-reminders-v1', {});
  for (const event of visible(data.events)) {
    if (event.reminder == null || !event.date) continue;
    const today = new Date(); const end = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate(), 12); const endISO = isoDate(end);
    for (const date of occurrences(event, isoDate(new Date()), endISO)) {
      const when = new Date(`${date}T${event.time || '09:00'}:00`).getTime(); const reminderAt = when - Number(event.reminder) * 60000;
      const key = `${event.id}:${date}:${event.reminder}`;
      if (now >= reminderAt && now <= when && !shown[key]) {
        new Notification(event.title, { body: `${event.type === 'medical' ? 'Cita médica' : event.type === 'birthday' ? 'Cumpreanos' : 'Evento'} · ${formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}${event.time ? ` ás ${event.time}` : ''}` });
        shown[key] = true;
      }
    }
  }
  localStorage.setItem('nuestra-casa-reminders-v1', JSON.stringify(shown));
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => { page = button.dataset.page; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
window.addEventListener('online', () => { if (readyToSync()) syncNow(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { pullRemote(); checkReminders(); } });
setInterval(() => { pullRemote(); checkReminders(); }, 60000);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
render();
if (readyToSync()) { setStatus('syncing', 'Conectando…'); syncNow(); } else setStatus('local', 'Só neste dispositivo');
checkReminders();
