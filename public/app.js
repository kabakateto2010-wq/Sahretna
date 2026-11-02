// ==============================================================
// 🍿 Hyperbeam Cinema - Client App (Virtual Browser + Sync)
// ==============================================================

const socket = io();

// التحقق مما إذا كان التطبيق يعمل داخل Electron
const isElectron = typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0;

let currentRoomId = '';
let currentUsername = '';
let isHost = false;
let hostOnlyControl = false;
let isSyncing = false;
let currentActiveMode = 'browser'; // 'browser' أو 'player'

// عناصر واجهة المستخدم
const welcomeModal = document.getElementById('welcomeModal');
const usernameInput = document.getElementById('usernameInput');
const customRoomInput = document.getElementById('customRoomInput');
const roomCodeBadge = document.getElementById('roomCodeBadge');
const hostControlBtn = document.getElementById('hostControlBtn');
const syncToast = document.getElementById('syncToast');

const browserView = document.getElementById('browserView');
const playerView = document.getElementById('playerView');
const btnModeBrowser = document.getElementById('btnModeBrowser');
const btnModePlayer = document.getElementById('btnModePlayer');

const browserUrlInput = document.getElementById('browserUrlInput');
const browserContainer = document.getElementById('browserContainer');
let browserFrame = document.getElementById('browserFrame');

const cinemaPlayer = document.getElementById('cinemaPlayer');
const videoUrlInput = document.getElementById('videoUrlInput');
const localFileInput = document.getElementById('localFileInput');
const subtitleFileInput = document.getElementById('subtitleFileInput');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const usersList = document.getElementById('usersList');
const usersCountBadge = document.getElementById('usersCountBadge');
const reactionsBox = document.getElementById('reactionsBox');

// إذا كنا في إلكترون نقوم بتجهيز عنصر <webview> الأصلي المفتوح بدون قيود
let webviewEl = null;
if (isElectron) {
  browserContainer.innerHTML = '';
  webviewEl = document.createElement('webview');
  webviewEl.id = 'browserWebview';
  webviewEl.setAttribute('allowpopups', 'true');
  webviewEl.setAttribute('webpreferences', 'allowRunningInsecureContent, javascript=yes');
  webviewEl.style.width = '100%';
  webviewEl.style.height = '100%';
  webviewEl.style.border = 'none';
  webviewEl.src = 'https://www.google.com';
  browserContainer.appendChild(webviewEl);

  webviewEl.addEventListener('did-navigate', (e) => {
    browserUrlInput.value = e.url;
    if (isHost && !isSyncing) {
      socket.emit('browser-navigate', { roomId: currentRoomId, url: e.url });
    }
  });

  webviewEl.addEventListener('did-navigate-in-page', (e) => {
    browserUrlInput.value = e.url;
    if (isHost && !isSyncing) {
      socket.emit('browser-navigate', { roomId: currentRoomId, url: e.url });
    }
  });
}

// 1. الدخول للقاعة
const urlParams = new URLSearchParams(window.location.search);
const initialRoomFromUrl = urlParams.get('room');
if (initialRoomFromUrl) {
  customRoomInput.value = initialRoomFromUrl;
}

function enterCinema(isNewRoom = false) {
  let name = usernameInput.value.trim();
  if (!name) name = 'صديق_' + Math.floor(Math.random() * 900 + 100);

  let room = customRoomInput.value.trim();
  if (isNewRoom || !room) {
    room = 'sahra-' + Math.floor(Math.random() * 9000 + 1000);
  }

  currentUsername = name;
  currentRoomId = room;

  const newUrl = `${window.location.pathname}?room=${currentRoomId}`;
  window.history.pushState({ path: newUrl }, '', newUrl);

  welcomeModal.style.display = 'none';
  roomCodeBadge.innerHTML = `<span>🍿</span><span>قاعة: ${currentRoomId}</span><small style="opacity:0.7">(نسخ الرابط)</small>`;

  socket.emit('join-room', {
    roomId: currentRoomId,
    username: currentUsername,
    avatar: '🍿'
  });
}

function copyInviteLink() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    showToast('📋 تم نسخ رابط السهرة!');
  });
}

function showToast(text, duration = 3000) {
  syncToast.innerHTML = text;
  syncToast.classList.add('show');
  setTimeout(() => { syncToast.classList.remove('show'); }, duration);
}

// ==============================================================
// 2. التحكم في المتصفح المفتوح (Virtual Browser Navigation)
// ==============================================================

function applyBrowserUrl() {
  let url = browserUrlInput.value.trim();
  if (!url) return;

  // إذا لم يكتب المستخدم بروتوكول http/https، نتحقق إذا كان دومين أو بحث جوجل
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.includes('.') && !url.includes(' ')) {
      url = 'https://' + url;
    } else {
      url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
    }
  }

  browserUrlInput.value = url;
  browserNavigateTo(url);

  // إرسال الرابط لكل الأصدقاء في القاعة لمزامنته
  socket.emit('browser-navigate', {
    roomId: currentRoomId,
    url: url
  });
}

