const borrowState = { page: 1, limit: 10, status: '', overdue: 'false' };

async function renderBorrowings(root) {
  root.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Borrowings</h1>
        <div class="subtitle">Active loans and returns</div>
      </div>
      <button class="btn primary" id="btnNewBorrow"><i data-lucide="plus"></i> New borrowing</button>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="toolbar">
          <select id="borrowStatus">
            <option value="">All</option>
            <option value="BORROWING">Borrowing</option>
            <option value="RETURNED">Returned</option>
            <option value="OVERDUE">Overdue</option>
          </select>
          <label style="display:flex;align-items:center;gap:6px">
            <input type="checkbox" id="borrowOverdue" /> Show only overdue
          </label>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Reader</th><th>Book</th><th>Borrow date</th><th>Due</th><th>Returned</th><th>Status</th><th></th></tr></thead>
            <tbody id="borrowRows"><tr><td colspan="7">${LMP.skeletonRows(6)}</td></tr></tbody>
          </table>
        </div>
        <div class="pagination" id="borrowPagination"></div>
      </div>
    </div>
  `;
  document.getElementById('btnNewBorrow').addEventListener('click', openBorrowModal);
  document.getElementById('borrowStatus').addEventListener('change', (e) => { borrowState.status = e.target.value; borrowState.page = 1; loadBorrowings(); });
  document.getElementById('borrowOverdue').addEventListener('change', (e) => { borrowState.overdue = e.target.checked ? 'true' : 'false'; borrowState.page = 1; loadBorrowings(); });
  await loadBorrowings();
}

async function loadBorrowings() {
  const rows = document.getElementById('borrowRows');
  rows.innerHTML = `<tr><td colspan="7">${LMP.skeletonRows(6)}</td></tr>`;
  const params = new URLSearchParams({ page: borrowState.page, limit: borrowState.limit });
  if (borrowState.status) params.set('status', borrowState.status);
  if (borrowState.overdue === 'true') params.set('overdue', 'true');
  const res = await LMP.apiFetch('GET', `/api/borrowings?${params}`);
  const data = res.data || [];
  if (!data.length) {
    rows.innerHTML = `<tr><td colspan="7">${LMP.emptyState({ icon: 'repeat', title: 'No borrowings', message: 'Create a new borrowing to get started.' })}</td></tr>`;
  } else {
    rows.innerHTML = data.map((b) => `
      <tr>
        <td>
          <div style="font-weight:600">${LMP.escapeHtml(b.reader?.full_name || '-')}</div>
          <div style="color:var(--muted);font-size:12px">${LMP.escapeHtml(b.reader?.reader_code || '')}</div>
        </td>
        <td>${LMP.escapeHtml(b.book?.title || '-')}<div style="color:var(--muted);font-size:12px">${LMP.escapeHtml(b.book?.author || '')}</div></td>
        <td>${LMP.formatDate(b.borrow_date)}</td>
        <td>${LMP.formatDate(b.due_date)}${b.overdue_days ? ` <span class="badge-pill danger">+${b.overdue_days}d</span>` : ''}</td>
        <td>${LMP.formatDate(b.return_date)}</td>
        <td>${LMP.statusBadge(b.status)}</td>
        <td class="actions">
          ${b.status !== 'RETURNED' ? `<button class="btn sm primary" data-return="${b.id}"><i data-lucide="check"></i> Return</button>` : ''}
        </td>
      </tr>`).join('');
    rows.querySelectorAll('[data-return]').forEach((btn) => btn.addEventListener('click', () => returnBorrow(parseInt(btn.dataset.return, 10))));
  }
  renderPagination('borrowPagination', res.pagination, (p) => { borrowState.page = p; loadBorrowings(); });
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
}

async function openBorrowModal() {
  const [booksRes, readersRes] = await Promise.all([
    LMP.apiFetch('GET', '/api/books?limit=100&status=AVAILABLE'),
    LMP.apiFetch('GET', '/api/readers?limit=200&status=ACTIVE')
  ]);
  const today = new Date();
  const due = new Date(); due.setDate(today.getDate() + 14);
  const body = `
    <form id="borrowForm">
      <div class="form-row"><label>Reader *</label>
        <select name="reader_id" required>
          <option value="">-- select reader --</option>
          ${readersRes.data.map((r) => `<option value="${r.id}">${LMP.escapeHtml(r.reader_code)} - ${LMP.escapeHtml(r.full_name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row"><label>Book *</label>
        <select name="book_id" required>
          <option value="">-- select book --</option>
          ${booksRes.data.map((b) => `<option value="${b.id}">${LMP.escapeHtml(b.title)} (${b.available_quantity} avail)</option>`).join('')}
        </select>
        ${booksRes.data.length === 0 ? '<div class="hint" style="color:var(--warning)">No available books</div>' : ''}
      </div>
      <div class="form-row"><label>Due date *</label><input type="date" name="due_date" required value="${due.toISOString().slice(0, 10)}" min="${today.toISOString().slice(0, 10)}" /></div>
      <div class="form-row"><label>Note</label><textarea name="note" rows="2"></textarea></div>
    </form>`;
  LMP.openModal('modalGeneric');
  document.getElementById('modalGenericTitle').textContent = 'New borrowing';
  document.getElementById('modalGenericBody').innerHTML = body;
  document.getElementById('modalGenericFooter').innerHTML = `
    <button class="btn ghost" onclick="LMP.closeModal('modalGeneric')">Cancel</button>
    <button class="btn primary" id="borrowSave"><i data-lucide="check"></i> Confirm</button>`;
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  document.getElementById('borrowSave').addEventListener('click', saveBorrow);
}

async function saveBorrow() {
  const form = document.getElementById('borrowForm');
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.reader_id || !data.book_id || !data.due_date) {
    LMP.showToast({ type: 'warning', message: 'Please fill all required fields' }); return;
  }
  data.reader_id = parseInt(data.reader_id, 10);
  data.book_id = parseInt(data.book_id, 10);
  LMP.setLoading('#borrowSave', true);
  try {
    await LMP.apiFetch('POST', '/api/borrowings', data);
    LMP.showToast({ type: 'success', message: 'Borrowing created' });
    LMP.closeModal('modalGeneric');
    loadBorrowings();
  } catch (err) {
    LMP.showToast({ type: 'error', title: 'Failed', message: err.message });
  } finally {
    LMP.setLoading('#borrowSave', false);
  }
}

async function returnBorrow(id) {
  const ok = await LMP.confirmDialog({ title: 'Return book', message: 'Mark this borrowing as returned?', confirmText: 'Confirm' });
  if (!ok) return;
  try {
    await LMP.apiFetch('PUT', `/api/borrowings/${id}/return`);
    LMP.showToast({ type: 'success', message: 'Book returned' });
    loadBorrowings();
  } catch (err) {
    LMP.showToast({ type: 'error', title: 'Failed', message: err.message });
  }
}
