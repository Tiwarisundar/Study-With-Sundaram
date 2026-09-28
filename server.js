require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { SETTINGS_DIR, COURSES_QR_DIR } = require('./config/storage');

require('./db'); // initializes DB + seeds admin

const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/courses');
const materialRoutes = require('./routes/materials');
const videoRoutes = require('./routes/videos');
const userRoutes = require('./routes/users');
const profileRoutes = require('./routes/profile');
const paymentRoutes = require('./routes/payments');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// static frontend
app.use(express.static(path.join(__dirname, 'public')));
// Note: study material files are now served via the protected /api/materials/file/:id route
// (enforces enrollment for paid courses). Videos stream via /api/videos/stream/:filename.
// The merchant QR settings image is small/non-sensitive and safe to serve statically:
app.use('/uploads/settings', express.static(SETTINGS_DIR));
// Per-course QR images (uploaded via admin "Update QR" on a specific course) — also
// non-sensitive, safe to serve statically. (This route was missing before, which meant
// course-specific QR codes uploaded by admin could never actually be viewed.)
app.use('/uploads/courses', express.static(COURSES_QR_DIR));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/settings', settingsRoutes);

// health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'Study With Sundaram' }));

// fallback: send index.html for any unknown non-api route (simple SPA-ish behaviour)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎓 Study With Sundaram server chal raha hai: http://localhost:${PORT}\n`);
});
