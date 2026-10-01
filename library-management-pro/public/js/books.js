const CATEGORIES = ['Novel', 'Science', 'Technology', 'History', 'Biography', 'Children', 'Reference', 'Other'];

const bookState = { page: 1, limit: 10, sort: 'created_at', order: 'desc', search: '', category: '', status: '' };

async function renderBooks(root) {
  root.innerHTML = `
    <div class="page-title">
      <div>
        <h1>Books</h1>
        <div class="subtitle">Manage your library catalog</div>
      </div>
      <button class="btn primary" id="btnAddBook"><i data-lucide="plus"></i> Add book</button>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="toolbar">
          <input id="bookSearch" class="grow" placeholder="Search by title, ISBN, author..." />
          <select id="bookCategory">
            <option value="">All categories</option>
            ${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <select id="bookStatus">
            <option value="">All status</option>
            <option value="AVAILABLE">Available</option>
            <option value="OUT">Out of stock</option>
          </select>
          <select id="bookSort">
            <option value="created_at">Newest</option>
            <option value="title">Title (A-Z)</option>
            <option value="author">Author</option>
            <option value="quantity">Quantity</option>
          </select>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Title</th><th>Author</th><th>Category</th><th>ISBN</th><th>Qty</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody id="bookRows"><tr><td colspan="7">${LMP.skeletonRows(6)}</td></tr></tbody>
          </table>
        </div>
        <div class="pagination" id="bookPagination"></div>
      </div>
    </div>
  `;

  document.getElementById('btnAddBook').addEventListener('click', () => openBookModal());
  document.getElementById('bookSearch').addEventListener('input', LMP.debounce((e) => { bookState.search = e.target.value.trim(); bookState.page = 1; loadBooks(); }, 400));
  document.getElementById('bookCategory').addEventListener('change', (e) => { bookState.category = e.target.value; bookState.page = 1; loadBooks(); });
  document.getElementById('bookStatus').addEventListener('change', (e) => { bookState.status = e.target.value; bookState.page = 1; loadBooks(); });
  document.getElementById('bookSort').addEventListener('change', (e) => {
    const [s, o = 'asc'] = e.target.value.split(':');
    bookState.sort = s; bookState.order = o;
    bookState.page = 1; loadBooks();
  });

  await loadBooks();
}

async function loadBooks() {
  const rows = document.getElementById('bookRows');
  rows.innerHTML = `<tr><td colspan="7">${LMP.skeletonRows(6)}</td></tr>`;
  const params = new URLSearchParams({
    page: bookState.page, limit: bookState.limit, sort: bookState.sort, order: bookState.order
  });
  if (bookState.search) params.set('search', bookState.search);
  if (bookState.category) params.set('category', bookState.category);
  if (bookState.status) params.set('status', bookState.status);
  const res = await LMP.apiFetch('GET', `/api/books?${params}`);
  const data = res.data || [];
  if (!data.length) {
    rows.innerHTML = `<tr><td colspan="7">${LMP.emptyState({ icon: 'book', title: 'No books found', message: 'Try adjusting filters or add a new book.' })}</td></tr>`;
  } else {
    rows.innerHTML = data.map((b) => `
      <tr>
        <td>
          <div style="font-weight:600">${LMP.escapeHtml(b.title)}</div>
          <div style="color:var(--muted);font-size:12px">${LMP.escapeHtml(b.publisher || '')} ${b.publish_year ? '· ' + b.publish_year : ''}</div>
        </td>
        <td>${LMP.escapeHtml(b.author || '-')}</td>
        <td><span class="badge-pill primary">${LMP.escapeHtml(b.category || 'Other')}</span></td>
        <td style="font-family:monospace;font-size:12px">${LMP.escapeHtml(b.isbn || '-')}</td>
        <td>${b.available_quantity} / ${b.quantity}</td>
        <td>${b.available_quantity > 0
            ? '<span class="badge-pill success">Available</span>'
            : '<span class="badge-pill danger">Out of stock</span>'}</td>
        <td class="actions">
          <button class="btn sm ghost" data-edit="${b.id}"><i data-lucide="pencil"></i></button>
          <button class="btn sm ghost" data-del="${b.id}"><i data-lucide="trash-2"></i></button>
        </td>
      </tr>`).join('');
    rows.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openBookModal(parseInt(btn.dataset.edit, 10))));
    rows.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', () => deleteBook(parseInt(btn.dataset.del, 10))));
  }
  renderPagination('bookPagination', res.pagination, (p) => { bookState.page = p; loadBooks(); });
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
}

