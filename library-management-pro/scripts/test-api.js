#!/usr/bin/env node
// Lightweight API smoke test. Requires server running at BASE_URL.
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function call(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (_) { /* not json */ }
  return { status: res.status, json };
}

function ok(name, cond, extra) {
  const symbol = cond ? '✓' : '✗';
  console.log(`${symbol} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  console.log(`Testing ${BASE_URL} ...`);

  // Health
  let r = await call('GET', '/api/health');
  ok('GET /api/health', r.status === 200 && r.json && r.json.success === true);

  // Login (using default admin from seed)
  r = await call('POST', '/api/auth/login', { body: { username: 'admin', password: process.env.TEST_PASSWORD || 'Admin@123' } });
  ok('POST /api/auth/login', r.status === 200 && r.json && r.json.token, r.json && r.json.message);
  const token = r.json && r.json.token;

  // Me
  r = await call('GET', '/api/auth/me', { token });
  ok('GET /api/auth/me', r.status === 200 && r.json && r.json.data && r.json.data.username === 'admin');

  // Books list
  r = await call('GET', '/api/books?limit=5', { token });
  ok('GET /api/books', r.status === 200 && r.json && Array.isArray(r.json.data), `count=${r.json && r.json.data && r.json.data.length}`);

  // Create book
  const isbn = `TEST-${Date.now()}`;
  r = await call('POST', '/api/books', { token, body: {
    title: 'Test Driven API', isbn, author: 'Tester', category: 'Technology', quantity: 2, publish_year: 2024
  } });
  ok('POST /api/books', r.status === 201 && r.json && r.json.data && r.json.data.id, r.json && r.json.message);
  const bookId = r.json && r.json.data && r.json.data.id;

  // Update book
  r = await call('PUT', `/api/books/${bookId}`, { token, body: { quantity: 3 } });
  ok('PUT /api/books/:id', r.status === 200 && r.json && r.json.data && r.json.data.quantity === 3);

  // Readers
  const code = `R-${Date.now()}`;
  r = await call('POST', '/api/readers', { token, body: { reader_code: code, full_name: 'Test Reader', email: 'test@example.com' } });
  ok('POST /api/readers', r.status === 201 && r.json && r.json.data, r.json && r.json.message);
  const readerId = r.json && r.json.data && r.json.data.id;

  r = await call('PUT', `/api/readers/${readerId}`, { token, body: { phone: '0900000099' } });
  ok('PUT /api/readers/:id', r.status === 200 && r.json && r.json.data && r.json.data.phone === '0900000099');

  // Borrow
  const due = new Date(); due.setDate(due.getDate() + 7);
  r = await call('POST', '/api/borrowings', { token, body: { reader_id: readerId, book_id: bookId, due_date: due.toISOString().slice(0, 10) } });
  ok('POST /api/borrowings', r.status === 201 && r.json && r.json.data && r.json.data.borrowing_id, r.json && r.json.message);
  const borrowingId = r.json && r.json.data && r.json.data.borrowing_id;

  r = await call('GET', '/api/borrowings', { token });
  ok('GET /api/borrowings', r.status === 200 && r.json && Array.isArray(r.json.data));

  r = await call('PUT', `/api/borrowings/${borrowingId}/return`, { token });
  ok('PUT /api/borrowings/:id/return', r.status === 200 && r.json && r.json.success === true, r.json && r.json.message);

  // Verify available_quantity returned to 3
  r = await call('GET', `/api/books/${bookId}`, { token });
  ok('Quantity consistency after return', r.json && r.json.data && r.json.data.available_quantity === 3, `avail=${r.json && r.json.data && r.json.data.available_quantity}`);

  // Dashboard
  r = await call('GET', '/api/dashboard/stats', { token });
  ok('GET /api/dashboard/stats', r.status === 200 && r.json && r.json.data && r.json.data.totals);
  r = await call('GET', '/api/dashboard/activity', { token });
  ok('GET /api/dashboard/activity', r.status === 200 && r.json && Array.isArray(r.json.data));

  // Delete test data
  r = await call('DELETE', `/api/readers/${readerId}`, { token });
  ok('DELETE /api/readers/:id', r.status === 200);
  r = await call('DELETE', `/api/books/${bookId}`, { token });
  ok('DELETE /api/books/:id', r.status === 200);

  console.log(process.exitCode ? 'Some checks failed.' : 'All checks passed.');
})();
