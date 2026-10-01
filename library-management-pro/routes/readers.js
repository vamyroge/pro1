const express = require('express');
const { supabase, mock, isMock } = require('../config/db');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const router = express.Router();

const SORTABLE = new Set(['reader_code', 'full_name', 'email', 'status', 'created_at', 'updated_at']);

function parseInt32(value, def, min = 1, max = 10000) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function validateReaderPayload(body, { partial = false } = {}) {
  const errors = [];
  const data = {};
  const emailRe = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  if (!partial || body.reader_code !== undefined) {
    if (!body.reader_code || !String(body.reader_code).trim()) errors.push('reader_code is required');
    else data.reader_code = String(body.reader_code).trim();
  }
  if (!partial || body.full_name !== undefined) {
    if (!body.full_name || !String(body.full_name).trim()) errors.push('full_name is required');
    else data.full_name = String(body.full_name).trim();
  }
  if (!partial || body.email !== undefined) {
    if (body.email && !emailRe.test(body.email)) errors.push('email is invalid');
    else data.email = body.email ? String(body.email).trim() : null;
  }
  if (!partial || body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null;
  if (!partial || body.class_name !== undefined) data.class_name = body.class_name ? String(body.class_name).trim() : null;
  if (!partial || body.address !== undefined) data.address = body.address ? String(body.address).trim() : null;
  if (!partial || body.status !== undefined) {
    const st = body.status ? String(body.status).trim() : 'ACTIVE';
    if (!['ACTIVE', 'INACTIVE'].includes(st)) errors.push('status must be ACTIVE or INACTIVE');
    else data.status = st;
  }
  return { errors, data };
}

router.get('/', asyncHandler(async (req, res) => {
  const page = parseInt32(req.query.page, 1);
  const limit = parseInt32(req.query.limit, 10, 1, 100);
  const sort = SORTABLE.has(req.query.sort) ? req.query.sort : 'created_at';
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const search = (req.query.search || '').toString().trim();
  const status = (req.query.status || '').toString().trim();

  if (isMock()) {
    const { data, total } = await mock.api.listReaders({ search, status, sort, order, page, limit });
    return res.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  }

  const offset = (page - 1) * limit;
  let query = supabase.from('readers').select('*', { count: 'exact' }).order(sort, { ascending: order === 'asc' });
  if (search) {
    const s = search.replace(/[%_]/g, '\\$&');
    query = query.or(`full_name.ilike.%${s}%,reader_code.ilike.%${s}%,email.ilike.%${s}%`);
  }
  if (status) query = query.eq('status', status);
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw new ApiError(500, error.message);
  res.json({ success: true, data, pagination: { page, limit, total: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / limit)) } });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new ApiError(400, 'Invalid id');
  if (isMock()) {
    const r = await mock.api.getReader(id);
    if (!r) throw new ApiError(404, 'Reader not found');
    return res.json({ success: true, data: r });
  }
  const { data, error } = await supabase.from('readers').select('*').eq('id', id).single();
  if (error || !data) throw new ApiError(404, 'Reader not found');
  res.json({ success: true, data });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { errors, data } = validateReaderPayload(req.body || {});
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  if (isMock()) {
    try { const created = await mock.api.createReader(data); return res.status(201).json({ success: true, data: created }); }
    catch (e) { throw new ApiError(e.code === '23505' ? 409 : 500, e.message); }
  }
  const { data: created, error } = await supabase.from('readers').insert([data]).select().single();
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'reader_code already exists');
    throw new ApiError(500, error.message);
  }
  res.status(201).json({ success: true, data: created });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new ApiError(400, 'Invalid id');
  const { errors, data } = validateReaderPayload(req.body || {}, { partial: true });
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  if (isMock()) {
    try { const updated = await mock.api.updateReader(id, data); if (!updated) throw new ApiError(404, 'Reader not found'); return res.json({ success: true, data: updated }); }
    catch (e) { throw new ApiError(e.code === '23505' ? 409 : 500, e.message); }
  }
  const { data: updated, error } = await supabase.from('readers').update(data).eq('id', id).select().single();
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'reader_code already exists');
    throw new ApiError(500, error.message);
  }
  if (!updated) throw new ApiError(404, 'Reader not found');
  res.json({ success: true, data: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new ApiError(400, 'Invalid id');
  if (isMock()) {
    try { await mock.api.deleteReader(id); return res.json({ success: true, message: 'Reader deleted' }); }
    catch (e) { throw new ApiError(e.code === 'ACTIVE' ? 409 : 500, e.message); }
  }
  const { count, error: cntErr } = await supabase
    .from('borrowings')
    .select('id', { count: 'exact', head: true })
    .eq('reader_id', id)
    .neq('status', 'RETURNED');
  if (cntErr) throw new ApiError(500, cntErr.message);
  if ((count || 0) > 0) throw new ApiError(409, 'Reader has active borrowings');
  const { error } = await supabase.from('readers').delete().eq('id', id);
  if (error) throw new ApiError(500, error.message);
  res.json({ success: true, message: 'Reader deleted' });
}));

module.exports = router;
