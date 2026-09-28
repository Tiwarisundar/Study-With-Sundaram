const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authRequired, adminOnly } = require('../middleware/auth');
const { MATERIALS_DIR } = require('../config/storage');

const router = express.Router();

const materialsDir = MATERIALS_DIR;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, materialsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const allowedTypes = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.txt'];
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedTypes.includes(ext)) {
      return cb(new Error('File type allowed nahi hai. Allowed: PDF, DOC, PPT, Image, TXT'));
    }
    cb(null, true);
  }
});

// Upload study material (admin only)
router.post('/', authRequired, adminOnly, upload.single('file'), (req, res) => {
  try {
    const { course_id, title } = req.body;
    if (!course_id || !title || !req.file) {
      return res.status(400).json({ error: 'Course, title aur file — teeno required hain.' });
    }

    const relativePath = `/uploads/materials/${req.file.filename}`;
    const fileType = path.extname(req.file.originalname).toLowerCase();

    const info = db.prepare(
      'INSERT INTO materials (course_id, title, file_path, file_type, uploaded_by) VALUES (?, ?, ?, ?, ?)'
    ).run(course_id, title.trim(), relativePath, fileType, req.user.id);

    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(info.lastInsertRowid);
    res.json({ message: 'Study material upload ho gaya!', material });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Upload fail hua.' });
  }
});

// List materials for a course (locked if paid course & not enrolled)
router.get('/course/:courseId', authRequired, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.courseId);
  if (!course) return res.status(404).json({ error: 'Course nahi mila.' });

  const isPaid = course.price && course.price > 0;
  const enrolled = req.user.role === 'admin' || !isPaid ||
    !!db.prepare('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?').get(req.user.id, req.params.courseId);

  if (!enrolled) return res.status(402).json({ error: 'Yeh paid course hai. Pehle payment complete karein.' });

  const materials = db.prepare('SELECT * FROM materials WHERE course_id = ? ORDER BY created_at DESC').all(req.params.courseId);
  res.json({ materials });
});

// Delete material (admin only)
router.delete('/:id', authRequired, adminOnly, (req, res) => {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (material) {
    const filePath = path.join(materialsDir, path.basename(material.file_path));
    fs.unlink(filePath, () => {});
    db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);
  }
  res.json({ message: 'Material delete ho gaya.' });
});

// Serve a material file securely (checks enrollment for paid courses)
router.get('/file/:id', authRequired, (req, res) => {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).json({ error: 'Material nahi mila.' });

  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(material.course_id);
  const isPaid = course && course.price && course.price > 0;
  const enrolled = req.user.role === 'admin' || !isPaid ||
    !!db.prepare('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?').get(req.user.id, material.course_id);

  if (!enrolled) return res.status(402).json({ error: 'Yeh paid course hai. Pehle payment complete karein.' });

  const filePath = path.join(materialsDir, path.basename(material.file_path));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File disk par nahi mili.' });
  res.sendFile(filePath);
});

module.exports = router;
