const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('../routes/auth');
const booksRoutes = require('../routes/books');
const readersRoutes = require('../routes/readers');
const borrowingsRoutes = require('../routes/borrowings');
const dashboardRoutes = require('../routes/dashboard');
const { authRequired } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { supabase, isMock, init: initDb } = require('../config/db');

// Vercel sets USE_MOCK=1 by default so the deployed demo always works
// even if Supabase isn't configured. Override in project env to use real DB.
if (process.env.VERCEL && !process.env.SUPABASE_URL) {
  process.env.USE_MOCK = '1';
}

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' }
});
app.use('/api', apiLimiter);

// Health
app.get('/api/health', asyncHandler(async (req, res) => {
  let dbOk = false;
  try {
    if (isMock()) dbOk = true;
    else {
      const { error } = await supabase.from('books').select('id', { head: true, count: 'exact' }).limit(1);
      dbOk = !error;
    }
  } catch (e) { /* ignore */ }
  res.json({
    success: true,
    message: 'Library API is running',
    mode: isMock() ? 'mock' : 'supabase',
    db: dbOk ? 'ok' : 'unavailable',
    time: new Date().toISOString()
  });
}));

// Auth
app.use('/api/auth', authRoutes);
app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ success: true, data: req.user });
});

// Protected resources
app.use('/api/books', authRequired, booksRoutes);
app.use('/api/readers', authRequired, readersRoutes);
app.use('/api/borrowings', authRequired, borrowingsRoutes);
app.use('/api/dashboard', authRequired, dashboardRoutes);

// Serve static frontend from /public
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Friendly routes for SPA-style navigation
app.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get(/^\/(books|readers|borrowings|reports|settings|dashboard).*$/, (req, res) => {
  const file = path.join(publicDir, 'index.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  res.status(404).end();
});

// 404
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// Centralized error handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }
  res.status(status).json({
    success: false,
    message: err.message || 'Something went wrong',
    details: err.details
  });
});

module.exports = app;

if (require.main === module) {
  // Initialize DB layer (supabase or mock) before binding the port.
  initDb().then(() => {
    const PORT = parseInt(process.env.PORT, 10) || 3000;
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`[server] listening on http://localhost:${PORT} (db: ${isMock() ? 'mock' : 'supabase'})`);
    });
  }).catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[server] failed to start:', e);
    process.exit(1);
  });
}
