let currentUser = null;
let currentVideoId = null;
let progressSaveInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = requireAuth('user');
  if (!currentUser) return;
  document.getElementById('welcomePill').textContent = `Hi, ${currentUser.name}`;
  await loadCourses();

  document.getElementById('profileForm').addEventListener('submit', saveProfile);
  document.getElementById('passwordForm').addEventListener('submit', changePassword);
});

// ---------- Profile ----------
async function openProfileModal() {
  document.getElementById('profileModal').classList.add('show');
  try {
    const { user } = await Api.get('/profile');
    document.getElementById('profileName').value = user.name || '';
    document.getElementById('profileEmail').value = user.email || '';
    document.getElementById('profilePhone').value = user.phone || '';
    document.getElementById('profileClass').value = user.class_name || '';
    document.getElementById('profileAddress').value = user.address || '';
  } catch (err) {
    toast(err.message, 'error');
  }
}

function closeModalById(id) {
  document.getElementById(id).classList.remove('show');
  document.getElementById('profileAlert').className = 'alert';
}

async function saveProfile(e) {
  e.preventDefault();
  const btn = document.getElementById('profileSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    const body = {
      name: document.getElementById('profileName').value.trim(),
      phone: document.getElementById('profilePhone').value.trim(),
      class_name: document.getElementById('profileClass').value.trim(),
      address: document.getElementById('profileAddress').value.trim(),
    };
    const data = await Api.request('PUT', '/profile', body);
    // keep local session name in sync
    const user = Api.getUser();
    user.name = data.user.name;
    Api.setSession(Api.getToken(), user);
    document.getElementById('welcomePill').textContent = `Hi, ${user.name}`;
    toast('Profile update ho gayi!', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Details';
  }
}

async function changePassword(e) {
  e.preventDefault();
  const btn = document.getElementById('passwordSaveBtn');
  btn.disabled = true; btn.textContent = 'Changing...';
  try {
    const current_password = document.getElementById('currentPassword').value;
    const new_password = document.getElementById('newPassword').value;
    await Api.request('PUT', '/profile/password', { current_password, new_password });
    toast('Password change ho gaya!', 'success');
    document.getElementById('passwordForm').reset();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Change Password';
  }
}

const fileIcons = {
  '.pdf': 'PDF', '.doc': 'DOC', '.docx': 'DOC', '.ppt': 'PPT', '.pptx': 'PPT',
  '.jpg': 'IMG', '.jpeg': 'IMG', '.png': 'IMG', '.txt': 'TXT'
};

