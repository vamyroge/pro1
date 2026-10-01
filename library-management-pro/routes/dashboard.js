const express = require('express');
const { supabase, mock, isMock } = require('../config/db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const router = express.Router();

const today = () => new Date().toISOString().slice(0, 10);

router.get('/stats', asyncHandler(async (req, res) => {
  if (isMock()) {
    const data = await mock.api.getStats();
    return res.json({ success: true, data });
  }

  const [booksAll, booksAvailable, readersAll, borrowingsAll, borrowingsBorrowing, borrowingsReturned] = await Promise.all([
    supabase.from('books').select('quantity', { head: false }),
    supabase.from('books').select('available_quantity', { head: false }),
    supabase.from('readers').select('id', { head: true, count: 'exact' }),
    supabase.from('borrowings').select('id', { head: true, count: 'exact' }),
    supabase.from('borrowings').select('id', { head: true, count: 'exact' }).eq('status', 'BORROWING'),
    supabase.from('borrowings').select('id', { head: true, count: 'exact' }).eq('status', 'RETURNED')
  ]);
  for (const r of [booksAll, booksAvailable, readersAll, borrowingsAll, borrowingsBorrowing, borrowingsReturned]) {
    if (r.error) throw new ApiError(500, r.error.message);
  }

  const totalBooks = (booksAll.data || []).reduce((s, b) => s + (b.quantity || 0), 0);
  const totalAvailable = (booksAvailable.data || []).reduce((s, b) => s + (b.available_quantity || 0), 0);
  const totalBorrowing = borrowingsBorrowing.count || 0;

  const { data: overdueRows, error: overErr } = await supabase
    .from('borrowings')
    .select('id, due_date, reader_id, book_id, reader:readers(id, reader_code, full_name), book:books(id, title)')
    .eq('status', 'BORROWING')
    .lt('due_date', today());
  if (overErr) throw new ApiError(500, overErr.message);

  const t = today();
  const overdueList = (overdueRows || []).map((b) => {
    const days = Math.floor((Date.parse(t) - Date.parse(b.due_date)) / 86400000);
    return { ...b, status: 'OVERDUE', overdue_days: days };
  });

  const since = new Date(); since.setDate(since.getDate() - 6);
  const sinceStr = since.toISOString().slice(0, 10);
  const { data: recent, error: rErr } = await supabase.from('borrowings').select('borrow_date').gte('borrow_date', sinceStr);
  if (rErr) throw new ApiError(500, rErr.message);

  const buckets = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(since); d.setDate(since.getDate() + i);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  (recent || []).forEach((r) => { if (buckets[r.borrow_date] !== undefined) buckets[r.borrow_date]++; });
  const last7 = Object.entries(buckets).map(([date, count]) => ({ date, count }));

  const { data: catRows, error: cErr } = await supabase.from('books').select('category');
  if (cErr) throw new ApiError(500, cErr.message);
  const catMap = {};
  (catRows || []).forEach((r) => { const k = r.category || 'Other'; catMap[k] = (catMap[k] || 0) + 1; });
  const byCategory = Object.entries(catMap).map(([category, count]) => ({ category, count }));

  const statusDist = { BORROWING: totalBorrowing, RETURNED: borrowingsReturned.count || 0, OVERDUE: overdueList.length };

  res.json({
    success: true,
    data: {
      totals: {
        total_books_copies: totalBooks, total_books_available: totalAvailable,
        total_readers: readersAll.count || 0, currently_borrowing: totalBorrowing,
        total_overdue: overdueList.length, total_borrowings: borrowingsAll.count || 0,
        total_returned: borrowingsReturned.count || 0
      },
      last_7_days_borrowings: last7,
      books_by_category: byCategory,
      status_distribution: Object.entries(statusDist).map(([status, count]) => ({ status, count })),
      overdue_list: overdueList.slice(0, 50)
    }
  });
}));

router.get('/activity', asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  if (isMock()) {
    const data = await mock.api.listActivity(limit);
    return res.json({ success: true, data });
  }
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, user:users(id, username, full_name, role)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new ApiError(500, error.message);
  res.json({ success: true, data });
}));

module.exports = router;
