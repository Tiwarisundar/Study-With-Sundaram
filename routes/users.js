const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authRequired, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Admin: list all users
router.get('/', authRequired, adminOnly, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, phone, class_name, address, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users });
});

// Admin: quick stats for dashboard
router.get('/stats', authRequired, adminOnly, (req, res) => {
  const totalUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'user'").get().c;
  const totalCourses = db.prepare('SELECT COUNT(*) as c FROM courses').get().c;
  const totalMaterials = db.prepare('SELECT COUNT(*) as c FROM materials').get().c;
  const totalVideos = db.prepare('SELECT COUNT(*) as c FROM videos').get().c;
  res.json({ totalUsers, totalCourses, totalMaterials, totalVideos });
});

// Admin: get a single user's full details
router.get('/:id', authRequired, adminOnly, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, phone, class_name, address, created_at FROM users WHERE id = ?')
    .get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User nahi mila.' });
  res.json({ user });
});

// Admin: edit any user's details (name, email, role, phone, class, address)
router.put('/:id', authRequired, adminOnly, (req, res) => {
  try {
    const { name, email, role, phone, class_name, address } = req.body;
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User nahi mila.' });

    if (email && email.toLowerCase().trim() !== target.email) {
      const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), req.params.id);
      if (clash) return res.status(409).json({ error: 'Yeh email pehle se kisi aur account mein use ho rahi hai.' });
    }

    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: "Role sirf 'user' ya 'admin' ho sakta hai." });
    }

    db.prepare(`UPDATE users SET name = ?, email = ?, role = ?, phone = ?, class_name = ?, address = ? WHERE id = ?`)
      .run(
        name?.trim() || target.name,
        email ? email.toLowerCase().trim() : target.email,
        role || target.role,
        phone?.trim() || null,
        class_name?.trim() || null,
        address?.trim() || null,
        req.params.id
      );

    const updated = db.prepare('SELECT id, name, email, role, phone, class_name, address, created_at FROM users WHERE id = ?')
      .get(req.params.id);
    res.json({ message: 'User details update ho gaye.', user: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update fail hua.' });
  }
});

// Admin: reset any user's password
router.put('/:id/reset-password', authRequired, adminOnly, (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Naya password kam se kam 6 characters ka hona chahiye.' });
    }
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'User nahi mila.' });

    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
    // revoke all existing sessions for that user for safety
    db.prepare('DELETE FROM login_sessions WHERE user_id = ?').run(req.params.id);

    res.json({ message: 'Password reset ho gaya. User ko naya password bata dein.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Password reset fail hua.' });
  }
});

// Admin: delete a user (cannot delete self, cannot delete last admin)
router.delete('/:id', authRequired, adminOnly, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User nahi mila.' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Aap khud ko delete nahi kar sakte.' });
  if (target.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) return res.status(400).json({ error: 'Aakhri admin account delete nahi ho sakta.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User delete ho gaya.' });
});

module.exports = router;
