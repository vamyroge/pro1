const jwt = require('jsonwebtoken');
const { supabase, mock, isMock } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

function signToken(payload, expiresIn = '12h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7).trim();
  if (!token) return res.status(401).json({ success: false, message: 'Empty token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    let user = null;
    if (isMock()) {
      user = await mock.api.getUserById(decoded.sub);
    } else {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, full_name, role')
        .eq('id', decoded.sub)
        .single();
      if (!error) user = data;
    }
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: insufficient role' });
    }
    next();
  };
}

module.exports = { signToken, authRequired, requireRole };
