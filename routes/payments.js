const express = require('express');
const db = require('../db');
const { authRequired, adminOnly } = require('../middleware/auth');

const router = express.Router();

function hasAccess(userId, course) {
  if (!course.price || course.price <= 0) return true;
  const enrolled = db.prepare('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?').get(userId, course.id);
  return !!enrolled;
}

// Student: submit a payment (UTR/transaction id) for a paid course
router.post('/', authRequired, (req, res) => {
  try {
    const { course_id, utr } = req.body;
    if (!course_id || !utr || !utr.trim()) {
      return res.status(400).json({ error: 'Course aur UTR/Transaction ID dono required hain.' });
    }

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id);
    if (!course) return res.status(404).json({ error: 'Course nahi mila.' });
    if (!course.price || course.price <= 0) {
      return res.status(400).json({ error: 'Yeh course free hai, payment ki zarurat nahi.' });
    }

    const alreadyEnrolled = db.prepare('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?')
      .get(req.user.id, course_id);
    if (alreadyEnrolled) return res.status(400).json({ error: 'Aap pehle se is course mein enrolled hain.' });

    const pending = db.prepare("SELECT * FROM payments WHERE user_id = ? AND course_id = ? AND status = 'pending'")
      .get(req.user.id, course_id);
    if (pending) return res.status(400).json({ error: 'Aapka ek payment already pending/review mein hai.' });

    const info = db.prepare('INSERT INTO payments (user_id, course_id, amount, utr, status) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, course_id, course.price, utr.trim(), 'pending');

    res.json({
      message: 'Payment submit ho gaya! Admin verify karne ke baad course unlock ho jayega.',
      payment: db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Payment submit fail hua.' });
  }
});

// Student: check my payment status for a course
router.get('/mine/:courseId', authRequired, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.courseId);
  if (!course) return res.status(404).json({ error: 'Course nahi mila.' });

  const enrolled = hasAccess(req.user.id, course) || req.user.role === 'admin';
  const latestPayment = db.prepare(
    'SELECT * FROM payments WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(req.user.id, req.params.courseId);

  res.json({ enrolled, latestPayment: latestPayment || null, price: course.price });
});

// Admin: list all payments (optionally filter by status)
router.get('/', authRequired, adminOnly, (req, res) => {
  const status = req.query.status;
  let rows;
  if (status) {
    rows = db.prepare(`
      SELECT p.*, u.name as user_name, u.email as user_email, c.title as course_title
      FROM payments p
      JOIN users u ON u.id = p.user_id
      JOIN courses c ON c.id = p.course_id
      WHERE p.status = ?
      ORDER BY p.created_at DESC
    `).all(status);
  } else {
    rows = db.prepare(`
      SELECT p.*, u.name as user_name, u.email as user_email, c.title as course_title
      FROM payments p
      JOIN users u ON u.id = p.user_id
      JOIN courses c ON c.id = p.course_id
      ORDER BY p.created_at DESC
    `).all();
  }
  res.json({ payments: rows });
});

// Admin: approve a payment -> grants enrollment
router.post('/:id/approve', authRequired, adminOnly, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment record nahi mila.' });
  if (payment.status !== 'pending') return res.status(400).json({ error: 'Yeh payment already processed hai.' });

  const tx = db.transaction(() => {
    db.prepare("UPDATE payments SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(payment.id);
    db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)')
      .run(payment.user_id, payment.course_id);
  });
  tx();

  res.json({ message: 'Payment approve ho gaya. Student ka course unlock ho gaya.' });
});

// Admin: reject a payment
router.post('/:id/reject', authRequired, adminOnly, (req, res) => {
  const { admin_note } = req.body;
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment record nahi mila.' });
  if (payment.status !== 'pending') return res.status(400).json({ error: 'Yeh payment already processed hai.' });

  db.prepare("UPDATE payments SET status = 'rejected', admin_note = ?, updated_at = datetime('now') WHERE id = ?")
    .run(admin_note || null, payment.id);

  res.json({ message: 'Payment reject ho gaya.' });
});

module.exports = router;
