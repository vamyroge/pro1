// In-memory fallback store used only when Supabase is unreachable.
// This lets the UI render in environments where the DB is not yet set up.
// DO NOT enable in production. The real Supabase path is the default.

const bcrypt = require('bcryptjs');

let nextId = 1;
const newId = () => nextId++;

const state = {
  users: [],
  books: [],
  readers: [],
  borrowings: [],
  activity_logs: []
};

function now() { return new Date().toISOString(); }
function today() { return new Date().toISOString().slice(0, 10); }

async function seedIfEmpty() {
  if (state.users.length === 0) {
    state.users.push({
      id: newId(),
      username: 'admin',
      password_hash: await bcrypt.hash('Admin@123', 10),
      full_name: 'System Admin',
      role: 'ADMIN',
      created_at: now()
    });
  }
  if (state.books.length === 0) {
    const sample = [
      ['Clean Code', 'Robert C. Martin', 'Technology', 5],
      ['The Pragmatic Programmer', 'Andrew Hunt', 'Technology', 3],
      ['Design Patterns', 'Erich Gamma', 'Technology', 4],
      ['Atomic Habits', 'James Clear', 'Biography', 6],
      ['Sapiens', 'Yuval Noah Harari', 'History', 4],
      ['A Brief History of Time', 'Stephen Hawking', 'Science', 3],
      ['The Selfish Gene', 'Richard Dawkins', 'Science', 2],
      ['Harry Potter and the Sorcerer\'s Stone', 'J.K. Rowling', 'Children', 7],
      ['The Alchemist', 'Paulo Coelho', 'Novel', 5],
      ['Dune', 'Frank Herbert', 'Novel', 4]
    ];
    sample.forEach(([title, author, category, qty]) => {
      state.books.push({
        id: newId(), title, isbn: null, author, category, publisher: null,
        publish_year: null, quantity: qty, available_quantity: qty,
        shelf: null, description: null, cover_url: null,
        created_at: now(), updated_at: now()
      });
    });
  }
  if (state.readers.length === 0) {
    const sample = [
      ['R0001', 'Nguyen Van A', 'nguyenvana@example.com', 'CS-K21'],
      ['R0002', 'Tran Thi B', 'tranthib@example.com', 'CS-K21'],
      ['R0003', 'Le Van C', 'levanc@example.com', 'EE-K22'],
      ['R0004', 'Pham Thi D', 'phamthid@example.com', 'ME-K22'],
      ['R0005', 'Hoang Van E', 'hoangvane@example.com', 'SE-K23']
    ];
    sample.forEach(([code, name, email, klass]) => {
      state.readers.push({
        id: newId(), reader_code: code, full_name: name, email, phone: null,
        class_name: klass, address: null, status: 'ACTIVE',
        created_at: now(), updated_at: now()
      });
    });
  }
  // Seed one borrowing
  if (state.borrowings.length === 0) {
    const reader = state.readers[0];
    const book = state.books[0];
    if (reader && book) {
      const due = new Date(); due.setDate(due.getDate() - 2);
      const borrow = new Date(); borrow.setDate(borrow.getDate() - 10);
      state.borrowings.push({
        id: newId(), reader_id: reader.id, book_id: book.id,
        borrow_date: borrow.toISOString().slice(0, 10),
        due_date: due.toISOString().slice(0, 10),
        return_date: null, status: 'BORROWING',
        note: null, created_at: now(), updated_at: now()
      });
      book.available_quantity = Math.max(0, book.available_quantity - 1);
    }
  }
}

function logActivity({ user_id, action, entity_type, entity_id, description }) {
  state.activity_logs.unshift({
    id: newId(), user_id, action, entity_type, entity_id, description,
    created_at: now()
  });
  if (state.activity_logs.length > 200) state.activity_logs.length = 200;
}