async function loadCourses() {
  const grid = document.getElementById('courseGrid');
  try {
    const { courses } = await Api.get('/courses');
    if (courses.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <div class="emoji">📭</div>
        <h3>Abhi koi course available nahi hai</h3>
        <p>Admin jaldi hi naye courses add karenge.</p>
      </div>`;
      return;
    }
    grid.innerHTML = courses.map(c => {
      const isPaid = c.price && c.price > 0;
      return `
      <div class="card" onclick="openCourse(${c.id}, '${escapeHtml(c.title)}')">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="icon-badge">📘</div>
          <span class="price-badge ${isPaid ? 'paid' : 'free'}">${isPaid ? '₹' + c.price : 'FREE'}</span>
        </div>
        <h3>${escapeHtml(c.title)}</h3>
        <p class="desc">${escapeHtml(c.description || 'Is course ke liye study material aur videos yahan milenge.')}</p>
        <div class="meta">🕒 Added ${timeAgo(c.created_at)}</div>
        <button class="btn btn-navy btn-sm btn-block">Open Course</button>
      </div>
    `;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Course load nahi ho paaye: ${escapeHtml(err.message)}</div>`;
  }
}

let currentOpenCourse = null;

async function openCourse(id, title) {
  document.getElementById('courseListView').style.display = 'none';
  document.getElementById('courseDetailView').style.display = 'block';
  document.getElementById('detailCourseTitle').textContent = title;
  document.getElementById('lockedSection').style.display = 'none';
  document.getElementById('unlockedSections').style.display = 'none';

  try {
    const data = await Api.get(`/courses/${id}/details`);
    currentOpenCourse = data.course;
    document.getElementById('detailCourseDesc').textContent = data.course.description || '';

    if (data.locked) {
      renderLockedState(data);
    } else {
      document.getElementById('unlockedSections').style.display = 'block';
      renderMaterials(data.materials);
      renderVideos(data.videos);
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderLockedState(data) {
  const section = document.getElementById('lockedSection');
  section.style.display = 'block';
  section.innerHTML = `
    <div class="empty-state" style="border-color: var(--gold);">
      <div class="emoji">🔒</div>
      <h3>Yeh ek Paid Course hai — ₹${currentOpenCourse.price}</h3>
      <p>Is course mein ${data.materialCount} study material aur ${data.videoCount} video lecture hain. Unlock karne ke liye payment karein.</p>
      <button class="btn btn-primary" style="margin-top:14px;" onclick="openBuyModal()">Buy Now — ₹${currentOpenCourse.price}</button>
      <div id="pendingPaymentNote" style="margin-top:14px;"></div>
    </div>
  `;
  checkPaymentStatus();
}

async function checkPaymentStatus() {
  try {
    const data = await Api.get(`/payments/mine/${currentOpenCourse.id}`);
    const note = document.getElementById('pendingPaymentNote');
    if (!note) return;
    if (data.latestPayment && data.latestPayment.status === 'pending') {
      note.innerHTML = `<div class="alert show alert-success" style="display:block;">⏳ Aapka payment (UTR: ${escapeHtml(data.latestPayment.utr)}) admin ke review mein hai. Approve hote hi course unlock ho jayega.</div>`;
    } else if (data.latestPayment && data.latestPayment.status === 'rejected') {
      note.innerHTML = `<div class="alert show alert-error" style="display:block;">❌ Aapka pichla payment reject ho gaya${data.latestPayment.admin_note ? ': ' + escapeHtml(data.latestPayment.admin_note) : ''}. Dobara try karein.</div>`;
    }
  } catch (e) { /* ignore */ }
}

async function openBuyModal() {
  const modal = document.getElementById('buyModal');
  document.getElementById('buyModalTitle').textContent = `Buy: ${currentOpenCourse.title}`;
  document.getElementById('buyModalAmount').textContent = `₹${currentOpenCourse.price}`;
  document.getElementById('buyModalQrImg').src = '';
  document.getElementById('buyModalUpi').textContent = '';
  document.getElementById('utrInput').value = '';
  modal.classList.add('show');

  try {
    const settings = await Api.get('/settings/payment');
    if (settings.qr_image) {
      document.getElementById('buyModalQrImg').src = Api.origin + settings.qr_image;
      document.getElementById('buyModalQrImg').style.display = 'block';
    } else {
      document.getElementById('buyModalQrImg').style.display = 'none';
    }
    document.getElementById('buyModalUpi').textContent = settings.upi_id ? `UPI ID: ${settings.upi_id}` : 'Admin ne abhi UPI details set nahi ki.';
  } catch (err) {
    toast(err.message, 'error');
  }
}

function closeBuyModal() {
  document.getElementById('buyModal').classList.remove('show');
}

async function submitPayment(e) {
  e.preventDefault();
  const utr = document.getElementById('utrInput').value.trim();
  if (!utr) return toast('UTR / Transaction ID daalein.', 'error');

  const btn = document.getElementById('submitPaymentBtn');
  btn.disabled = true; btn.textContent = 'Submitting...';
  try {
    await Api.post('/payments', { course_id: currentOpenCourse.id, utr });
    toast('Payment submit ho gaya! Admin verify karega.', 'success');
    closeBuyModal();
    openCourse(currentOpenCourse.id, currentOpenCourse.title);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Submit Payment';
  }
}

function backToCourses() {
  document.getElementById('courseDetailView').style.display = 'none';
  document.getElementById('courseListView').style.display = 'block';
}

function renderMaterials(materials) {
  document.getElementById('materialCount').textContent = `${materials.length} item(s)`;
  const list = document.getElementById('materialList');
  if (materials.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">📄</div>Abhi is course mein koi study material upload nahi hua.</div>`;
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
        <a href="${Api.origin}/api/materials/file/${m.id}?token=${encodeURIComponent(Api.getToken())}" target="_blank" class="btn btn-primary btn-sm">View / Download</a>
      </div>
    </div>
  `).join('');
}

function renderVideos(videos) {
  document.getElementById('videoCount').textContent = `${videos.length} video(s)`;
  const list = document.getElementById('videoList');
  if (videos.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="emoji">🎬</div>Abhi is course mein koi video lecture upload nahi hui.</div>`;
    return;
  }
  list.innerHTML = videos.map(v => {
    const pct = Math.round(v.progress.watched_percent || 0);
    return `
    <div class="list-item">
      <div class="left">
        <div class="file-icon">▶</div>
        <div class="info">
          <div class="title">${escapeHtml(v.title)}</div>
          <div class="sub">Uploaded ${timeAgo(v.created_at)} ${pct > 0 ? `&middot; ${pct}% watched` : ''}</div>
          ${pct > 0 ? `<div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>` : ''}
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-navy btn-sm" onclick='playVideo(${v.id}, ${JSON.stringify(v.title)}, ${JSON.stringify(v.file_path)}, ${v.progress.last_position || 0})'>
          ${pct > 0 ? 'Resume' : 'Play'}
        </button>
      </div>
    </div>
  `;
  }).join('');
}

function playVideo(id, title, filePath, lastPosition) {
  currentVideoId = id;
  const modal = document.getElementById('videoModal');
  const player = document.getElementById('videoPlayer');
  document.getElementById('videoModalTitle').textContent = title;

  const token = Api.getToken();
  player.src = `${Api.origin}${filePath.replace('/uploads/videos/', '/api/videos/stream/')}?token=${encodeURIComponent(token)}`;
  modal.classList.add('show');

  player.onloadedmetadata = () => {
    if (lastPosition > 2 && lastPosition < player.duration - 3) {
      player.currentTime = lastPosition;
    }
  };

  // Save watch session/progress every 5 seconds while playing
  clearInterval(progressSaveInterval);
  progressSaveInterval = setInterval(() => saveVideoProgress(player), 5000);
  player.onpause = () => saveVideoProgress(player);
  player.onended = () => saveVideoProgress(player, true);
}

async function saveVideoProgress(player, ended = false) {
  if (!currentVideoId || !player.duration) return;
  const percent = ended ? 100 : Math.min(100, (player.currentTime / player.duration) * 100);
  try {
    await Api.post(`/videos/${currentVideoId}/session`, {
      last_position: ended ? 0 : player.currentTime,
      watched_percent: percent,
    });
  } catch (e) { /* silent fail, non-critical */ }
}

function closeVideoModal() {
  const player = document.getElementById('videoPlayer');
  saveVideoProgress(player);
  player.pause();
  player.src = '';
  clearInterval(progressSaveInterval);
  document.getElementById('videoModal').classList.remove('show');
  // refresh progress bar on list
  const courseTitle = document.getElementById('detailCourseTitle').textContent;
}
