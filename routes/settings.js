const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authRequired, adminOnly } = require('../middleware/auth');
const { SETTINGS_DIR } = require('../config/storage');

const router = express.Router();

const qrDir = SETTINGS_DIR;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, qrDir),
  filename: (req, file, cb) => cb(null, 'merchant-qr' + path.extname(file.originalname)),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      return cb(new Error('Sirf JPG/PNG image allowed hai.'));
    }
    cb(null, true);
  },
});

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

// Get payment settings (any logged-in user can view, needed to show QR at checkout)
router.get('/payment', authRequired, (req, res) => {
  res.json({
    upi_id: getSetting('upi_id'),
    qr_image: getSetting('qr_image'),
  });
});

// Admin: update UPI id / upload QR
router.post('/payment', authRequired, adminOnly, upload.single('qr'), (req, res) => {
  try {
    const { upi_id } = req.body;
    if (upi_id !== undefined) setSetting('upi_id', upi_id.trim());
    if (req.file) setSetting('qr_image', `/uploads/settings/${req.file.filename}`);
    res.json({
      message: 'Payment settings update ho gaye.',
      upi_id: getSetting('upi_id'),
      qr_image: getSetting('qr_image'),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Update fail hua.' });
  }
});

module.exports = router;
