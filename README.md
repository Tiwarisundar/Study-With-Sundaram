# 🎓 Study With Sundaram — Backend (Render ke liye)

> **Note:** Yeh "Nisha Study Point" project ka hi rebranded version hai — naya logo (`Study With Sundaram`) aur naya banner use kiya gaya hai, lekin **saari functionality, features, backend logic bilkul same hai** (koi feature change nahi kiya).

Yeh backend hai — API server + database + file uploads (materials/videos/QR codes).

## ✅ Maine kya fix kiya hai is project mein

Aapke diye gaye zip mein kuch cheezein missing/broken thi, maine fix kar di:

1. **⚠️ Courses/materials/QR/users/payments restart par delete ho rahe the** — wajah: database aur uploaded files Render ke **disposable disk** par save ho rahe the, jo restart/redeploy par reset ho jaata hai. Maine ek naya `config/storage.js` add kiya jo `STORAGE_ROOT` environment variable check karta hai — Render persistent disk attach karke isse point karne se **data kabhi delete nahi hoga**. Maine locally restart-simulate karke **test bhi kiya hai** ki yeh kaam karta hai. Neeche "Persistent Disk" section mein exact setup steps hain.
2. **`public/` folder missing thi** — index.html, admin.html, user.html, css/, js/, assets/ root mein flat pade the, lekin `server.js` aur `capacitor.config.json` dono `public/` folder expect karte hain. Maine sab kuch sahi jagah `public/` ke andar move kar diya.
3. **`middleware/` folder poori tarah missing thi** — har route file (`auth.js`, `courses.js`, etc.) `../middleware/auth` require karti thi, lekin woh file zip mein thi hi nahi. Server start hi nahi hota tha (`Cannot find module`). Maine yeh file dobara bana di.
4. **Per-course QR images kabhi dikhti nahi thi** — `routes/courses.js` mein QR upload karne ka route tha, lekin `server.js` mein `/uploads/courses` ko static serve karne wala route hi missing tha. Add kar diya.
5. **Material/Video "View" links 401 error dete the** — jab link browser mein naye tab mein khulta hai (`<a href target="_blank">`), woh Authorization header nahi bhej sakta, sirf URL mein `?token=...` bhej sakta hai. Middleware sirf header check karta tha, query token nahi. Ab dono accept karta hai.

Maine poora flow **test kiya hai** (course create → material/video upload → view/stream → student payment → admin approve → unlock → restart-simulation persistence) — sab kaam kar raha hai.

## Render par Deploy Kaise Karein

1. **GitHub par push karein**: Is folder ko ek naye GitHub repository mein push karein (`git init`, `git add .`, `git commit`, phir GitHub par naya repo banake push karein).
2. **Render.com** par account banayein (GitHub se sign in kar sakte hain).
3. Dashboard mein **"New +" → "Web Service"** click karein, apna GitHub repo select karein.
4. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Starter ($7/month) — persistent disk ke liye zaroori hai (free tier disk support nahi karta)
5. **Persistent Disk add karein** (⚠️ ZAROORI hai, warna database/uploads/users/payments restart par DELETE ho jayenge):
   - Service ke andar left menu → **"Disks"** → **"Add Disk"**
   - Name: `nisha-storage` (kuch bhi rakh sakte hain)
   - Mount Path: `/var/data`
   - Size: 1 GB (baad mein badha sakte hain)
6. **Environment Variables** add karein ("Environment" tab mein):
   - `JWT_SECRET` = koi bhi lamba random string (security ke liye)
   - `STORAGE_ROOT` = `/var/data`  *(disk ke mount path jaisa hi, exact match zaroori hai)*
7. Deploy karein — kuch minutes lagenge.
8. Deploy hone ke baad aapko ek URL milega, jaisa: `https://study-with-sundaram-xxxx.onrender.com`

> **Yeh step miss mat karna** — `STORAGE_ROOT` set kiye bina, disk attach karne ke bawajood bhi data delete hota rahega, kyunki code by default project folder mein hi save karta hai jab tak yeh environment variable na diya jaye.

## Is URL ko yaad rakhein!

Yeh URL aapko **frontend** (Cloudflare Pages wala) mein `public/js/api.js` file ke andar daalna hoga (`Api.base` variable mein). Agar aap poora project (backend + frontend dono) sirf Render par hi rakhna chahte hain (Cloudflare use nahi karna), to kuch change karne ki zarurat nahi — yeh already backend + frontend dono serve karta hai.

## Demo Admin Login

```
Email: admin@studywithsundaram.com
Password: VinayNisha@2026
```

## Local Testing

```bash
npm install
npm start
```
Browser mein `http://localhost:3000` kholein.
