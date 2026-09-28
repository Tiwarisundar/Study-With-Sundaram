let currentUser = null;
let currentCourseId = null;
let allCourses = [];

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = requireAuth('admin');
  if (!currentUser) return;
  document.getElementById('welcomePill').textContent = `Hi, ${currentUser.name}`;
  await loadStats();
  await loadCourses();
  await loadUsers();

  document.getElementById('courseForm').addEventListener('submit', createCourse);
  document.getElementById('materialForm').addEventListener('submit', uploadMaterial);
  document.getElementById('videoForm').addEventListener('submit', uploadVideo);
  document.getElementById('editPriceForm').addEventListener('submit', savePrice);
  document.getElementById('settingsForm').addEventListener('submit', savePaymentSettings);
  document.getElementById('editUserForm').addEventListener('submit', saveUserEdit);
  document.getElementById('resetPasswordForm').addEventListener('submit', resetUserPassword);

  await loadPendingCount();
});

// ---------- Stats ----------
async function loadStats() {
  try {
    const s = await Api.get('/users/stats');
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card"><div class="num">${s.totalUsers}</div><div class="label">Students</div></div>
      <div class="stat-card"><div class="num">${s.totalCourses}</div><div class="label">Courses</div></div>
      <div class="stat-card"><div class="num">${s.totalMaterials}</div><div class="label">Study Materials</div></div>
      <div class="stat-card"><div class="num">${s.totalVideos}</div><div class="label">Video Lectures</div></div>
    `;
  } catch (err) { console.error(err); }
}

// ---------- Tabs ----------
function switchAdminTab(tab) {
  document.getElementById('tabBtnCourses').classList.toggle('active', tab === 'courses');
  document.getElementById('tabBtnUsers').classList.toggle('active', tab === 'users');
  document.getElementById('tabBtnPayments').classList.toggle('active', tab === 'payments');
  document.getElementById('tabBtnSettings').classList.toggle('active', tab === 'settings');

  document.getElementById('adminCoursesTab').style.display = tab === 'courses' ? 'block' : 'none';
  document.getElementById('adminUsersTab').style.display = tab === 'users' ? 'block' : 'none';
  document.getElementById('adminPaymentsTab').style.display = tab === 'payments' ? 'block' : 'none';
  document.getElementById('adminSettingsTab').style.display = tab === 'settings' ? 'block' : 'none';

  if (tab === 'payments') filterPayments('pending');
  if (tab === 'settings') loadPaymentSettings();
}

// ---------- Payments ----------
let currentPaymentFilter = 'pending';

async function loadPendingCount() {
  try {
    const { payments } = await Api.get('/payments?status=pending');
    const badge = document.getElementById('pendingBadge');
    if (payments.length > 0) {
      badge.textContent = payments.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch (err) { /* silent */ }
}

async function filterPayments(status) {
  currentPaymentFilter = status;
  document.getElementById('filterPending').classList.toggle('active', status === 'pending');
  document.getElementById('filterApproved').classList.toggle('active', status === 'approved');
  document.getElementById('filterRejected').classList.toggle('active', status === 'rejected');
  document.getElementById('filterAll').classList.toggle('active', status === '');

  const list = document.getElementById('paymentsList');
  list.innerHTML = `<div class="loader"><div class="spinner"></div> Loading...</div>`;
  try {
    const query = status ? `?status=${status}` : '';
    const { payments } = await Api.get(`/payments${query}`);
    if (payments.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="emoji">💸</div>Is category mein koi payment nahi mila.</div>`;
      return;
    }
    list.innerHTML = payments.map(p => `
      <div class="list-item">
        <div class="left">
          <div class="file-icon">₹</div>
          <div class="info">
            <div class="title">${escapeHtml(p.user_name)} &middot; ${escapeHtml(p.course_title)}</div>
            <div class="sub">₹${p.amount} &middot; UTR: ${escapeHtml(p.utr)} &middot; ${escapeHtml(p.user_email)} &middot; ${timeAgo(p.created_at)}</div>
            ${p.admin_note ? `<div class="sub" style="color:var(--danger);">Note: ${escapeHtml(p.admin_note)}</div>` : ''}
          </div>
        </div>
        <div class="actions">
          <span class="badge badge-${p.status === 'approved' ? 'user' : p.status === 'rejected' ? 'admin' : 'user'}" style="text-transform:capitalize;">${p.status}</span>
          ${p.status === 'pending' ? `
            <button class="btn btn-primary btn-sm" onclick="approvePayment(${p.id})">✅ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="rejectPayment(${p.id})">❌ Reject</button>
          ` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function approvePayment(id) {
  if (!confirm('Payment approve karein? Student ka course turant unlock ho jayega.')) return;
  try {
    await Api.post(`/payments/${id}/approve`);
    toast('Payment approve ho gaya! Course unlock ho gaya.', 'success');
    filterPayments(currentPaymentFilter);
    loadPendingCount();
  } catch (err) { toast(err.message, 'error'); }
}

async function rejectPayment(id) {
  const note = prompt('Reject karne ki wajah (optional):') || '';
  try {
    await Api.post(`/payments/${id}/reject`, { admin_note: note });
    toast('Payment reject ho gaya.', 'success');
    filterPayments(currentPaymentFilter);
    loadPendingCount();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Payment Settings (Merchant QR / UPI ID) ----------
async function loadPaymentSettings() {
  try {
    const s = await Api.get('/settings/payment');
    document.getElementById('upiIdInput').value = s.upi_id || '';
    const preview = document.getElementById('currentQrPreview');
    preview.innerHTML = s.qr_image
      ? `<img src="${Api.origin}${s.qr_image}" style="max-width:200px; border-radius:10px; border:1px solid var(--border);" alt="Current QR" />`
      : `<p style="color:var(--muted); font-size:13px;">Abhi tak koi QR upload nahi hua.</p>`;
  } catch (err) { toast(err.message, 'error'); }
}

async function savePaymentSettings(e) {
  e.preventDefault();
  const upiId = document.getElementById('upiIdInput').value.trim();
  const fileInput = document.getElementById('qrFileInput');

  const formData = new FormData();
  formData.append('upi_id', upiId);
  if (fileInput.files[0]) formData.append('qr', fileInput.files[0]);

  const btn = document.getElementById('settingsSubmitBtn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await Api.postForm('/settings/payment', formData);
    toast('Payment settings save ho gayi!', 'success');
    fileInput.value = '';
    loadPaymentSettings();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Settings';
  }
}

// ---------- Edit Price ----------
function openEditPrice() {
  const course = allCourses.find(c => c.id === currentCourseId);
  document.getElementById('editPriceInput').value = course ? course.price : 0;
  openModal('editPriceModal');
}

async function savePrice(e) {
  e.preventDefault();
  const price = document.getElementById('editPriceInput').value;
  try {
    await Api.request('PUT', `/courses/${currentCourseId}`, { price });
    toast('Price update ho gaya!', 'success');
    closeModal('editPriceModal');
    await loadCourses();
    openCourse(currentCourseId);
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Users ----------
async function loadUsers() {
  try {
    const { users } = await Api.get('/users');
    document.getElementById('usersTableBody').innerHTML = users.map(u => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge badge-${u.role}">${u.role}</span></td>
        <td>${escapeHtml(u.phone || '—')}</td>
        <td>${escapeHtml(u.class_name || '—')}</td>
        <td>${timeAgo(u.created_at)}</td>
        <td><button class="btn btn-outline btn-sm" onclick='openEditUser(${JSON.stringify(u)})'>✏️ Edit</button></td>
      </tr>
    `).join('');
  } catch (err) { toast(err.message, 'error'); }
}

