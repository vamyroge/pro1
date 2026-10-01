const express = require('express');
const { supabase, mock, isMock } = require('../config/db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const router = express.Router();

const SORTABLE = new Set(['title', 'isbn', 'author', 'category', 'quantity', 'available_quantity', 'created_at', 'updated_at', 'publish_year']);
const CATEGORIES = new Set(['Novel', 'Science', 'Technology', 'History', 'Biography', 'Children', 'Reference', 'Other']);

function parseInt32(value, def, min = 1, max = 10000) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function validateBookPayload(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.title !== undefined) {
    if (!body.title || !String(body.title).trim()) errors.push('title is required');
    else data.title = String(body.title).trim();
  }
  if (!partial || body.isbn !== undefined) {
    if (body.isbn !== undefined && body.isbn !== null && body.isbn !== '') {
      data.isbn = String(body.isbn).trim();
    } else if (!partial) {
      data.isbn = null;
    }
  }
  if (!partial || body.author !== undefined) data.author = body.author ? String(body.author).trim() : null;
  if (!partial || body.publisher !== undefined) data.publisher = body.publisher ? String(body.publisher).trim() : null;
  if (!partial || body.category !== undefined) {
    const cat = body.category ? String(body.category).trim() : 'Other';
    if (!CATEGORIES.has(cat)) errors.push(`category must be one of: ${[...CATEGORIES].join(', ')}`);
    data.category = cat;
  }
  if (!partial || body.publish_year !== undefined) {
    if (body.publish_year === '' || body.publish_year === null || body.publish_year === undefined) {
      data.publish_year = null;
    } else {
      const y = parseInt(body.publish_year, 10);
      if (Number.isNaN(y) || y < 1000 || y > 3000) errors.push('publish_year must be between 1000 and 3000');
      else data.publish_year = y;
    }
  }
  if (!partial || body.quantity !== undefined) {
    const q = parseInt(body.quantity, 10);
    if (Number.isNaN(q) || q < 0) errors.push('quantity must be >= 0');
    else data.quantity = q;
  }
  if (!partial || body.shelf !== undefined) data.shelf = body.shelf ? String(body.shelf).trim() : null;
  if (!partial || body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
  if (!partial || body.cover_url !== undefined) data.cover_url = body.cover_url ? String(body.cover_url).trim() : null;

  return { errors, data };
}

router.get('/', asyncHandler(async (req, res) => {
  const page = parseInt32(req.query.page, 1);
  const limit = parseInt32(req.query.limit, 10, 1, 100);
  const sort = SORTABLE.has(req.query.sort) ? req.query.sort : 'created_at';
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const search = (req.query.search || '').toString().trim();
  const category = (req.query.category || '').toString().trim();
  const author = (req.query.author || '').toString().trim();
  const status = (req.query.status || '').toString().trim();

  if (isMock()) {
    const { data, total } = await mock.api.listBooks({ search, category, author, status, sort, order, page, limit });
    return res.json({
      success: true, data,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    });
  }

  const offset = (page - 1) * limit;
  let query = supabase
    .from('books')
    .select('*', { count: 'exact' })
    .order(sort, { ascending: order === 'asc' });

  if (search) {
    const s = search.replace(/[%_]/g, '\\$&');
    query = query.or(`title.ilike.%${s}%,isbn.ilike.%${s}%,author.ilike.%${s}%`);
  }
  if (category) query = query.eq('category', category);
  if (author) {
    const a = author.replace(/[%_]/g, '\\$&');
    query = query.ilike('author', `%${a}%`);
  }
  if (status === 'AVAILABLE') query = query.gt('available_quantity', 0);
  if (status === 'OUT') query = query.lte('available_quantity', 0);

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw new ApiError(500, error.message);
  res.json({
    success: true,
    data,
    pagination: { page, limit, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / limit)) }
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new ApiError(400, 'Invalid id');
  if (isMock()) {
    const b = await mock.api.getBook(id);
    if (!b) throw new ApiError(404, 'Book not found');
    return res.json({ success: true, data: b });
  }
  const { data, error } = await supabase.from('books').select('*').eq('id', id).single();
  if (error || !data) throw new ApiError(404, 'Book not found');
  res.json({ success: true, data });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { errors, data } = validateBookPayload(req.body || {});
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  if (isMock()) {
    const created = await mock.api.createBook(data);
    return res.status(201).json({ success: true, data: created });
  }
  data.available_quantity = data.quantity;
  const { data: created, error } = await supabase.from('books').insert([data]).select().single();
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'ISBN already exists');
    throw new ApiError(500, error.message);
  }
  res.status(201).json({ success: true, data: created });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new ApiError(400, 'Invalid id');
  const { errors, data } = validateBookPayload(req.body || {}, { partial: true });
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);

  if (isMock()) {
    const updated = await mock.api.updateBook(id, data);
    if (!updated) throw new ApiError(404, 'Book not found');
    return res.json({ success: true, data: updated });
  }

  if (data.quantity !== undefined) {
    const { data: existing, error: e1 } = await supabase.from('books').select('quantity, available_quantity').eq('id', id).single();
    if (e1 || !existing) throw new ApiError(404, 'Book not found');
    const delta = data.quantity - existing.quantity;
    const newAvail = existing.available_quantity + delta;
    if (newAvail < 0) throw new ApiError(400, 'Cannot reduce quantity below current borrowed copies');
    if (newAvail > data.quantity) throw new ApiError(400, 'available_quantity would exceed quantity');
    data.available_quantity = newAvail;
  }

  const { data: updated, error } = await supabase.from('books').update(data).eq('id', id).select().single();
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'ISBN already exists');
    throw new ApiError(500, error.message);
  }
  if (!updated) throw new ApiError(404, 'Book not found');
  res.json({ success: true, data: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new ApiError(400, 'Invalid id');

  if (isMock()) {
    try { await mock.api.deleteBook(id); }
    catch (e) { throw new ApiError(e.code === 'ACTIVE' ? 409 : 500, e.message); }
    return res.json({ success: true, message: 'Book deleted' });
  }

  const { count, error: cntErr } = await supabase
    .from('borrowings')
    .select('id', { count: 'exact', head: true })
    .eq('book_id', id)
    .neq('status', 'RETURNED');
  if (cntErr) throw new ApiError(500, cntErr.message);
  if ((count || 0) > 0) throw new ApiError(409, 'Cannot delete book with active borrowings');

  const { error } = await supabase.from('books').delete().eq('id', id);
  if (error) throw new ApiError(500, error.message);
  res.json({ success: true, message: 'Book deleted' });
}));

module.exports = router;
