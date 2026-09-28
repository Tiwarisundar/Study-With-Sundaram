const path = require('path');
const fs = require('fs');

// ⚠️ ZAROORI: Yeh file batati hai ki database aur uploaded files KAHAN save honge.
//
// Apne PC par (local testing): kuch bhi set karne ki zarurat nahi, sab kuch is
// project folder ke andar hi (data/ aur uploads/) save hoga, jaisa pehle hota tha.
//
// Render (ya kisi bhi live server) par: ek PERSISTENT DISK attach karke uska
// mount path environment variable STORAGE_ROOT mein daalna hoga (jaise "/var/data").
// Aisa karne se restart/redeploy hone par bhi data/files DELETE NAHI honge —
// Render ka default disk restart par reset ho jaata hai, isiliye yeh zaroori hai.
const ROOT = process.env.STORAGE_ROOT && process.env.STORAGE_ROOT.trim()
  ? process.env.STORAGE_ROOT.trim()
  : path.join(__dirname, '..');

const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const MATERIALS_DIR = path.join(UPLOADS_DIR, 'materials');
const VIDEOS_DIR = path.join(UPLOADS_DIR, 'videos');
const SETTINGS_DIR = path.join(UPLOADS_DIR, 'settings');
const COURSES_QR_DIR = path.join(UPLOADS_DIR, 'courses');

// Sab folders pehle se bana dete hain taaki koi bhi route/db.js fail na ho
[DATA_DIR, UPLOADS_DIR, MATERIALS_DIR, VIDEOS_DIR, SETTINGS_DIR, COURSES_QR_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

module.exports = { ROOT, DATA_DIR, UPLOADS_DIR, MATERIALS_DIR, VIDEOS_DIR, SETTINGS_DIR, COURSES_QR_DIR };