function openEditUser(u) {
  document.getElementById('editUserId').value = u.id;
  document.getElementById('editUserName').value = u.name || '';
  document.getElementById('editUserEmail').value = u.email || '';
  document.getElementById('editUserRole').value = u.role || 'user';
  document.getElementById('editUserPhone').value = u.phone || '';
  document.getElementById('editUserClass').value = u.class_name || '';
  document.getElementById('editUserAddress').value = u.address || '';
  document.getElementById('resetPasswordForm').reset();
  openModal('editUserModal');
}

async function saveUserEdit(e) {
  e.preventDefault();
  const id = document.getElementById('editUserId').value;
  const body = {
    name: document.getElementById('editUserName').value.trim(),
    email: document.getElementById('editUserEmail').value.trim(),
    role: document.getElementById('editUserRole').value,
    phone: document.getElementById('editUserPhone').value.trim(),
    class_name: document.getElementById('editUserClass').value.trim(),
    address: document.getElementById('editUserAddress').value.trim(),
  };
  try {
    await Api.request('PUT', `/users/${id}`, body);
    toast('User details update ho gaye!', 'success');
    closeModal('editUserModal');
    loadUsers();
  } catch (err) { toast(err.message, 'error'); }
}

async function resetUserPassword(e) {
  e.preventDefault();
  const id = document.getElementById('editUserId').value;
  const new_password = document.getElementById('resetPasswordInput').value;
  try {
    await Api.request('PUT', `/users/${id}/reset-password`, { new_password });
    toast('Password reset ho gaya!', 'success');
    document.getElementById('resetPasswordForm').reset();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Courses ----------
async function loadCourses() {
  const grid = document.getElementById('courseGrid');
  try {
    const { courses } = await Api.get('/courses');
    allCourses = courses;
    if (courses.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <div class="emoji">📭</div><h3>Koi course nahi bana</h3>
        <p>"+ Naya Course" button se pehla course banayein.</p>
      </div>`;
      return;
    }
    grid.innerHTML = courses.map(c => `
      <div class="card" onclick="openCourse(${c.id})">
        <div class="icon-badge">📘</div>
        <h3>${escapeHtml(c.title)}</h3>
        <p class="desc">${escapeHtml(c.description || 'No description')}</p>
        <div class="meta">🕒 ${timeAgo(c.created_at)} &middot; <span style="font-weight:700; color:${c.price > 0 ? 'var(--gold-dark)' : 'var(--success)'};">${c.price > 0 ? '₹' + c.price : 'FREE'}</span></div>
        <button class="btn btn-navy btn-sm btn-block">Manage</button>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">${escapeHtml(err.message)}</div>`;
  }
}

async function createCourse(e) {
  e.preventDefault();
  const title = document.getElementById('courseTitle').value.trim();
  const description = document.getElementById('courseDesc').value.trim();
  const price = document.getElementById('coursePrice').value || 0;
  try {
    await Api.post('/courses', { title, description, price });
    toast('Course create ho gaya!', 'success');
    closeModal('courseModal');
    document.getElementById('courseForm').reset();
    await loadCourses();
    await loadStats();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openCourse(id) {
  currentCourseId = id;
  document.getElementById('adminCoursesTab').style.display = 'none';
  document.querySelector('.admin-tabs').style.display = 'none';
  document.getElementById('adminUsersTab').style.display = 'none';
  document.getElementById('courseDetailView').style.display = 'block';

  try {
    const { course, materials, videos } = await Api.get(`/courses/${id}/details`);
    document.getElementById('detailCourseTitle').textContent = course.title;
    document.getElementById('detailCourseDesc').textContent = course.description || '';
    const priceEl = document.getElementById('detailCoursePrice');
    priceEl.textContent = course.price > 0 ? `₹${course.price} — Paid Course` : 'FREE Course';
    renderMaterials(materials);
    renderVideos(videos);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function backToCourses() {
  document.getElementById('courseDetailView').style.display = 'none';
  document.getElementById('adminCoursesTab').style.display = 'block';
  document.querySelector('.admin-tabs').style.display = 'flex';
}

async function deleteCourse() {
  if (!confirm('Kya aap sach mein yeh course delete karna chahte hain? Iske saare materials aur videos bhi delete ho jayenge.')) return;
  try {
    await Api.del(`/courses/${currentCourseId}`);
    toast('Course delete ho gaya.', 'success');
    backToCourses();
    await loadCourses();
    await loadStats();
  } catch (err) {
    toast(err.message, 'error');
  }
}

const fileIcons = {
  '.pdf': 'PDF', '.doc': 'DOC', '.docx': 'DOC', '.ppt': 'PPT', '.pptx': 'PPT',
  '.jpg': 'IMG', '.jpeg': 'IMG', '.png': 'IMG', '.txt': 'TXT'
};

function renderMaterials(materials) {
  const list = document.getElementById('materialList');
  if (materials.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">📄</div>Abhi koi material upload nahi hua.</div>`;
    return;
  }
  list.innerHTML = materials.map(m => `
    <div class="list-item">
      <div class="left">
        <div class="file-icon">${fileIcons[m.file_type] || 'FILE'}</div>
        <div class="info">
          <div class="title">${escapeHtml(m.title)}</div>
          <div class="sub">Uploaded ${timeAgo(m.created_at)}</div>
        </div>
      </div>
      <div class="actions">
        <a href="${Api.origin}/api/materials/file/${m.id}?token=${encodeURIComponent(Api.getToken())}" target="_blank" class="btn btn-outline btn-sm">View</a>
        <button class="btn btn-danger btn-sm" onclick="deleteMaterial(${m.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderVideos(videos) {
  const list = document.getElementById('videoList');
  if (videos.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">🎬</div>Abhi koi video upload nahi hui.</div>`;
    return;
  }
  list.innerHTML = videos.map(v => `
    <div class="list-item">
      <div class="left">
        <div class="file-icon">▶</div>
        <div class="info">
          <div class="title">${escapeHtml(v.title)}</div>
          <div class="sub">Uploaded ${timeAgo(v.created_at)}</div>
        </div>
      </div>
      <div class="actions">
        <a href="${Api.origin}/api/videos/stream/${v.file_path.split('/').pop()}?token=${encodeURIComponent(Api.getToken())}" target="_blank" class="btn btn-outline btn-sm">Preview</a>
        <button class="btn btn-danger btn-sm" onclick="deleteVideo(${v.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

async function deleteMaterial(id) {
  if (!confirm('Yeh material delete karna hai?')) return;
  try {
    await Api.del(`/materials/${id}`);
    toast('Material delete ho gaya.', 'success');
    openCourse(currentCourseId);
    loadStats();
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteVideo(id) {
  if (!confirm('Yeh video delete karna hai?')) return;
  try {
    await Api.del(`/videos/${id}`);
    toast('Video delete ho gaya.', 'success');
    openCourse(currentCourseId);
    loadStats();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Upload Material ----------
async function uploadMaterial(e) {
  e.preventDefault();
  const title = document.getElementById('materialTitle').value.trim();
  const fileInput = document.getElementById('materialFile');
  if (!fileInput.files[0]) return toast('File select karein.', 'error');

  const formData = new FormData();
  formData.append('course_id', currentCourseId);
  formData.append('title', title);
  formData.append('file', fileInput.files[0]);

  const btn = document.getElementById('materialSubmitBtn');
  btn.disabled = true; btn.textContent = 'Uploading...';
  try {
    await Api.postForm('/materials', formData);
    toast('Study material upload ho gaya!', 'success');
    closeModal('materialModal');
    document.getElementById('materialForm').reset();
    openCourse(currentCourseId);
    loadStats();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Upload';
  }
}

// ---------- Upload Video (with progress bar using XHR) ----------
function uploadVideo(e) {
  e.preventDefault();
  const title = document.getElementById('videoTitle').value.trim();
  const fileInput = document.getElementById('videoFile');
  if (!fileInput.files[0]) return toast('Video file select karein.', 'error');

  const formData = new FormData();
  formData.append('course_id', currentCourseId);
  formData.append('title', title);
  formData.append('video', fileInput.files[0]);

  const btn = document.getElementById('videoSubmitBtn');
  const progressWrap = document.getElementById('uploadProgressWrap');
  const progressFill = document.getElementById('uploadProgressFill');
  const progressText = document.getElementById('uploadProgressText');

  btn.disabled = true; btn.textContent = 'Uploading...';
  progressWrap.style.display = 'block';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/videos', true);
  xhr.setRequestHeader('Authorization', `Bearer ${Api.getToken()}`);

  xhr.upload.onprogress = (evt) => {
    if (evt.lengthComputable) {
      const pct = Math.round((evt.loaded / evt.total) * 100);
      progressFill.style.width = pct + '%';
      progressText.textContent = `Uploading... ${pct}%`;
    }
  };

  xhr.onload = () => {
    btn.disabled = false; btn.textContent = 'Upload Video';
    progressWrap.style.display = 'none';
    progressFill.style.width = '0%';
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status >= 200 && xhr.status < 300) {
      toast(data.message || 'Video upload ho gaya!', 'success');
      closeModal('videoModal');
      document.getElementById('videoForm').reset();
      openCourse(currentCourseId);
      loadStats();
    } else {
      toast(data.error || 'Video upload fail hua.', 'error');
    }
  };

  xhr.onerror = () => {
    btn.disabled = false; btn.textContent = 'Upload Video';
    progressWrap.style.display = 'none';
    toast('Network error — upload fail hua.', 'error');
  };

  xhr.send(formData);
}

// ---------- Modal helpers ----------
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
