// ---------- Shared API helper for Study With Sundaram ----------

// 👇 IMPORTANT: Render pe deploy karne ke baad, apna backend ka URL yahan daalo
// Example: 'https://study-with-sundaram.onrender.com/api'
const Api = {
  base: 'https://study-with-sundaram-in.onrender.com/api',

  getToken() {
    return localStorage.getItem('nsp_token');
  },
  setSession(token, user) {
    localStorage.setItem('nsp_token', token);
    localStorage.setItem('nsp_user', JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem('nsp_token');
    localStorage.removeItem('nsp_user');
  },
  getUser() {
    const raw = localStorage.getItem('nsp_user');
    return raw ? JSON.parse(raw) : null;
  },

  async request(method, path, body, isForm = false) {
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isForm) headers['Content-Type'] = 'application/json';

    const res = await fetch(this.base + path, {
      method,
      headers,
      body: isForm ? body : (body ? JSON.stringify(body) : undefined),
    });

    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }

    if (res.status === 401) {
      // session invalid -> force re-login
      this.clearSession();
      if (!location.pathname.includes('index.html') && location.pathname !== '/') {
        toast(data.error || 'Session expired. Please login again.', 'error');
        setTimeout(() => (location.href = '/index.html'), 1200);
      }
    }

    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  postForm(path, formData) { return this.request('POST', path, formData, true); },
  del(path) { return this.request('DELETE', path); },
};

// Backend ka "root" URL (bina /api suffix ke) — file/QR image URLs banane ke liye zaroori
// hai, kyunki frontend (Cloudflare) aur backend (Render) alag domains par hain, isliye
// relative paths ("/uploads/...") kaam nahi karenge — poora backend URL prefix karna padega.
Api.origin = Api.base.replace(/\/api\/?$/, '');

// ---------- Toast notifications ----------
function toast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ---------- Route guard ----------
function requireAuth(role) {
  const user = Api.getUser();
  const token = Api.getToken();
  if (!token || !user) {
    location.href = '/index.html';
    return null;
  }
  if (role && user.role !== role) {
    location.href = user.role === 'admin' ? '/admin.html' : '/user.html';
    return null;
  }
  return user;
}

function logout() {
  Api.post('/auth/logout').catch(() => {}).finally(() => {
    Api.clearSession();
    location.href = '/index.html';
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function timeAgo(dateStr) {
  const date = new Date(dateStr + 'Z');
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'abhi abhi';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min pehle`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ghante pehle`;
  const days = Math.floor(hrs / 24);
  return `${days} din pehle`;
}