function browserNavigateTo(url) {
  browserUrlInput.value = url;
  isSyncing = true;

  if (isElectron && webviewEl) {
    webviewEl.loadURL(url);
  } else {
    // في المتصفح العادي نستخدم البروكسي الذكي لفك حظر التضمين
    browserFrame.src = `/api/proxy?url=${encodeURIComponent(url)}`;
  }

  setTimeout(() => { isSyncing = false; }, 600);
}

function browserGoBack() {
  if (isElectron && webviewEl) {
    if (webviewEl.canGoBack()) webviewEl.goBack();
  } else {
    try { browserFrame.contentWindow.history.back(); } catch (e) {}
  }
}

function browserGoForward() {
  if (isElectron && webviewEl) {
    if (webviewEl.canGoForward()) webviewEl.goForward();
  } else {
    try { browserFrame.contentWindow.history.forward(); } catch (e) {}
  }
}

function browserReload() {
  if (isElectron && webviewEl) {
    webviewEl.reload();
  } else {
    browserFrame.src = browserFrame.src;
  }
  showToast('🔄 تم تحديث الصفحة');
}

// تبديل أوضاع العرض (متصفح مفتوح / مشغل فيديو)
function switchMainMode(mode) {
  currentActiveMode = mode;
  if (mode === 'browser') {
    browserView.style.display = 'flex';
    playerView.style.display = 'none';
    btnModeBrowser.classList.add('active');
    btnModePlayer.classList.remove('active');
  } else {
    browserView.style.display = 'none';
    playerView.style.display = 'flex';
    btnModeBrowser.classList.remove('active');
    btnModePlayer.classList.add('active');
  }
  socket.emit('switch-mode', { roomId: currentRoomId, mode });
}

// ==============================================================
// 3. أحداث مشغل الفيديو المباشر
// ==============================================================

cinemaPlayer.addEventListener('play', () => {
  if (isSyncing) return;
  socket.emit('video-action', { roomId: currentRoomId, action: 'play', time: cinemaPlayer.currentTime });
});

cinemaPlayer.addEventListener('pause', () => {
  if (isSyncing) return;
  socket.emit('video-action', { roomId: currentRoomId, action: 'pause', time: cinemaPlayer.currentTime });
});

cinemaPlayer.addEventListener('seeked', () => {
  if (isSyncing) return;
  socket.emit('video-action', { roomId: currentRoomId, action: 'seek', time: cinemaPlayer.currentTime });
});

function applyVideoUrl() {
  const url = videoUrlInput.value.trim();
  if (!url) return;
  isSyncing = true;
  cinemaPlayer.src = url;
  cinemaPlayer.play().catch(() => {});
  socket.emit('video-action', { roomId: currentRoomId, action: 'play', sourceType: 'url', url: url, time: 0 });
  setTimeout(() => { isSyncing = false; }, 400);
}

function handleLocalFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const fileUrl = URL.createObjectURL(file);
  isSyncing = true;
  cinemaPlayer.src = fileUrl;
  cinemaPlayer.play().catch(() => {});
  socket.emit('video-action', { roomId: currentRoomId, action: 'play', sourceType: 'local', fileName: file.name, time: 0 });
  setTimeout(() => { isSyncing = false; }, 400);
  showToast(`📁 تم تشغيل الملف المحلي: ${file.name}`);
}

async function startScreenShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    switchMainMode('player');
    cinemaPlayer.srcObject = stream;
    cinemaPlayer.play();
    showToast('🖥️ تم بدء مشاركة الشاشة بصوت النظام!');
    stream.getVideoTracks()[0].onended = () => {
      cinemaPlayer.srcObject = null;
      showToast('🛑 تم إنهاء مشاركة الشاشة');
    };
  } catch (err) {
    showToast('❌ تم إلغاء مشاركة الشاشة');
  }
}

function handleSubtitleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    let content = evt.target.result;
    if (file.name.endsWith('.srt')) {
      content = 'WEBVTT\n\n' + content.replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
    }
    const trackBlob = new Blob([content], { type: 'text/vtt' });
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = file.name;
    track.srclang = 'ar';
    track.src = URL.createObjectURL(trackBlob);
    track.default = true;
    cinemaPlayer.querySelectorAll('track').forEach(t => t.remove());
    cinemaPlayer.appendChild(track);
    showToast(`💬 تم تفعيل الترجمة: ${file.name}`);
  };
  reader.readAsText(file);
}

function toggleHostLock() {
  if (!isHost) {
    showToast('⚠️ المضيف فقط هو من يستطيع تغيير إعدادات التحكم.');
    return;
  }
  socket.emit('toggle-host-control', { roomId: currentRoomId });
}

function updateHostControlsUI() {
  if (hostOnlyControl) {
    hostControlBtn.classList.add('locked');
    hostControlBtn.innerHTML = `🔒 التحكم: للمضيف فقط`;
  } else {
    hostControlBtn.classList.remove('locked');
    hostControlBtn.innerHTML = `🔓 التحكم: للجميع`;
  }
}

// ==============================================================
// 4. استقبال أحداث السيرفر (Socket Listeners)
// ==============================================================

