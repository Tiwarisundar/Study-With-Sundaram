const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authRequired, adminOnly } = require('../middleware/auth');
const { COURSES_QR_DIR } = require('../config/storage');

const router = express.Router();

const qrDir = COURSES_QR_DIR;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, qrDir),
  filename: (req, file, cb) => {
    cb(null, `course-${req.params.id || 'new'}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

// List all courses (any logged-in user)
router.get('/', authRequired, (req, res) => {
  const courses = db.prepare('SELECT * FROM courses ORDER BY created_at DESC').all();
  res.json({ courses });
});

// Create a course (admin only)
router.post('/', authRequired, adminOnly, (req, res) => {
  const { title, description, price } = req.body;
  if (!title) return res.status(400).json({ error: 'Course title required hai.' });

  const parsedPrice = parseFloat(price) || 0;
  const info = db.prepare('INSERT INTO courses (title, description, price, created_by) VALUES (?, ?, ?, ?)')
    .run(title.trim(), description || '', parsedPrice, req.user.id);

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
  res.json({ message: 'Course create ho gaya.', course });
});

// Update a course's price/details (admin only)
router.put('/:id', authRequired, adminOnly, (req, res) => {
  const { title, description, price } = req.body;
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course nahi mila.' });

  db.prepare('UPDATE courses SET title = ?, description = ?, price = ? WHERE id = ?')
    .run(title?.trim() || course.title, description ?? course.description, price !== undefined ? (parseFloat(price) || 0) : course.price, req.params.id);

  res.json({ message: 'Course update ho gaya.', course: db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id) });
});

// Delete a course (admin only)
router.delete('/:id', authRequired, adminOnly, (req, res) => {
  db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
  res.json({ message: 'Course delete ho gaya.' });
});

// Upload course-specific QR (admin only)
router.post('/:id/qr', authRequired, adminOnly, upload.single('qr'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file required hai.' });
    const qrPath = `/uploads/courses/${req.file.filename}`;
    db.prepare('UPDATE courses SET qr_image = ? WHERE id = ?').run(qrPath, req.params.id);
    res.json({ message: 'Course QR update ho gaya.', qr_image: qrPath });
  } catch (err) {
    res.status(500).json({ error: 'Upload fail hua.' });
  }
});

// Get single course with its materials + videos (locked if paid & not enrolled)
router.get('/:id/details', authRequired, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course nahi mila.' });

  const isPaid = course.price && course.price > 0;
  const isAdmin = req.user.role === 'admin';
  const enrolled = isAdmin || !isPaid || !!db.prepare('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?')
    .get(req.user.id, req.params.id);

  if (!enrolled) {
    // Locked: don't leak file paths, just counts
    const materialCount = db.prepare('SELECT COUNT(*) as c FROM materials WHERE course_id = ?').get(req.params.id).c;
    const videoCount = db.prepare('SELECT COUNT(*) as c FROM videos WHERE course_id = ?').get(req.params.id).c;
    return res.json({ course, locked: true, materialCount, videoCount, materials: [], videos: [] });
  }

  const materials = db.prepare('SELECT * FROM materials WHERE course_id = ? ORDER BY created_at DESC').all(req.params.id);
  const videos = db.prepare('SELECT * FROM videos WHERE course_id = ? ORDER BY created_at DESC').all(req.params.id);

  // attach this user's watch progress on each video
  const videosWithProgress = videos.map(v => {
    const session = db.prepare('SELECT last_position, watched_percent FROM video_sessions WHERE video_id = ? AND user_id = ?')
      .get(v.id, req.user.id);
    return { ...v, progress: session || { last_position: 0, watched_percent: 0 } };
  });

  res.json({ course, locked: false, materials, videos: videosWithProgress });
});

module.exports = router;