// API surface mimicking the Supabase queries the routes need.
const api = {
  // --- users ---
  async findUserByUsername(username) {
    return state.users.find((u) => u.username === username) || null;
  },
  async getUserById(id) {
    return state.users.find((u) => u.id === id) || null;
  },
  async upsertUser({ username, password_hash, full_name, role }) {
    const existing = state.users.find((u) => u.username === username);
    if (existing) {
      Object.assign(existing, { password_hash, full_name, role });
      return existing;
    }
    const u = { id: newId(), username, password_hash, full_name, role: role || 'LIBRARIAN', created_at: now() };
    state.users.push(u);
    return u;
  },
  async dbHealth() {
    return { ok: true };
  },

  // --- books ---
  async listBooks({ search, category, author, status, sort, order, page, limit }) {
    let rows = state.books.slice();
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((b) => (b.title || '').toLowerCase().includes(s) || (b.isbn || '').toLowerCase().includes(s) || (b.author || '').toLowerCase().includes(s));
    }
    if (category) rows = rows.filter((b) => b.category === category);
    if (author) rows = rows.filter((b) => (b.author || '').toLowerCase().includes(author.toLowerCase()));
    if (status === 'AVAILABLE') rows = rows.filter((b) => b.available_quantity > 0);
    if (status === 'OUT') rows = rows.filter((b) => b.available_quantity <= 0);
    rows.sort((a, b) => {
      const av = a[sort] ?? ''; const bv = b[sort] ?? '';
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return order === 'asc' ? cmp : -cmp;
    });
    const total = rows.length;
    const start = (page - 1) * limit;
    return { data: rows.slice(start, start + limit), total };
  },
  async getBook(id) { return state.books.find((b) => b.id === id) || null; },
  async createBook(data) {
    if (data.isbn) {
      const dup = state.books.find((b) => b.isbn === data.isbn);
      if (dup) { const err = new Error('duplicate key'); err.code = '23505'; throw err; }
    }
    const row = { id: newId(), ...data, available_quantity: data.quantity ?? 0, created_at: now(), updated_at: now() };
    state.books.push(row);
    logActivity({ action: 'CREATE', entity_type: 'BOOK', entity_id: row.id, description: `Created book "${row.title}"` });
    return row;
  },
  async updateBook(id, data) {
    const row = state.books.find((b) => b.id === id);
    if (!row) return null;
    if (data.isbn) {
      const dup = state.books.find((b) => b.isbn === data.isbn && b.id !== id);
      if (dup) { const err = new Error('duplicate key'); err.code = '23505'; throw err; }
    }
    if (data.quantity !== undefined) {
      const delta = data.quantity - row.quantity;
      const newAvail = row.available_quantity + delta;
      if (newAvail < 0) throw new Error('Cannot reduce quantity below current borrowed copies');
      if (newAvail > data.quantity) throw new Error('available_quantity would exceed quantity');
      data.available_quantity = newAvail;
    }
    Object.assign(row, data, { updated_at: now() });
    logActivity({ action: 'UPDATE', entity_type: 'BOOK', entity_id: id, description: `Updated book "${row.title}"` });
    return row;
  },
  async deleteBook(id) {
    const idx = state.books.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    const active = state.borrowings.some((b) => b.book_id === id && b.status !== 'RETURNED');
    if (active) { const err = new Error('Cannot delete book with active borrowings'); err.code = 'ACTIVE'; throw err; }
    const [row] = state.books.splice(idx, 1);
    logActivity({ action: 'DELETE', entity_type: 'BOOK', entity_id: id, description: `Deleted book "${row.title}"` });
    return true;
  },

  // --- readers ---
  async listReaders({ search, status, sort, order, page, limit }) {
    let rows = state.readers.slice();
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) => (r.full_name || '').toLowerCase().includes(s) || (r.reader_code || '').toLowerCase().includes(s) || (r.email || '').toLowerCase().includes(s));
    }
    if (status) rows = rows.filter((r) => r.status === status);
    rows.sort((a, b) => {
      const av = a[sort] ?? ''; const bv = b[sort] ?? '';
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return order === 'asc' ? cmp : -cmp;
    });
    const total = rows.length;
    const start = (page - 1) * limit;
    return { data: rows.slice(start, start + limit), total };
  },
  async getReader(id) { return state.readers.find((r) => r.id === id) || null; },
  async createReader(data) {
    const dup = state.readers.find((r) => r.reader_code === data.reader_code);
    if (dup) { const err = new Error('duplicate key'); err.code = '23505'; throw err; }
    const row = { id: newId(), ...data, created_at: now(), updated_at: now() };
    state.readers.push(row);
    logActivity({ action: 'CREATE', entity_type: 'READER', entity_id: row.id, description: `Created reader "${row.full_name}"` });
    return row;
  },
  async updateReader(id, data) {
    const row = state.readers.find((r) => r.id === id);
    if (!row) return null;
    if (data.reader_code) {
      const dup = state.readers.find((r) => r.reader_code === data.reader_code && r.id !== id);
      if (dup) { const err = new Error('duplicate key'); err.code = '23505'; throw err; }
    }
    Object.assign(row, data, { updated_at: now() });
    logActivity({ action: 'UPDATE', entity_type: 'READER', entity_id: id, description: `Updated reader "${row.full_name}"` });
    return row;
  },
  async deleteReader(id) {
    const idx = state.readers.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    const active = state.borrowings.some((b) => b.reader_id === id && b.status !== 'RETURNED');
    if (active) { const err = new Error('Reader has active borrowings'); err.code = 'ACTIVE'; throw err; }
    const [row] = state.readers.splice(idx, 1);
    logActivity({ action: 'DELETE', entity_type: 'READER', entity_id: id, description: `Deleted reader "${row.full_name}"` });
    return true;
  },

  // --- borrowings ---
  async listBorrowings({ status, reader_id, book_id, overdue, sort, order, page, limit }) {
    let rows = state.borrowings.slice();
    const t = today();
    if (status) {
      if (status === 'OVERDUE') rows = rows.filter((b) => b.status === 'BORROWING' && b.due_date < t);
      else rows = rows.filter((b) => b.status === status);
    }
    if (overdue) rows = rows.filter((b) => b.status === 'BORROWING' && b.due_date < t);
    if (reader_id) rows = rows.filter((b) => b.reader_id === reader_id);
    if (book_id) rows = rows.filter((b) => b.book_id === book_id);
    rows.sort((a, b) => {
      const av = a[sort] ?? ''; const bv = b[sort] ?? '';
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return order === 'asc' ? cmp : -cmp;
    });
    const total = rows.length;
    const start = (page - 1) * limit;
    const data = rows.slice(start, start + limit).map((b) => {
      const reader = state.readers.find((r) => r.id === b.reader_id);
      const book = state.books.find((bk) => bk.id === b.book_id);
      let display = b.status;
      let overdue_days = 0;
      if (b.status === 'BORROWING' && b.due_date < t) {
        display = 'OVERDUE';
        overdue_days = Math.floor((Date.parse(t) - Date.parse(b.due_date)) / 86400000);
      }
      return { ...b, status: display, overdue_days, reader, book };
    });
    return { data, total };
  },
  async borrowBook({ reader_id, book_id, due_date, user_id }) {
    const reader = state.readers.find((r) => r.id === reader_id);
    if (!reader) throw new Error('READER_NOT_FOUND');
    if (reader.status !== 'ACTIVE') throw new Error('READER_INACTIVE');
    const book = state.books.find((b) => b.id === book_id);
    if (!book) throw new Error('BOOK_NOT_FOUND');
    if (book.available_quantity <= 0) throw new Error('NO_AVAILABLE_COPY');
    if (due_date < today()) throw new Error('INVALID_DUE_DATE');
    const row = {
      id: newId(), reader_id, book_id,
      borrow_date: today(), due_date,
      return_date: null, status: 'BORROWING', note: null,
      created_at: now(), updated_at: now()
    };
    state.borrowings.push(row);
    book.available_quantity -= 1;
    logActivity({ user_id, action: 'BORROW', entity_type: 'BORROWING', entity_id: row.id, description: `Reader "${reader.full_name}" borrowed "${book.title}"` });
    return { borrowing_id: row.id, new_available: book.available_quantity };
  },
  async returnBook({ id, user_id }) {
    const b = state.borrowings.find((x) => x.id === id);
    if (!b) throw new Error('BORROWING_NOT_FOUND');
    if (b.status === 'RETURNED') throw new Error('ALREADY_RETURNED');
    const book = state.books.find((bk) => bk.id === b.book_id);
    if (!book) throw new Error('BOOK_NOT_FOUND');
    b.status = 'RETURNED';
    b.return_date = today();
    b.updated_at = now();
    book.available_quantity += 1;
    const reader = state.readers.find((r) => r.id === b.reader_id);
    logActivity({ user_id, action: 'RETURN', entity_type: 'BORROWING', entity_id: b.id, description: `Reader "${reader?.full_name}" returned "${book.title}"` });
    return { borrowing_id: b.id, new_available: book.available_quantity };
  },

  // --- dashboard ---
  async getStats() {
    const total_copies = state.books.reduce((s, b) => s + b.quantity, 0);
    const total_available = state.books.reduce((s, b) => s + b.available_quantity, 0);
    const t = today();
    const currently_borrowing = state.borrowings.filter((b) => b.status === 'BORROWING').length;
    const total_returned = state.borrowings.filter((b) => b.status === 'RETURNED').length;
    const overdue = state.borrowings.filter((b) => b.status === 'BORROWING' && b.due_date < t);

    // last 7 days
    const since = new Date(); since.setDate(since.getDate() - 6);
    const sinceStr = since.toISOString().slice(0, 10);
    const buckets = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(since); d.setDate(since.getDate() + i);
      buckets[d.toISOString().slice(0, 10)] = 0;
    }
    state.borrowings.forEach((b) => { if (b.borrow_date >= sinceStr && buckets[b.borrow_date] !== undefined) buckets[b.borrow_date]++; });
    const last7 = Object.entries(buckets).map(([date, count]) => ({ date, count }));

    const catMap = {};
    state.books.forEach((b) => { const k = b.category || 'Other'; catMap[k] = (catMap[k] || 0) + 1; });
    const byCategory = Object.entries(catMap).map(([category, count]) => ({ category, count }));

    const overdue_list = overdue.map((b) => {
      const reader = state.readers.find((r) => r.id === b.reader_id);
      const book = state.books.find((bk) => bk.id === b.book_id);
      const days = Math.floor((Date.parse(t) - Date.parse(b.due_date)) / 86400000);
      return { ...b, status: 'OVERDUE', overdue_days: days, reader, book };
    });

    return {
      totals: {
        total_books_copies: total_copies,
        total_books_available: total_available,
        total_readers: state.readers.length,
        currently_borrowing,
        total_overdue: overdue.length,
        total_borrowings: state.borrowings.length,
        total_returned
      },
      last_7_days_borrowings: last7,
      books_by_category: byCategory,
      status_distribution: [
        { status: 'BORROWING', count: currently_borrowing },
        { status: 'RETURNED', count: total_returned },
        { status: 'OVERDUE', count: overdue.length }
      ],
      overdue_list
    };
  },
  async listActivity(limit) {
    return state.activity_logs.slice(0, limit).map((a) => {
      const user = state.users.find((u) => u.id === a.user_id);
      return { ...a, user: user ? { id: user.id, username: user.username, full_name: user.full_name, role: user.role } : null };
    });
  }
};

module.exports = { seedIfEmpty, api };
