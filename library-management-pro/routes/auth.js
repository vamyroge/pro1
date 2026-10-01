const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { supabase, mock, isMock } = require('../config/db');
const { signToken } = require('../middleware/auth');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts, please try again later' }
});

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new ApiError(400, 'Username and password are required');

  let user;
  if (isMock()) {
    user = await mock.api.findUserByUsername(String(username).trim());
  } else {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, password_hash, full_name, role')
      .eq('username', String(username).trim())
      .single();
    user = data;
    if (error) user = null;
  }
  if (!user) throw new ApiError(401, 'Invalid credentials');

  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) throw new ApiError(401, 'Invalid credentials');

  const token = signToken({ sub: user.id, role: user.role, username: user.username });
  res.json({
    success: true, token,
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role }
  });
}));

router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