function renderPagination(id, p, onChange) {
  const el = document.getElementById(id);
  if (!p || p.totalPages <= 1) { el.innerHTML = ''; return; }
  let html = `<button ${p.page === 1 ? 'disabled' : ''} data-p="${p.page - 1}"><i data-lucide="chevron-left"></i></button>`;
  for (let i = 1; i <= p.totalPages; i++) {
    if (i === 1 || i === p.totalPages || (i >= p.page - 1 && i <= p.page + 1)) {
      html += `<button class="${i === p.page ? 'active' : ''}" data-p="${i}">${i}</button>`;
    } else if (i === p.page - 2 || i === p.page + 2) {
      html += `<span style="padding:0 6px;color:var(--muted)">…</span>`;
    }
  }
  html += `<button ${p.page === p.totalPages ? 'disabled' : ''} data-p="${p.page + 1}"><i data-lucide="chevron-right"></i></button>`;
  el.innerHTML = html;
  el.querySelectorAll('button[data-p]').forEach((b) => b.addEventListener('click', () => onChange(parseInt(b.dataset.p, 10))));
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
}

async function openBookModal(id) {
  let book = { title: '', isbn: '', author: '', category: 'Other', publisher: '', publish_year: '', quantity: 1, shelf: '', description: '' };
  if (id) {
    const res = await LMP.apiFetch('GET', `/api/books/${id}`);
    book = res.data;
  }
  const title = id ? 'Edit book' : 'Add new book';
  const body = `
    <form id="bookForm">
      <div class="form-grid">
        <div class="form-row"><label>Title *</label><input name="title" required value="${LMP.escapeHtml(book.title)}" /></div>
        <div class="form-row"><label>ISBN</label><input name="isbn" value="${LMP.escapeHtml(book.isbn || '')}" /></div>
        <div class="form-row"><label>Author</label><input name="author" value="${LMP.escapeHtml(book.author || '')}" /></div>
        <div class="form-row"><label>Category</label>
          <select name="category">${CATEGORIES.map((c) => `<option ${c === book.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>Publisher</label><input name="publisher" value="${LMP.escapeHtml(book.publisher || '')}" /></div>
        <div class="form-row"><label>Publish year</label><input name="publish_year" type="number" min="1000" max="3000" value="${book.publish_year || ''}" /></div>
        <div class="form-row"><label>Quantity</label><input name="quantity" type="number" min="0" value="${book.quantity}" /></div>
        <div class="form-row"><label>Shelf</label><input name="shelf" value="${LMP.escapeHtml(book.shelf || '')}" /></div>
      </div>
      <div class="form-row"><label>Description</label><textarea name="description" rows="3">${LMP.escapeHtml(book.description || '')}</textarea></div>
    </form>`;
  const footer = `
    <button class="btn ghost" onclick="LMP.closeModal('modalGeneric')">Cancel</button>
    <button class="btn primary" id="bookSave"><i data-lucide="save"></i> Save</button>`;
  LMP.openModal('modalGeneric');
  document.getElementById('modalGenericTitle').textContent = title;
  document.getElementById('modalGenericBody').innerHTML = body;
  document.getElementById('modalGenericFooter').innerHTML = footer;
  if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  document.getElementById('bookSave').addEventListener('click', saveBook);
}

async function saveBook() {
  const form = document.getElementById('bookForm');
  const data = Object.fromEntries(new FormData(form).entries());
  data.quantity = parseInt(data.quantity, 10) || 0;
  if (data.publish_year) data.publish_year = parseInt(data.publish_year, 10);
  if (!data.title) { LMP.showToast({ type: 'warning', message: 'Title is required' }); return; }
  if (data.quantity < 0) { LMP.showToast({ type: 'warning', message: 'Quantity must be >= 0' }); return; }
  const btn = document.getElementById('bookSave');
  LMP.setLoading('#bookSave', true);
  try {
    const editingId = document.querySelector('#bookForm') && document.getElementById('bookSave').dataset.editing;
    if (editingId) {
      await LMP.apiFetch('PUT', `/api/books/${editingId}`, data);
    } else {
      await LMP.apiFetch('POST', '/api/books', data);
    }
    LMP.showToast({ type: 'success', message: 'Book saved' });
    LMP.closeModal('modalGeneric');
    loadBooks();
  } catch (err) {
    LMP.showToast({ type: 'error', title: 'Save failed', message: err.message });
  } finally {
    LMP.setLoading('#bookSave', false);
  }
}

async function deleteBook(id) {
  const ok = await LMP.confirmDialog({ title: 'Delete book', message: 'This action cannot be undone.', confirmText: 'Delete', danger: true });
  if (!ok) return;
  try {
    await LMP.apiFetch('DELETE', `/api/books/${id}`);
    LMP.showToast({ type: 'success', message: 'Book deleted' });
    loadBooks();
  } catch (err) {
    LMP.showToast({ type: 'error', title: 'Delete failed', message: err.message });
  }
}

// Patch modal: when editing, pass id via dataset
const _openBookModal = openBookModal;
openBookModal = function (id) {
  return _openBookModal(id).then(() => {
    if (id) {
      const save = document.getElementById('bookSave');
      if (save) save.dataset.editing = id;
    }
  });
};
