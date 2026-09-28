const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authRequired, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// -------- SIGN UP (user only; admin accounts are seeded/created by existing admin) --------
router.post('/signup', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email aur password sabhi required hain.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password kam se kam 6 characters ka hona chahiye.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'Is email se account pehle se maujood hai. Sign in karein.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
      .run(name.trim(), email.toLowerCase().trim(), hash, 'user');

    const user = { id: info.lastInsertRowid, name, email: email.toLowerCase().trim(), role: 'user' };
    const token = issueSession(user);

    res.json({ message: 'Account ban gaya! Welcome to Study With Sundaram.', token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Signup fail hua. Dobara try karein.' });
  }
});

// -------- SIGN IN --------
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email aur password dono required hain.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Email ya password galat hai.' });
    }

    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = issueSession(safeUser);

    res.json({ message: `Welcome back, ${user.name}!`, token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login fail hua. Dobara try karein.' });
  }
});

// -------- LOGOUT --------
router.post('/logout', authRequired, (req, res) => {
  db.prepare('DELETE FROM login_sessions WHERE token = ?').run(req.token);
  res.json({ message: 'Logout ho gaya.' });
});

// -------- GET CURRENT USER (session check) --------
router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

function issueSession(user) {
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO login_sessions (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(user.id, token, expiresAt);
  return token;
}

module.exports = router;
