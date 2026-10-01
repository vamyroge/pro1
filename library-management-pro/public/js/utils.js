// API helper - lightweight fetch wrapper
const TOKEN_KEY = 'lmp_token';
const USER_KEY = 'lmp_user';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (_) { return null; } }

async function apiFetch(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (_) { /* not json */ }
  if (!res.ok || (json && json.success === false)) {
    const err = new Error((json && json.message) || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = json;
    if (res.status === 401) clearSession();
    throw err;
  }
  return json;
}

const debounce = (fn, delay = 350) => {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(s) {
  if (!s) return '-';
  try { return new Date(s).toLocaleDateString('vi-VN'); } catch (_) { return s; }
}
function formatDateTime(s) {
  if (!s) return '-';
  try { return new Date(s).toLocaleString('vi-VN'); } catch (_) { return s; }
}
function formatCurrency(n) {
  return new Intl.NumberFormat('vi-VN').format(n);
}

function statusBadge(status) {
  const map = {
    ACTIVE: { cls: 'success', label: 'ACTIVE' },
    INACTIVE: { cls: 'secondary', label: 'INACTIVE' },
    BORROWING: { cls: 'primary', label: 'BORROWING' },
    RETURNED: { cls: 'success', label: 'RETURNED' },
    OVERDUE: { cls: 'danger', label: 'OVERDUE' }
  };
  const cfg = map[status] || { cls: '', label: status };
  return `<span class="badge-pill ${cfg.cls}">${cfg.label}</span>`;
}

// Toast system
function ensureToastContainer() {
  let c = document.querySelector('.toast-container');
  if (!c) {
    c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}
function showToast({ type = 'info', title = '', message = '', duration = 3000 } = {}) {
  const c = ensureToastContainer();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title || type.toUpperCase())}</div>
      <div class="toast-msg">${escapeHtml(message)}</div>
    </div>
    <button class="icon-btn" aria-label="dismiss">
      <i data-lucide="x" style="width:16px;height:16px"></i>
    </button>`;
  c.appendChild(t);
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  const remove = () => { t.style.opacity = '0'; setTimeout(() => t.remove(), 200); };
  t.querySelector('button').addEventListener('click', remove);
  setTimeout(remove, duration);
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function confirmDialog({ title = 'Confirm', message = 'Are you sure?', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    const id = 'modalConfirm';
    let el = document.getElementById(id);
    if (el) el.remove();
    el = document.createElement('div');
    el.id = id;
    el.className = 'modal-backdrop open';
    el.innerHTML = `
      <div class="modal" style="max-width: 420px;">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="icon-btn" data-act="cancel"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">${escapeHtml(message)}</div>
        <div class="modal-footer">
          <button class="btn ghost" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
    const cleanup = (val) => { el.remove(); resolve(val); };
    el.addEventListener('click', (e) => {
      if (e.target === el) cleanup(false);
      const act = e.target.closest('button')?.dataset?.act;
      if (act === 'cancel') cleanup(false);
      if (act === 'confirm') cleanup(true);
    });
  });
}

function setLoading(selector, on) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.disabled = !!on;
  if (on) {
    el.dataset._old = el.innerHTML;
    el.innerHTML = '<span class="spinner"></span>';
  } else if (el.dataset._old) {
    el.innerHTML = el.dataset._old;
    delete el.dataset._old;
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  }
}

function emptyState({ icon = 'inbox', title = 'No data', message = '' } = {}) {
  return `<div class="empty">
    <div class="ic"><i data-lucide="${icon}" style="width:28px;height:28px;color:#94a3b8"></i></div>
    <div style="font-weight:600">${escapeHtml(title)}</div>
    <div style="font-size:13px">${escapeHtml(message)}</div>
  </div>`;
}

function skeletonRows(n = 5) {
  let html = '';
  for (let i = 0; i < n; i++) {
    html += `<tr>
      <td colspan="6"><div class="skeleton line" style="width:${60 + Math.random() * 30}%"></div></td>
    </tr>`;
  }
  return html;
}

window.LMP = {
  apiFetch, getToken, setToken, clearSession, getUser, setUser,
  debounce, escapeHtml, formatDate, formatDateTime, formatCurrency, statusBadge,
  showToast, openModal, closeModal, confirmDialog, setLoading, emptyState, skeletonRows
};
