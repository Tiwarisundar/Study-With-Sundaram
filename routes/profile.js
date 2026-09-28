const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// Get my full profile
router.get('/', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, phone, class_name, address, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  res.json({ user });
});

// Update my own profile (name, phone, class, address). Email/role change not allowed here.
router.put('/', authRequired, (req, res) => {
  try {
    const { name, phone, class_name, address } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Naam khali nahi ho sakta.' });
    }

    db.prepare('UPDATE users SET name = ?, phone = ?, class_name = ?, address = ? WHERE id = ?')
      .run(name.trim(), phone?.trim() || null, class_name?.trim() || null, address?.trim() || null, req.user.id);

    const updated = db.prepare('SELECT id, name, email, role, phone, class_name, address FROM users WHERE id = ?')
      .get(req.user.id);

    res.json({ message: 'Profile update ho gayi!', user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Profile update fail hui.' });
  }
});

// Change my own password
router.put('/password', authRequired, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current aur new password dono required hain.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Naya password kam se kam 6 characters ka hona chahiye.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password)) {
      return res.status(401).json({ error: 'Current password galat hai.' });
    }

    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);

    res.json({ message: 'Password change ho gaya!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Password change fail hua.' });
  }
});

module.exports = router;
