const Database = require('better-sqlite3');
const path = require('path');
const fsSync = require('fs');
const bcrypt = require('bcryptjs');
const { DATA_DIR, SETTINGS_DIR } = require('./config/storage');

const dataDir = DATA_DIR;

const db = new Database(path.join(dataDir, 'nisha.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- SCHEMA ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user', -- 'user' or 'admin'
  phone TEXT,
  class_name TEXT,
  address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  price REAL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Tracks which user has access to which (paid) course
CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, course_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Manual UPI QR payment submissions, approved by admin
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  utr TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  admin_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Key-value app settings (merchant UPI id, QR image path, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  uploaded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Tracks each user's watch session/progress per video (resume where left off)
CREATE TABLE IF NOT EXISTS video_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_position REAL DEFAULT 0,
  watched_percent REAL DEFAULT 0,
  last_watched_at TEXT DEFAULT (datetime('now')),
  UNIQUE(video_id, user_id),
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Login sessions (so admin can see active sessions / logout everywhere)
CREATE TABLE IF NOT EXISTS login_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// ---------- MIGRATION SAFETY (for DBs created before payments feature) ----------
try {
  const cols = db.prepare("PRAGMA table_info(courses)").all().map(c => c.name);
  if (!cols.includes('price')) {
    db.exec('ALTER TABLE courses ADD COLUMN price REAL DEFAULT 0');
  }
  if (!cols.includes('qr_image')) {
    db.exec('ALTER TABLE courses ADD COLUMN qr_image TEXT');
  }
} catch (e) { console.error('Migration check failed:', e.message); }

// ---------- MIGRATION SAFETY (for DBs created before profile fields) ----------
try {
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  if (!userCols.includes('class_name')) db.exec('ALTER TABLE users ADD COLUMN class_name TEXT');
  if (!userCols.includes('address')) db.exec('ALTER TABLE users ADD COLUMN address TEXT');
} catch (e) { console.error('User profile migration check failed:', e.message); }

// ---------- SEED DEFAULT SETTINGS ----------
const fs = require('fs');
const upiSetting = db.prepare("SELECT * FROM settings WHERE key = 'upi_id'").get();
if (!upiSetting) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('upi_id', '')").run();
  // If a merchant QR image was pre-placed in uploads/settings, auto-detect and seed it
  const settingsDir = SETTINGS_DIR;
  let qrPath = '';
  if (fs.existsSync(settingsDir)) {
    const found = fs.readdirSync(settingsDir).find(f => /^merchant-qr\.(jpe?g|png)$/i.test(f));
    if (found) qrPath = `/uploads/settings/${found}`;
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('qr_image', ?)").run(qrPath);
}

// ---------- SEED DEFAULT ADMIN ----------
const adminExists = db.prepare('SELECT * FROM users WHERE role = ?').get('admin');

if (!adminExists) {
  const hash = bcrypt.hashSync('VinayNisha@2026', 10);

  db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  ).run(
    'Sundaram Admin',
    'admin@studywithsundaram.com',
    hash,
    'admin'
  );

  console.log('Admin created successfully');
}

// Existing admin ka password update karne ke liye
const newHash = bcrypt.hashSync('VinayNisha@2026', 10);

db.prepare(`
  UPDATE users
  SET password = ?
  WHERE role = 'admin'
`).run(newHash);

console.log('Admin password updated successfully');

// Seed a sample course if none exists
const courseExists = db.prepare('SELECT * FROM courses').get();
if (!courseExists) {
  const admin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  db.prepare('INSERT INTO courses (title, description, created_by) VALUES (?, ?, ?)')
    .run('Welcome Course', 'Sample course created automatically. Admin can add real courses, notes and videos from the Admin Dashboard.', admin.id);
}

module.exports = db;
