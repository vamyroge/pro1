const readerState = { page: 1, limit: 10, sort: 'created_at', order: 'desc', search: '', status: '' };

async function renderReaders(root) {
  root.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Readers</h1>
        <div class="subtitle">Library members and their status</div>
      </div>
      <button class="btn primary" id="btnAddReader"><i data-lucide="plus"></i> Add reader</button>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="toolbar">
          <input id="readerSearch" class="grow" placeholder="Search by name, code, email..." />
          <select id="readerStatus">
            <option value="">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr><th>Code</th><th>Full name</th><th>Email</th><th>Phone</th><th>Class</th><th>Status</th><th></th></tr>
            </thead>
            <tbody id="readerRows"><tr><td colspan="7">${LMP.skeletonRows(5)}</td></tr></tbody>
          </table>
        </div>
        <div class="pagination" id="readerPagination"></div>
      </div>
    </div>
  `;

  document.getElementById('btnAddReader').addEventListener('click', () => openReaderModal());
  document.getElementById('readerSearch').addEventListener('input', LMP.debounce((e) => { readerState.search = e.target.value.trim(); readerState.page = 1; loadReaders(); }, 400));
  document.getElementById('readerStatus').addEventListener('change', (e) => { readerState.status = e.target.value; readerState.page = 1; loadReaders(); });

  await loadReaders();
}

async function loadReaders() {
  const rows = document.getElementById('readerRows');
  rows.innerHTML = `<tr><td colspan="7">${LMP.skeletonRows(5)}</td></tr>`;
  const params = new URLSearchParams({ page: readerState.page, limit: readerState.limit, sort: readerState.sort, order: readerState.order });
  if (readerState.search) params.set('search', readerState.search);
  if (readerState.status) params.set('status', readerState.status);
  const res = await LMP.apiFetch('GET', `/api/readers?${params}`);
  const data = res.data || [];
  if (!data.length) {
    rows.innerHTML = `<tr><td colspan="7">${LMP.emptyState({ icon: 'users', title: 'No readers', message: 'Add your first reader to get started.' })}</td></tr>`;
  } else {
    rows.innerHTML = data.map((r) => `
      <tr>
        <td style="font-family:monospace">${LMP.escapeHtml(r.reader_code)}</td>
        <td><div style="font-weight:600">${LMP.escapeHtml(r.full_name)}</div><div style="color:var(--muted);font-size:12px">${LMP.escapeHtml(r.address || '')}</div></td>
        <td>${LMP.escapeHtml(r.email || '-')}</td>
        <td>${LMP.escapeHtml(r.phone || '-')}</td>
        <td>${LMP.escapeHtml(r.class_name || '-')}</td>
        <td>${LMP.statusBadge(r.status)}</td>
        <td class="actions">
          <button class="btn sm ghost" data-edit="${r.id}"><i data-lucide="pencil"></i></button>
          <button class="btn sm ghost" data-del="${r.id}"><i data-lucide="trash-2"></i></button>
        </td>
      </tr>`).join('');
    rows.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openReaderModal(parseInt(btn.dataset.edit, 10))));
    rows.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', () => deleteReader(parseInt(btn.dataset.del, 10))));
  }
  renderPagination('readerPagination', res.pagination, (p) => { readerState.page = p; loadReaders(); });
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
}

async function openReaderModal(id) {
  let r = { reader_code: '', full_name: '', email: '', phone: '', class_name: '', address: '', status: 'ACTIVE' };
  if (id) {
    const res = await LMP.apiFetch('GET', `/api/readers/${id}`);
    r = res.data;
  }
  const body = `
    <form id="readerForm">
      <div class="form-grid">
        <div class="form-row"><label>Reader code *</label><input name="reader_code" required value="${LMP.escapeHtml(r.reader_code)}" ${id ? 'readonly' : ''} /></div>
        <div class="form-row"><label>Full name *</label><input name="full_name" required value="${LMP.escapeHtml(r.full_name)}" /></div>
        <div class="form-row"><label>Email</label><input name="email" type="email" value="${LMP.escapeHtml(r.email || '')}" /></div>
        <div class="form-row"><label>Phone</label><input name="phone" value="${LMP.escapeHtml(r.phone || '')}" /></div>
        <div class="form-row"><label>Class</label><input name="class_name" value="${LMP.escapeHtml(r.class_name || '')}" /></div>
        <div class="form-row"><label>Status</label>
          <select name="status">
            <option value="ACTIVE" ${r.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option>
            <option value="INACTIVE" ${r.status === 'INACTIVE' ? 'selected' : ''}>INACTIVE</option>
          </select>
        </div>
      </div>
      <div class="form-row"><label>Address</label><textarea name="address" rows="2">${LMP.escapeHtml(r.address || '')}</textarea></div>
    </form>`;
  LMP.openModal('modalGeneric');
  document.getElementById('modalGenericTitle').textContent = id ? 'Edit reader' : 'Add reader';
  document.getElementById('modalGenericBody').innerHTML = body;
  document.getElementById('modalGenericFooter').innerHTML = `
    <button class="btn ghost" onclick="LMP.closeModal('modalGeneric')">Cancel</button>
    <button class="btn primary" id="readerSave" ${id ? `data-editing="${id}"` : ''}><i data-lucide="save"></i> Save</button>`;
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  document.getElementById('readerSave').addEventListener('click', saveReader);
}

async function saveReader() {
  const form = document.getElementById('readerForm');
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.full_name) { LMP.showToast({ type: 'warning', message: 'Full name is required' }); return; }
  if (data.email && !/^[^@]+@[^@]+\.[^@]+$/.test(data.email)) {
    LMP.showToast({ type: 'warning', message: 'Invalid email' }); return;
  }
  const btn = document.getElementById('readerSave');
  const id = btn.dataset.editing;
  LMP.setLoading('#readerSave', true);
  try {
    if (id) await LMP.apiFetch('PUT', `/api/readers/${id}`, data);
    else await LMP.apiFetch('POST', '/api/readers', data);
    LMP.showToast({ type: 'success', message: 'Reader saved' });
    LMP.closeModal('modalGeneric');
    loadReaders();
  } catch (err) {
    LMP.showToast({ type: 'error', title: 'Save failed', message: err.message });
  } finally {
    LMP.setLoading('#readerSave', false);
  }
}

async function deleteReader(id) {
  const ok = await LMP.confirmDialog({ title: 'Delete reader', message: 'This action cannot be undone.', confirmText: 'Delete', danger: true });
  if (!ok) return;
  try {
    await LMP.apiFetch('DELETE', `/api/readers/${id}`);
    LMP.showToast({ type: 'success', message: 'Reader deleted' });
    loadReaders();
  } catch (err) {
    LMP.showToast({ type: 'error', title: 'Delete failed', message: err.message });
  }
}