socket.on('sync-state', (state) => {
  isHost = state.isHost;
  hostOnlyControl = state.hostOnlyControl;
  updateHostControlsUI();

  // ضبط الوضع والرابط الأولي
  if (state.activeMode) {
    switchMainMode(state.activeMode);
  }
  if (state.browserUrl) {
    browserNavigateTo(state.browserUrl);
  }

  const v = state.videoState;
  if (v && v.url && v.sourceType === 'url') {
    isSyncing = true;
    cinemaPlayer.src = v.url;
    videoUrlInput.value = v.url;
    if (Math.abs(cinemaPlayer.currentTime - v.currentTime) > 0.5) {
      cinemaPlayer.currentTime = v.currentTime;
    }
    if (v.isPlaying) cinemaPlayer.play().catch(() => {});
    setTimeout(() => { isSyncing = false; }, 400);
  }

  chatMessages.innerHTML = '';
  if (state.chatHistory) state.chatHistory.forEach(appendMessage);
});

// مزامنة انتقال المتصفح لجميع المتصلين
socket.on('sync-browser-navigate', ({ url, by }) => {
  showToast(`🌐 ${by} انتقل إلى: ${url}`);
  browserNavigateTo(url);
});

socket.on('sync-mode-switch', ({ mode }) => {
  switchMainMode(mode);
});

socket.on('sync-action', (data) => {
  isSyncing = true;
  const { action, time, url, sourceType, fileName, by } = data;
  if (url && sourceType === 'url' && cinemaPlayer.src !== url) cinemaPlayer.src = url;
  if (time !== undefined && Math.abs(cinemaPlayer.currentTime - time) > 0.45) cinemaPlayer.currentTime = time;
  if (action === 'play') { cinemaPlayer.play().catch(() => {}); showToast(`▶️ ${by} استأنف العرض`); }
  if (action === 'pause') { cinemaPlayer.pause(); showToast(`⏸️ ${by} أوقف العرض مؤقتاً`); }
  if (action === 'seek') showToast(`⏩ ${by} قفز بالتوقيت`);
  setTimeout(() => { isSyncing = false; }, 400);
});

socket.on('action-denied', (data) => showToast(`🔒 ${data.reason}`));
socket.on('room-settings-updated', (s) => { hostOnlyControl = s.hostOnlyControl; updateHostControlsUI(); });
socket.on('promoted-to-host', () => { isHost = true; updateHostControlsUI(); showToast('👑 أصبحت أنت المضيف للقاعة!'); });

socket.on('user-list', (users) => {
  usersCountBadge.innerText = users.length;
  usersList.innerHTML = users.map(u => `
    <div class="user-card">
      <div style="display:flex; align-items:center; gap:8px;">
        <span>${u.avatar || '🍿'}</span>
        <span class="user-name">${escapeHtml(u.name)} ${u.id === socket.id ? '(أنت)' : ''}</span>
      </div>
      ${u.isHost ? '<span class="host-badge">مضيف 👑</span>' : ''}
    </div>
  `).join('');
});

socket.on('new-message', (msg) => appendMessage(msg));
socket.on('floating-reaction', ({ emoji }) => createFloatingReaction(emoji));

// استقبال رسائل الجسر من داخل الإطار (iframe bridge)
window.addEventListener('message', (event) => {
  if (event.data && event.data.type && event.data.type.startsWith('SYNC_')) {
    const action = event.data.type === 'SYNC_PLAY' ? 'play' : (event.data.type === 'SYNC_PAUSE' ? 'pause' : 'seek');
    socket.emit('video-action', {
      roomId: currentRoomId,
      action: action,
      time: event.data.time || 0
    });
  }
});

// ==============================================================
// 5. الدردشة والتفاعلات
// ==============================================================

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat-message', { roomId: currentRoomId, message: text });
  chatInput.value = '';
}

function appendMessage(msg) {
  const isMine = msg.userId === socket.id;
  const msgEl = document.createElement('div');
  if (msg.system) {
    msgEl.className = 'msg-system';
    msgEl.innerText = msg.text;
  } else {
    msgEl.className = `msg-item ${isMine ? 'mine' : ''}`;
    msgEl.innerHTML = `
      <div class="msg-header">
        <span class="msg-user">${escapeHtml(msg.user)}</span>
        <span>•</span>
        <span>${msg.time}</span>
      </div>
      <div class="msg-body">${escapeHtml(msg.text)}</div>
    `;
  }
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendReaction(emoji) {
  socket.emit('send-reaction', { roomId: currentRoomId, emoji });
}

function createFloatingReaction(emoji) {
  const el = document.createElement('div');
  el.className = 'reaction-bubble';
  el.innerText = emoji;
  el.style.right = `${Math.floor(Math.random() * 80)}px`;
  reactionsBox.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function switchSidebarTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  if (tabName === 'chat') {
    document.getElementById('tabBtnChat').classList.add('active');
    document.getElementById('tabContentChat').classList.add('active');
  } else {
    document.getElementById('tabBtnUsers').classList.add('active');
    document.getElementById('tabContentUsers').classList.add('active');
  }
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}
