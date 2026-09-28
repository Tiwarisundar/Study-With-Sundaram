const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authRequired, adminOnly, JWT_SECRET } = require('../middleware/auth');
const { VIDEOS_DIR } = require('../config/storage');

const router = express.Router();

const videosDir = VIDEOS_DIR;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, videosDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const allowedVideoTypes = ['.mp4', '.webm', '.mov', '.mkv'];
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedVideoTypes.includes(ext)) {
      return cb(new Error('Video type allowed nahi hai. Allowed: mp4, webm, mov, mkv'));
    }
    cb(null, true);
  }
});

// Upload video (admin only, feature)
router.post('/', authRequired, adminOnly, upload.single('video'), (req, res) => {
  try {
    const { course_id, title } = req.body;
    if (!course_id || !title || !req.file) {
      return res.status(400).json({ error: 'Course, title aur video — teeno required hain.' });
    }

    const relativePath = `/uploads/videos/${req.file.filename}`;
    const info = db.prepare(
      'INSERT INTO videos (course_id, title, file_path, uploaded_by) VALUES (?, ?, ?, ?)'
    ).run(course_id, title.trim(), relativePath, req.user.id);

    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(info.lastInsertRowid);
    res.json({ message: 'Video upload ho gaya! Ab yeh feature session ke saath available hai.', video });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Video upload fail hua.' });
  }
});

// List videos for a course (locked if paid course & not enrolled)
router.get('/course/:courseId', authRequired, (req, res) => {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.courseId);
  if (!course) return res.status(404).json({ error: 'Course nahi mila.' });
  const isPaid = course.price && course.price > 0;
  const enrolled = req.user.role === 'admin' || !isPaid ||
    !!db.prepare('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?').get(req.user.id, req.params.courseId);
  if (!enrolled) return res.status(402).json({ error: 'Yeh paid course hai. Pehle payment complete karein.' });

  const videos = db.prepare('SELECT * FROM videos WHERE course_id = ? ORDER BY created_at DESC').all(req.params.courseId);
  const withProgress = videos.map(v => {
    const session = db.prepare('SELECT last_position, watched_percent FROM video_sessions WHERE video_id = ? AND user_id = ?')
      .get(v.id, req.user.id);
    return { ...v, progress: session || { last_position: 0, watched_percent: 0 } };
  });
  res.json({ videos: withProgress });
});

// Delete video (admin only)
router.delete('/:id', authRequired, adminOnly, (req, res) => {
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
  if (video) {
    const filePath = path.join(videosDir, path.basename(video.file_path));
    fs.unlink(filePath, () => {});
    db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
  }
  res.json({ message: 'Video delete ho gaya.' });
});

// -------- SAVE / UPDATE WATCH SESSION (progress tracking) --------
router.post('/:id/session', authRequired, (req, res) => {
  const { last_position, watched_percent } = req.body;
  const videoId = req.params.id;

  const existing = db.prepare('SELECT * FROM video_sessions WHERE video_id = ? AND user_id = ?')
    .get(videoId, req.user.id);

  if (existing) {
    db.prepare(`UPDATE video_sessions SET last_position = ?, watched_percent = ?, last_watched_at = datetime('now')
      WHERE video_id = ? AND user_id = ?`)
      .run(last_position || 0, watched_percent || 0, videoId, req.user.id);
  } else {
    db.prepare(`INSERT INTO video_sessions (video_id, user_id, last_position, watched_percent)
      VALUES (?, ?, ?, ?)`)
      .run(videoId, req.user.id, last_position || 0, watched_percent || 0);
  }

  res.json({ message: 'Session saved.' });
});

// -------- STREAM VIDEO (supports byte-range requests + token via query for <video> tag) --------
router.get('/stream/:filename', (req, res) => {
  // <video> tags can't send Authorization headers, so accept token as query param too
  const token = req.query.token || (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Login required to watch video.' });

  let userId, role;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    userId = payload.id;
    role = payload.role;
    const session = db.prepare('SELECT * FROM login_sessions WHERE token = ?').get(token);
    if (!session) return res.status(401).json({ error: 'Session expired. Please login again.' });
  } catch {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  // enrollment check: find the video by filename, check its course price/enrollment
  const video = db.prepare("SELECT * FROM videos WHERE file_path LIKE ?").get(`%${req.params.filename}`);
  if (video) {
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(video.course_id);
    const isPaid = course && course.price && course.price > 0;
    const enrolled = role === 'admin' || !isPaid ||
      !!db.prepare('SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ?').get(userId, video.course_id);
    if (!enrolled) return res.status(402).json({ error: 'Yeh paid course hai. Pehle payment complete karein.' });
  }

  const filePath = path.join(videosDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Video not found.' });

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;
