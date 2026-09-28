const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'study-with-sundaram-secret-key-change-me';

function authRequired(req, res, next) {
  const authHeader = req.headers['authorization'];
  // <a href> download/view links aur <video> tags custom headers nahi bhej sakte,
  // isliye token query param (?token=...) se bhi accept karte hain.
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token || req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Login required. Please sign in again.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Validate the session still exists (so logout / revoke works)
    const session = db.prepare('SELECT * FROM login_sessions WHERE token = ?').get(token);
    if (!session) {
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }

    const user = db.prepare('SELECT id, name, email, role, phone, class_name, address FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'User not found.' });

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only.' });
  }
  next();
}

module.exports = { authRequired, adminOnly, JWT_SECRET };
