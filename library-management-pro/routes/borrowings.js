const express = require('express');
const { supabase, mock, isMock } = require('../config/db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const router = express.Router();

const SORTABLE = new Set(['borrow_date', 'due_date', 'return_date', 'status', 'created_at']);

function parseInt32(value, def, min = 1, max = 10000) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function translateRpcError(message) {
  if (!message) return 'Borrow failed';
  if (message.includes('READER_NOT_FOUND')) return 'Reader not found';
  if (message.includes('BOOK_NOT_FOUND')) return 'Book not found';
  if (message.includes('READER_INACTIVE')) return 'Reader is not active';
  if (message.includes('NO_AVAILABLE_COPY')) return 'No available copy for this book';
  if (message.includes('INVALID_DUE_DATE')) return 'Due date must be today or later';
  if (message.includes('ALREADY_RETURNED')) return 'Borrowing already returned';
  if (message.includes('BORROWING_NOT_FOUND')) return 'Borrowing not found';
  return message;
}

router.get('/', asyncHandler(async (req, res) => {
  const page = parseInt32(req.query.page, 1);
  const limit = parseInt32(req.query.limit, 10, 1, 100);
  const sort = SORTABLE.has(req.query.sort) ? req.query.sort : 'created_at';
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const status = (req.query.status || '').toString().trim().toUpperCase();
  const readerId = req.query.reader_id ? parseInt(req.query.reader_id, 10) : null;
  const bookId = req.query.book_id ? parseInt(req.query.book_id, 10) : null;
  const overdue = req.query.overdue === 'true';

  if (isMock()) {
    const { data, total } = await mock.api.listBorrowings({ status, reader_id: readerId, book_id: bookId, overdue, sort, order, page, limit });
    return res.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  }

  const offset = (page - 1) * limit;
  let query = supabase
    .from('borrowings')
    .select('*, reader:readers(id, reader_code, full_name, email), book:books(id, title, isbn, author)', { count: 'exact' })
    .order(sort, { ascending: order === 'asc' });

  if (status) query = query.eq('status', status);
  if (readerId && !Number.isNaN(readerId)) query = query.eq('reader_id', readerId);
  if (bookId && !Number.isNaN(bookId)) query = query.eq('book_id', bookId);
  if (overdue) {
    query = query.eq('status', 'BORROWING').lt('due_date', new Date().toISOString().slice(0, 10));
  }
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw new ApiError(500, error.message);

  const today = new Date().toISOString().slice(0, 10);
  const decorated = (data || []).map((b) => {
    if (b.status === 'BORROWING' && b.due_date < today) {
      const days = Math.floor((Date.parse(today) - Date.parse(b.due_date)) / 86400000);
      return { ...b, status: 'OVERDUE', overdue_days: days };
    }
    return b;
  });

  res.json({
    success: true, data: decorated,
    pagination: { page, limit, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / limit)) }
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { reader_id, book_id, due_date, note } = req.body || {};
  if (!reader_id || !book_id || !due_date) throw new ApiError(400, 'reader_id, book_id and due_date are required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due_date))) throw new ApiError(400, 'due_date must be YYYY-MM-DD');
  const due = new Date(due_date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (due < today) throw new ApiError(400, 'due_date must be today or later');

  if (isMock()) {
    try {
      const r = await mock.api.borrowBook({ reader_id: parseInt(reader_id, 10), book_id: parseInt(book_id, 10), due_date, user_id: req.user ? req.user.id : null });
      return res.status(201).json({ success: true, data: { borrowing_id: r.borrowing_id, new_available: r.new_available, note: note || null } });
    } catch (e) { throw new ApiError(400, translateRpcError(e.message)); }
  }

  const { data, error } = await supabase.rpc('borrow_book', {
    p_reader_id: parseInt(reader_id, 10),
    p_book_id: parseInt(book_id, 10),
    p_due_date: due_date,
    p_user_id: req.user ? req.user.id : null
  });
  if (error) throw new ApiError(400, translateRpcError(error.message), { raw: error.message });
  const result = Array.isArray(data) ? data[0] : data;
  res.status(201).json({ success: true, data: { borrowing_id: result.borrowing_id, new_available: result.new_available, note: note || null } });
}));

router.put('/:id/return', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new ApiError(400, 'Invalid id');

  if (isMock()) {
    try {
      const r = await mock.api.returnBook({ id, user_id: req.user ? req.user.id : null });
      return res.json({ success: true, data: { borrowing_id: r.borrowing_id, new_available: r.new_available } });
    } catch (e) { throw new ApiError(400, translateRpcError(e.message)); }
  }

  const { data, error } = await supabase.rpc('return_book', {
    p_borrowing_id: id, p_user_id: req.user ? req.user.id : null
  });
  if (error) throw new ApiError(400, translateRpcError(error.message), { raw: error.message });
  const result = Array.isArray(data) ? data[0] : data;
  res.json({ success: true, data: { borrowing_id: result.borrowing_id, new_available: result.new_available } });
}));

module.exports = router;
