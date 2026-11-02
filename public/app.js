// ==============================================================
// 🍿 Hyperbeam Engine - Client App (Virtual Browser Streaming)
// ==============================================================

const socket = io();

let currentRoomId = '';
let currentUsername = '';
let isHost = false;
let hostOnlyControl = false;
let isSyncing = false;
let currentActiveMode = 'browser';

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
const browserQualitySelect = document.getElementById('browserQualitySelect');
const browserContainer = document.getElementById('browserContainer');
const browserCanvas = document.getElementById('browserCanvas');
const browserLoadingOverlay = document.getElementById('browserLoadingOverlay');
const ctx = browserCanvas.getContext('2d');

const cinemaPlayer = document.getElementById('cinemaPlayer');
const videoUrlInput = document.getElementById('videoUrlInput');
const localFileInput = document.getElementById('localFileInput');
const subtitleFileInput = document.getElementById('subtitleFileInput');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const usersList = document.getElementById('usersList');
const usersCountBadge = document.getElementById('usersCountBadge');
const reactionsBox = document.getElementById('reactionsBox');

// 1. الدخول للقاعة
const urlParams = new URLSearchParams(window.location.search);
const initialRoomFromUrl = urlParams.get('room');
if (initialRoomFromUrl) {
  customRoomInput.value = initialRoomFromUrl;
}

// تعيين اسم افتراضي مسبقاً للتسهيل
usernameInput.value = 'أحمد_' + Math.floor(Math.random() * 900 + 100);

function selectAvatar(emoji, el) {
  document.querySelectorAll('.avatar-opt').forEach(a => a.classList.remove('selected'));
  if (el) el.classList.add('selected');
  const input = document.getElementById('selectedAvatarInput');
  if (input) input.value = emoji;
}

function enterCinema(isNewRoom = false) {
  let name = usernameInput.value.trim();
  if (!name) name = 'صديق_' + Math.floor(Math.random() * 900 + 100);

  let room = customRoomInput.value.trim();
  if (isNewRoom || !room) {
    room = 'sahra-' + Math.floor(Math.random() * 9000 + 1000);
  }

  const avatarInput = document.getElementById('selectedAvatarInput');
  const userAvatar = avatarInput ? avatarInput.value : '🍿';

  currentUsername = name;
  currentRoomId = room;

  const newUrl = `${window.location.pathname}?room=${currentRoomId}`;
  window.history.pushState({ path: newUrl }, '', newUrl);

  welcomeModal.style.display = 'none';
  roomCodeBadge.innerHTML = `<span>${userAvatar}</span><span>قاعة: ${currentRoomId}</span><small style="opacity:0.7">(نسخ الرابط)</small>`;

  socket.emit('join-room', {
    roomId: currentRoomId,
    username: currentUsername,
    avatar: userAvatar
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
// 2. التحكم في المتصفح الافتراضي (Canvas Stream & Inputs)
// ==============================================================

// استقبال إطارات البث المباشر للشاشة ورسمها بسلاسة ونقاء عالي
socket.on('browser-frame', (frameBase64) => {
  const img = new Image();
  img.onload = () => {
    // مطابقة أبعاد الكانفاس الحقيقية مع جودة الإطار المستقبل بدقة 1:1 بدون أي بكسلة
    if (browserCanvas.width !== img.width || browserCanvas.height !== img.height) {
      browserCanvas.width = img.width;
      browserCanvas.height = img.height;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0);
    browserLoadingOverlay.classList.add('hidden');
  };
  img.src = frameBase64;
});

// تحديث شريط الرابط تلقائياً عند تنقل المتصفح
socket.on('sync-browser-url', ({ url }) => {
  if (document.activeElement !== browserUrlInput) {
    browserUrlInput.value = url;
  }
  updateQuickAccessActive(url);
});

// استقبال تحديث الجودة المتزامنة من المشتركين الآخرين
socket.on('browser-quality-updated', ({ quality, by }) => {
  if (browserQualitySelect) {
    browserQualitySelect.value = quality;
  }
  const label = browserQualitySelect ? browserQualitySelect.options[browserQualitySelect.selectedIndex].text : quality;
  showToast(`⚡ تم تغيير جودة البث إلى: ${label}`);
});

// تغيير الجودة من القائمة
function changeBrowserQuality(quality) {
  socket.emit('change-browser-quality', { roomId: currentRoomId, quality: quality });
  const label = browserQualitySelect ? browserQualitySelect.options[browserQualitySelect.selectedIndex].text : quality;
  showToast(`🎬 جاري التبديل إلى: ${label}...`);
}

// إرسال الرابط المطلوب
function applyBrowserUrl() {
  const url = browserUrlInput.value.trim();
  if (!url) return;
  browserLoadingOverlay.classList.remove('hidden');
  socket.emit('browser-navigate', { roomId: currentRoomId, url: url });
}

function browserNavigateTo(url) {
  browserUrlInput.value = url;
  browserLoadingOverlay.classList.remove('hidden');
  socket.emit('browser-navigate', { roomId: currentRoomId, url: url });
  updateQuickAccessActive(url);
}

function browserGoBack() {
  socket.emit('browser-back', { roomId: currentRoomId });
}

function browserGoForward() {
  socket.emit('browser-forward', { roomId: currentRoomId });
}

function browserReload() {
  browserLoadingOverlay.classList.remove('hidden');
  socket.emit('browser-reload', { roomId: currentRoomId });
  showToast('🔄 تم تحديث الصفحة');
}

// حساب إحداثيات الماوس بدقة متناهية وإعادتها دائماً لنسبة 1280x720 المعيارية
function getCanvasCoords(e) {
  const rect = browserCanvas.getBoundingClientRect();
  const scaleX = 1280 / rect.width;
  const scaleY = 720 / rect.height;
  return {
    x: Math.max(0, Math.min(1280, (e.clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(720, (e.clientY - rect.top) * scaleY))
  };
}

let lastMouseMove = 0;
browserCanvas.addEventListener('mousemove', (e) => {
  const now = Date.now();
  if (now - lastMouseMove < 35) return;
  lastMouseMove = now;
  const coords = getCanvasCoords(e);
  socket.emit('browser-mouse', {
    roomId: currentRoomId,
    event: { type: 'mouseMoved', x: coords.x, y: coords.y }
  });
});

browserCanvas.addEventListener('mousedown', (e) => {
  browserContainer.focus();
  const coords = getCanvasCoords(e);
  socket.emit('browser-mouse', {
    roomId: currentRoomId,
    event: {
      type: 'mousePressed',
      x: coords.x,
      y: coords.y,
      button: e.button === 2 ? 'right' : 'left',
      clickCount: 1
    }
  });
});

browserCanvas.addEventListener('mouseup', (e) => {
  const coords = getCanvasCoords(e);
  socket.emit('browser-mouse', {
    roomId: currentRoomId,
    event: {
      type: 'mouseReleased',
      x: coords.x,
      y: coords.y,
      button: e.button === 2 ? 'right' : 'left',
      clickCount: 1
    }
  });
});

browserCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const coords = getCanvasCoords(e);
  socket.emit('browser-mouse', {
    roomId: currentRoomId,
    event: {
      type: 'wheel',
      x: coords.x,
      y: coords.y,
      deltaX: e.deltaX,
      deltaY: e.deltaY
    }
  });
}, { passive: false });

browserCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ==============================================================
// إخفاء شريط التحكم ومؤشر الماوس تلقائياً أثناء المشاهدة (Smart Cinema Auto-Hide)
// ==============================================================
let idleTimer = null;
function resetIdleTimer() {
  browserContainer.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (document.activeElement !== browserUrlInput && (!favoritesModal || favoritesModal.style.display !== 'flex')) {
      browserContainer.classList.add('idle');
    }
  }, 2800);
}

browserContainer.addEventListener('mousemove', resetIdleTimer);
browserContainer.addEventListener('touchstart', resetIdleTimer, { passive: true });
browserContainer.addEventListener('keydown', resetIdleTimer);

// معالجة ضغطات الكيبورد والكتابة داخل المتصفح الافتراضي
browserContainer.addEventListener('keydown', (e) => {
  if (e.target === chatInput || e.target === browserUrlInput || e.target === usernameInput || e.target === customRoomInput) {
    return;
  }

  if (['Space', 'ArrowUp', 'ArrowDown', 'Backspace', 'Tab', 'Enter'].includes(e.code)) {
    e.preventDefault();
  }

  if (e.key === 'Enter') {
    socket.emit('browser-key', { roomId: currentRoomId, event: { type: 'rawKeyDown', key: 'Enter', code: 'Enter' } });
  } else if (e.key === 'Backspace') {
    socket.emit('browser-key', { roomId: currentRoomId, event: { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace' } });
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    socket.emit('browser-key', { roomId: currentRoomId, event: { type: 'char', text: e.key } });
  } else {
    socket.emit('browser-key', { roomId: currentRoomId, event: { type: 'rawKeyDown', key: e.key, code: e.code } });
  }
});

browserContainer.addEventListener('keyup', (e) => {
  if (e.target === chatInput || e.target === browserUrlInput || e.target === usernameInput || e.target === customRoomInput) {
    return;
  }
  socket.emit('browser-key', { roomId: currentRoomId, event: { type: 'keyUp', key: e.key, code: e.code } });
});

// تبديل أوضاع العرض (متصفح افتراضي / مشغل فيديو)
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

// ==============================================================
// التحكم في وسائط الفيلم العائمة (تقديم / تأخير / تشغيل / كتم)
// ==============================================================
function sendBrowserMedia(action, value = 10) {
  if (currentActiveMode === 'browser') {
    socket.emit('browser-media-control', { roomId: currentRoomId, action, value });
    if (action === 'seek-forward') showToast(`⏩ تقديم +${value} ثواني`);
    else if (action === 'seek-backward') showToast(`⏪ تأخير -${value} ثواني`);
    else if (action === 'play-pause') showToast('⏯️ تشغيل / إيقاف مؤقت');
    else if (action === 'toggle-mute') showToast('🔊 كتم / تشغيل الصوت');
  } else {
    // مشغل الفيديو المباشر
    if (action === 'seek-forward') {
      cinemaPlayer.currentTime = Math.min(cinemaPlayer.duration || cinemaPlayer.currentTime + 10, cinemaPlayer.currentTime + value);
      showToast(`⏩ تقديم +${value} ثواني`);
    } else if (action === 'seek-backward') {
      cinemaPlayer.currentTime = Math.max(0, cinemaPlayer.currentTime - value);
      showToast(`⏪ تأخير -${value} ثواني`);
    } else if (action === 'play-pause') {
      if (cinemaPlayer.paused) cinemaPlayer.play(); else cinemaPlayer.pause();
    } else if (action === 'toggle-mute') {
      cinemaPlayer.muted = !cinemaPlayer.muted;
      showToast(cinemaPlayer.muted ? '🔇 تم كتم الصوت' : '🔊 تم تشغيل الصوت');
    }
  }
}

socket.on('browser-media-synced', ({ action, value, by }) => {
  if (action === 'seek-forward') showToast(`⏩ قام ${by} بتقديم الفيلم +${value} ثواني`);
  else if (action === 'seek-backward') showToast(`⏪ قام ${by} بتأخير الفيلم -${value} ثواني`);
  else if (action === 'play-pause') showToast(`⏯️ قام ${by} بالضغط على تشغيل/إيقاف`);
  else if (action === 'toggle-mute') showToast(`🔊 قام ${by} بتبديل كتم الصوت`);
});

// ==============================================================
// ميزة الشاشة المصغرة (Picture-in-Picture) للموبايل والكمبيوتر
// ==============================================================
let pipVideoElement = null;

async function togglePictureInPicture() {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      showToast('📺 تم إغلاق الشاشة المصغرة');
      return;
    }

    if (currentActiveMode === 'browser') {
      if (!pipVideoElement) {
        pipVideoElement = document.createElement('video');
        pipVideoElement.muted = true;
        pipVideoElement.playsInline = true;
        pipVideoElement.style.position = 'fixed';
        pipVideoElement.style.bottom = '-9999px';
        pipVideoElement.style.left = '-9999px';
        pipVideoElement.style.width = '1px';
        pipVideoElement.style.height = '1px';
        pipVideoElement.style.opacity = '0';
        pipVideoElement.style.pointerEvents = 'none';
        document.body.appendChild(pipVideoElement);
      }

      const stream = browserCanvas.captureStream ? browserCanvas.captureStream(25) : null;
      if (!stream) {
        showToast('⚠️ خاصية البث المصغر غير مدعومة في هذا المتصفح');
        return;
      }
      pipVideoElement.srcObject = stream;
      await pipVideoElement.play();
      if (pipVideoElement.requestPictureInPicture) {
        await pipVideoElement.requestPictureInPicture();
        showToast('📺 تم تشغيل الشاشة المصغرة خارج المتصفح (مثل يوتيوب)! 🍿');
      } else {
        showToast('⚠️ متصفحك لا يدعم Picture-in-Picture');
      }
    } else {
      if (cinemaPlayer.requestPictureInPicture) {
        await cinemaPlayer.requestPictureInPicture();
        showToast('📺 تم تشغيل الشاشة المصغرة! 🍿');
      } else {
        showToast('⚠️ متصفحك لا يدعم Picture-in-Picture لمشغل الفيديو');
      }
    }
  } catch (err) {
    console.error('PiP Error:', err);
    showToast('⚠️ لتفعيل الشاشة المصغرة يرجى النقر مرة أخرى للتأكيد');
  }
}

// ==============================================================
// ميزة ملء الشاشة المتكيفة (Fullscreen Toggle)
// ==============================================================
function toggleFullscreen() {
  const elem = currentActiveMode === 'browser' ? browserContainer : document.querySelector('.player-container');
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {});
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    }
    showToast('⛶ وضع ملء الشاشة');
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    showToast('⛶ تم إنهاء ملء الشاشة');
  }
}

// تبديل ظهور الدردشة على شاشات الموبايل
function toggleMobileChat() {
  const layout = document.getElementById('cinemaMainLayout');
  if (layout) {
    layout.classList.toggle('mobile-chat-open');
    const isOpen = layout.classList.contains('mobile-chat-open');
    showToast(isOpen ? '💬 فُتحت نافذة الدردشة' : '🎬 تم إخفاء الدردشة لتركيز المشاهدة');
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

  if (state.activeMode) {
    switchMainMode(state.activeMode);
  }
  if (state.browserUrl) {
    browserUrlInput.value = state.browserUrl;
  }
  if (state.browserQuality && browserQualitySelect) {
    browserQualitySelect.value = state.browserQuality;
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
    const btn = document.getElementById('tabBtnChat');
    const content = document.getElementById('tabContentChat');
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
  } else if (tabName === 'voice') {
    const btn = document.getElementById('tabBtnVoice');
    const content = document.getElementById('tabContentVoice');
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
  } else if (tabName === 'subtitles') {
    const btn = document.getElementById('tabBtnSubtitles');
    const content = document.getElementById('tabContentSubtitles');
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
  } else {
    const btn = document.getElementById('tabBtnUsers');
    const content = document.getElementById('tabContentUsers');
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
  }
}

function openSubtitlePanel() {
  switchSidebarTab('subtitles');
  if (cinemaMainLayout && cinemaMainLayout.classList.contains('mobile-chat-closed')) {
    toggleMobileChat();
  }
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

// ==============================================================
// مكتبة الأفلام المفضلة (Watchlist & Favorites Library)
// ==============================================================
const FAV_STORAGE_KEY = 'sahra_cinema_favorites';
const favCountBadge = document.getElementById('favCountBadge');
const favoritesModal = document.getElementById('favoritesModal');
const favModalCounter = document.getElementById('favModalCounter');
const favLibraryContent = document.getElementById('favLibraryContent');
const favSearchInput = document.getElementById('favSearchInput');

function getFavorites() {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveFavorites(list) {
  try {
    localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(list));
    updateFavoritesBadge();
  } catch (e) {}
}

function updateFavoritesBadge() {
  const list = getFavorites();
  if (favCountBadge) favCountBadge.innerText = list.length;
  if (favModalCounter) favModalCounter.innerText = `${list.length} فيلم`;
}

// إضافة الفيلم الحالي للمفضلة
function addCurrentToFavorites() {
  const currentUrl = currentActiveMode === 'browser' ? (browserUrlInput.value || '').trim() : (videoUrlInput.value || '').trim();
  if (!currentUrl || currentUrl === 'https://www.google.com') {
    showToast('⚠️ يرجى فتح صفحة الفيلم أولاً لحفظه في المفضلة.');
    return;
  }

  showToast('⏳ جاري جلب معلومات وبوستر الفيلم...');

  if (currentActiveMode === 'browser') {
    socket.emit('get-movie-meta', { roomId: currentRoomId }, (meta) => {
      saveMovieToStorage(meta || { url: currentUrl, title: 'فيلم سينمائي', poster: null });
    });
  } else {
    saveMovieToStorage({
      url: currentUrl,
      title: 'فيديو مباشر: ' + (currentUrl.split('/').pop().substring(0, 30) || 'فيلم'),
      poster: null
    });
  }
}

function saveMovieToStorage(movie) {
  const list = getFavorites();
  const cleanUrl = (movie.url || '').trim();

  // فحص إذا كان الفيلم مضافاً مسبقاً
  const exists = list.some(item => item.url === cleanUrl);
  if (exists) {
    showToast('⭐ هذا الفيلم محفوظ بالفعل في مكتبتك المفضلة!');
    return;
  }

  const movieItem = {
    id: 'fav_' + Date.now(),
    title: (movie.title || 'فيلم سينمائي').trim(),
    poster: movie.poster || null,
    url: cleanUrl,
    addedAt: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
  };

  list.unshift(movieItem);
  saveFavorites(list);
  showToast(`❤️ تمت إضافة "${movieItem.title}" إلى مكتبتك المفضلة! 🍿`);
  renderFavoritesModal();
}

function toggleFavoritesModal() {
  if (!favoritesModal) return;
  const isHidden = favoritesModal.style.display === 'none';
  if (isHidden) {
    renderFavoritesModal();
    favoritesModal.style.display = 'flex';
    if (favSearchInput) favSearchInput.value = '';
  } else {
    favoritesModal.style.display = 'none';
  }
}

function filterFavorites(query) {
  renderFavoritesModal(query.trim().toLowerCase());
}

function renderFavoritesModal(query = '') {
  if (!favLibraryContent) return;
  let list = getFavorites();

  if (query) {
    list = list.filter(item => item.title.toLowerCase().includes(query) || item.url.toLowerCase().includes(query));
  }

  updateFavoritesBadge();

  if (list.length === 0) {
    if (query) {
      favLibraryContent.innerHTML = `
        <div class="library-empty">
          <div class="empty-icon">🔍</div>
          <h3>لا توجد نتائج مطابقة لـ "${escapeHtml(query)}"</h3>
          <p>جرّب البحث باسم آخر.</p>
        </div>
      `;
    } else {
      favLibraryContent.innerHTML = `
        <div class="library-empty">
          <div class="empty-icon">🍿</div>
          <h3>مكتبتك المفضلة فارغة حالياً!</h3>
          <p>عندما تشاهد أو تتصفح أي فيلم في السهرة، اضغط على زر <strong>"❤️ حفظ الفيلم"</strong> ليتم حفظه ببوستره هنا دائماً وتستطيع الرجوع إليه ومشاهدته بنقرة واحدة.</p>
        </div>
      `;
    }
    return;
  }

  favLibraryContent.innerHTML = `
    <div class="fav-grid">
      ${list.map(item => `
        <div class="fav-card">
          <div class="fav-card-poster">
            ${item.poster ? `
              <img src="${escapeHtml(item.poster)}" alt="${escapeHtml(item.title)}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'poster-fallback\\'>🎬</div>';">
            ` : `
              <div class="poster-fallback">🎬</div>
            `}
            <div class="fav-card-overlay">
              <button class="fav-play-btn" onclick="playFavoriteMovie('${escapeHtml(item.url)}')">
                ▶️ تشغيل الآن
              </button>
            </div>
          </div>
          <div class="fav-card-info">
            <h4 class="fav-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h4>
            <div class="fav-card-meta">
              <span class="fav-date">📅 ${escapeHtml(item.addedAt)}</span>
              <button class="fav-delete-btn" onclick="removeFavoriteMovie('${item.id}')" title="حذف من المفضلة">🗑️</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function playFavoriteMovie(url) {
  if (!url) return;
  toggleFavoritesModal();
  switchMainMode('browser');
  browserNavigateTo(url);
  showToast('🎬 جاري تشغيل الفيلم من مكتبتك المفضلة...');
}

function removeFavoriteMovie(id) {
  let list = getFavorites();
  const removed = list.find(i => i.id === id);
  list = list.filter(item => item.id !== id);
  saveFavorites(list);
  renderFavoritesModal(favSearchInput ? favSearchInput.value : '');
  showToast(`🗑️ تم حذف "${removed ? removed.title : 'الفيلم'}" من المفضلة`);
}

// ==============================================================
// شريط الوصول السريع للمواقع المحفوظة (Quick Access Bookmarks)
// ==============================================================
const QA_STORAGE_KEY = 'sahra_quick_access_sites';
const DEFAULT_QUICK_ACCESS = [
  { id: 'qa-google', title: '🔍 بحث Google', url: 'https://www.google.com' },
  { id: 'qa-egydead', title: '🍿 ايجي ديد (EgyDead)', url: 'https://egydead.live' },
  { id: 'qa-youtube', title: '🎬 يوتيوب', url: 'https://www.youtube.com' }
];

function getQuickAccess() {
  try {
    const raw = localStorage.getItem(QA_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(QA_STORAGE_KEY, JSON.stringify(DEFAULT_QUICK_ACCESS));
      return DEFAULT_QUICK_ACCESS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_QUICK_ACCESS;
  } catch (e) {
    return DEFAULT_QUICK_ACCESS;
  }
}

function saveQuickAccess(list) {
  try {
    localStorage.setItem(QA_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}
  renderQuickAccess();
}

function renderQuickAccess() {
  const container = document.getElementById('quickAccessList');
  if (!container) return;
  const list = getQuickAccess();
  const currentUrl = (browserUrlInput ? browserUrlInput.value : '').trim().toLowerCase();

  if (list.length === 0) {
    container.innerHTML = '<span class="quick-empty-hint">لا توجد مواقع محفوظة بعد. اضغط "➕ حفظ الموقع الحالي".</span>';
    return;
  }

  container.innerHTML = list.map(item => {
    const itemUrlLower = (item.url || '').toLowerCase();
    const isActive = currentUrl && (currentUrl === itemUrlLower || currentUrl.startsWith(itemUrlLower));
    return `
      <div class="quick-pill ${isActive ? 'active' : ''}" onclick="browserNavigateTo('${escapeHtml(item.url)}')" title="${escapeHtml(item.url)}">
        <span class="quick-pill-title">${escapeHtml(item.title)}</span>
        <button class="quick-del-btn" onclick="event.stopPropagation(); removeQuickAccess('${item.id}')" title="إزالة من الوصول السريع">✕</button>
      </div>
    `;
  }).join('');
}

function addCurrentToQuickAccess() {
  const currentUrl = (browserUrlInput ? browserUrlInput.value : '').trim();
  if (!currentUrl) {
    showToast('⚠️ لا يوجد رابط حالي لحفظه.');
    return;
  }

  // اقتراح اسم ذكي للموقع من الرابط
  let suggestedName = '';
  try {
    const u = new URL(currentUrl);
    suggestedName = u.hostname.replace('www.', '');
  } catch (e) {
    suggestedName = currentUrl;
  }

  const name = prompt('أدخل اسماً أو عنواناً لهذا الموقع في شريط الوصول السريع:', suggestedName);
  if (name === null) return; // تم الإلغاء من قبل المستخدم

  const finalName = name.trim() || suggestedName;
  const list = getQuickAccess();

  // التحقق إن كان الموقع موجوداً بالفعل لتحديث اسمه
  const existing = list.find(item => item.url.toLowerCase() === currentUrl.toLowerCase());
  if (existing) {
    existing.title = finalName;
    saveQuickAccess(list);
    showToast(`🔄 تم تحديث اسم الموقع في شريط الوصول السريع إلى "${finalName}"`);
    return;
  }

  list.push({
    id: 'qa-' + Date.now(),
    title: finalName,
    url: currentUrl
  });

  saveQuickAccess(list);
  showToast(`⭐ تم حفظ "${finalName}" في شريط الوصول السريع بنجاح!`);
}

function removeQuickAccess(id) {
  let list = getQuickAccess();
  const removed = list.find(item => item.id === id);
  list = list.filter(item => item.id !== id);
  saveQuickAccess(list);
  showToast(`🗑️ تم إزالة "${removed ? removed.title : 'الموقع'}" من الوصول السريع`);
}

function updateQuickAccessActive(url) {
  const container = document.getElementById('quickAccessList');
  if (!container) return;
  const targetUrl = (url || '').toLowerCase();
  container.querySelectorAll('.quick-pill').forEach(pill => {
    const pillUrl = (pill.getAttribute('title') || '').toLowerCase();
    if (pillUrl && (targetUrl === pillUrl || targetUrl.startsWith(pillUrl) || pillUrl.startsWith(targetUrl))) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });
}

// ==============================================================
// التحكم في شدة إضاءة السينما الرأسية (Vertical Ambient Light)
// ==============================================================
const AMBIENT_STORAGE_KEY = 'sahra_ambient_brightness';
let lastActiveAmbientBrightness = 70;

function setAmbientBrightness(val) {
  const num = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
  const opacity = num / 100;

  // تطبيق الشدة على متغيرات الـ CSS لجميع عناصر الإضاءة الرأسية
  document.documentElement.style.setProperty('--ambient-opacity', opacity.toString());

  // تحديث عناصر التحكم
  const slider = document.getElementById('ambientBrightnessSlider');
  const badge = document.getElementById('ambientBrightnessValue');
  const toggleBtn = document.getElementById('ambientToggleBtn');

  if (slider && slider.value != num) slider.value = num;
  if (badge) badge.innerText = `${num}%`;

  if (toggleBtn) {
    if (num === 0) {
      toggleBtn.style.filter = 'grayscale(1) opacity(0.4)';
      toggleBtn.title = 'تشغيل الإضاءة الخلفية';
    } else {
      toggleBtn.style.filter = 'none';
      toggleBtn.title = 'إيقاف الإضاءة الخلفية';
      lastActiveAmbientBrightness = num;
    }
  }

  // تحديث إطار الكانفاس ليتناغم مع شدة الإضاءة
  const canvas = document.getElementById('browserCanvas');
  if (canvas) {
    if (num === 0) {
      canvas.style.borderColor = 'rgba(255, 255, 255, 0.05)';
      canvas.style.boxShadow = '0 16px 50px rgba(0, 0, 0, 0.95)';
    } else {
      const redAlpha = (0.35 * opacity).toFixed(2);
      canvas.style.borderColor = `rgba(229, 9, 20, ${redAlpha})`;
      canvas.style.boxShadow = `0 16px 50px rgba(0, 0, 0, 0.95), 0 0 ${Math.round(20 * opacity)}px rgba(229, 9, 20, ${redAlpha})`;
    }
  }

  // حفظ التفضيل في localStorage
  try {
    localStorage.setItem(AMBIENT_STORAGE_KEY, num.toString());
  } catch (e) {}
}

function toggleAmbientLight() {
  const current = parseInt(localStorage.getItem(AMBIENT_STORAGE_KEY) || '70', 10);
  if (current > 0) {
    lastActiveAmbientBrightness = current;
    setAmbientBrightness(0);
    showToast('🌑 تم إيقاف إضاءة السينما الخلفية');
  } else {
    const restore = lastActiveAmbientBrightness > 0 ? lastActiveAmbientBrightness : 70;
    setAmbientBrightness(restore);
    showToast(`💡 تم تشغيل إضاءة السينما (${restore}%)`);
  }
}

function initAmbientBrightness() {
  try {
    const saved = localStorage.getItem(AMBIENT_STORAGE_KEY);
    const initial = saved !== null ? parseInt(saved, 10) : 70;
    setAmbientBrightness(initial);
  } catch (e) {
    setAmbientBrightness(70);
  }
}

// ==============================================================
// التحكم في شفافية المتصفح والوضع الليلي (Canvas Opacity & Cinema Dark Mode)
// ==============================================================
const OPACITY_STORAGE_KEY = 'sahra_canvas_opacity';
const DARK_MODE_STORAGE_KEY = 'sahra_cinema_dark_mode';
let isCinemaDarkMode = false;

function setCanvasOpacity(val) {
  const num = Math.max(30, Math.min(100, parseInt(val, 10) || 100));
  const opacity = (num / 100).toFixed(2);
  document.documentElement.style.setProperty('--canvas-opacity', opacity);

  const slider = document.getElementById('canvasOpacitySlider');
  const badge = document.getElementById('canvasOpacityValue');
  if (slider && slider.value != num) slider.value = num;
  if (badge) badge.innerText = `${num}%`;

  try {
    localStorage.setItem(OPACITY_STORAGE_KEY, num.toString());
  } catch (e) {}
}

function toggleCinemaDarkMode() {
  isCinemaDarkMode = !isCinemaDarkMode;
  const btn = document.getElementById('cinemaDarkModeBtn');
  const canvas = document.getElementById('browserCanvas');

  if (isCinemaDarkMode) {
    if (canvas) canvas.classList.add('cinema-dark-invert');
    if (btn) {
      btn.classList.add('active');
      btn.innerText = '☀️';
      btn.title = 'العودة للوضع الطبيعي';
    }
    showToast('🌙 تم تفعيل الوضع الليلي السينمائي لحماية العين');
  } else {
    if (canvas) canvas.classList.remove('cinema-dark-invert');
    if (btn) {
      btn.classList.remove('active');
      btn.innerText = '🌙';
      btn.title = 'تحويل المواقع البيضاء إلى الوضع الليلي الداكن';
    }
    showToast('☀️ تم تفعيل الوضع الطبيعي للمتصفح');
  }

  try {
    localStorage.setItem(DARK_MODE_STORAGE_KEY, isCinemaDarkMode ? '1' : '0');
  } catch (e) {}
}

function initCanvasVisualControls() {
  try {
    const savedOpacity = localStorage.getItem(OPACITY_STORAGE_KEY);
    setCanvasOpacity(savedOpacity !== null ? parseInt(savedOpacity, 10) : 100);

    const savedDark = localStorage.getItem(DARK_MODE_STORAGE_KEY);
    if (savedDark === '1') {
      toggleCinemaDarkMode();
    }
  } catch (e) {}
}

// ==============================================================
// 🎙️ الغرفة الصوتية المباشرة (Live WebRTC Voice Chat Engine)
// ==============================================================
let localVoiceStream = null;
let voiceAudioContext = null;
let voiceAnalyser = null;
let voiceVadInterval = null;
let voicePeers = {}; // remoteSocketId -> RTCPeerConnection
let remoteAudioStreams = {}; // remoteSocketId -> HTMLAudioElement
let isVoiceConnected = false;
let isVoiceMuted = false;
let isVoiceDeafened = false;
let isLocalSpeaking = false;
let voiceUsersInRoom = [];

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

async function toggleVoiceRoom() {
  if (isVoiceConnected) {
    leaveVoiceRoom();
  } else {
    await joinVoiceRoom();
  }
}

async function joinVoiceRoom() {
  if (isVoiceConnected) return;

  try {
    showToast('🎙️ جاري الوصول للمايك والاتصال بالروم الصوتي...');
    localVoiceStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    isVoiceConnected = true;
    isVoiceMuted = false;
    isVoiceDeafened = false;

    setupVoiceActivityDetection(localVoiceStream);

    // إشعار السيرفر بالانضمام للروم الصوتي
    socket.emit('voice-join', { roomId: currentRoomId });

    updateVoiceUIState();
    showToast('🟢 تم الاتصال بالروم الصوتي المباشر بنجاح!');
  } catch (err) {
    console.error('[Voice] خطأ في الوصول للمايكروفون:', err);
    showToast('⚠️ يرجى السماح للمتصفح بالوصول للمايكروفون للانضمام للروم.');
  }
}

function leaveVoiceRoom() {
  if (!isVoiceConnected) return;

  // إغلاق مسارات الصوت المحلية
  if (localVoiceStream) {
    localVoiceStream.getTracks().forEach(t => t.stop());
    localVoiceStream = null;
  }

  // إغلاق محلل الصوت
  if (voiceVadInterval) clearInterval(voiceVadInterval);
  if (voiceAudioContext) {
    try { voiceAudioContext.close(); } catch (e) {}
    voiceAudioContext = null;
  }

  // إغلاق اتصالات الأقران
  Object.keys(voicePeers).forEach(id => {
    try { voicePeers[id].close(); } catch (e) {}
    delete voicePeers[id];
  });

  // إزالة أصوات الآخرين
  Object.keys(remoteAudioStreams).forEach(id => {
    if (remoteAudioStreams[id]) {
      remoteAudioStreams[id].pause();
      remoteAudioStreams[id].remove();
      delete remoteAudioStreams[id];
    }
  });

  isVoiceConnected = false;
  isVoiceMuted = false;
  isVoiceDeafened = false;
  isLocalSpeaking = false;

  socket.emit('voice-leave', { roomId: currentRoomId });
  updateVoiceUIState();
  showToast('🔴 تم الخروج من الروم الصوتي');
}

function toggleVoiceMute() {
  if (!isVoiceConnected || !localVoiceStream) {
    showToast('⚠️ يجب الانضمام للروم الصوتي أولاً.');
    return;
  }

  isVoiceMuted = !isVoiceMuted;
  localVoiceStream.getAudioTracks().forEach(track => {
    track.enabled = !isVoiceMuted;
  });

  socket.emit('voice-state', {
    roomId: currentRoomId,
    isMuted: isVoiceMuted,
    isDeafened: isVoiceDeafened,
    isSpeaking: false
  });

  updateVoiceUIState();
  showToast(isVoiceMuted ? '🔇 تم كتم المايكروفون' : '🎙️ المايكروفون يعمل الآن');
}

function toggleVoiceDeafen() {
  if (!isVoiceConnected) {
    showToast('⚠️ يجب الانضمام للروم الصوتي أولاً.');
    return;
  }

  isVoiceDeafened = !isVoiceDeafened;

  // إذا تم كتم السماع، نكتم المايك أيضاً تلقائياً كمعيار احترافي
  if (isVoiceDeafened && !isVoiceMuted) {
    toggleVoiceMute();
  }

  // كتم كل أصوات الآخرين القادمة
  Object.values(remoteAudioStreams).forEach(audio => {
    audio.muted = isVoiceDeafened;
  });

  socket.emit('voice-state', {
    roomId: currentRoomId,
    isMuted: isVoiceMuted,
    isDeafened: isVoiceDeafened,
    isSpeaking: false
  });

  updateVoiceUIState();
  showToast(isVoiceDeafened ? '🎧 تم كتم صوت الحاضرين بالكامل' : '🔊 تم إعادة تشغيل صوت الحاضرين');
}

function setupVoiceActivityDetection(stream) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    voiceAudioContext = new AudioContext();
    const source = voiceAudioContext.createMediaStreamSource(stream);
    voiceAnalyser = voiceAudioContext.createAnalyser();
    voiceAnalyser.fftSize = 512;
    source.connect(voiceAnalyser);

    const bufferLength = voiceAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    voiceVadInterval = setInterval(() => {
      if (!isVoiceConnected || isVoiceMuted) {
        if (isLocalSpeaking) {
          isLocalSpeaking = false;
          broadcastSpeakingState(false);
        }
        return;
      }

      voiceAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const speaking = average > 14; // حساسية الصوت المناسبة للكلام

      if (speaking !== isLocalSpeaking) {
        isLocalSpeaking = speaking;
        broadcastSpeakingState(speaking);
      }
    }, 120);
  } catch (e) {
    console.warn('[VAD] AudioContext error:', e);
  }
}

function broadcastSpeakingState(speaking) {
  socket.emit('voice-state', {
    roomId: currentRoomId,
    isMuted: isVoiceMuted,
    isDeafened: isVoiceDeafened,
    isSpeaking: speaking
  });

  // تحديث محلي لبطاقة المستخدم الحالي
  const myCard = document.querySelector(`.voice-member-card[data-user-id="${socket.id}"]`);
  if (myCard) {
    if (speaking) myCard.classList.add('speaking');
    else myCard.classList.remove('speaking');
  }
}

function createPeerConnection(remoteUserId, isInitiator) {
  if (voicePeers[remoteUserId]) return voicePeers[remoteUserId];

  const pc = new RTCPeerConnection(ICE_SERVERS);
  voicePeers[remoteUserId] = pc;

  // إضافة مسار الصوت المحلي للاتصال
  if (localVoiceStream) {
    localVoiceStream.getAudioTracks().forEach(track => {
      pc.addTrack(track, localVoiceStream);
    });
  }

  // تبادل مرشحي ICE
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('voice-signal', {
        to: remoteUserId,
        signal: { candidate: event.candidate }
      });
    }
  };

  // استقبال مسار الصوت للطرف الآخر وتشغيله
  pc.ontrack = (event) => {
    let audio = remoteAudioStreams[remoteUserId];
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.muted = isVoiceDeafened;
      remoteAudioStreams[remoteUserId] = audio;
    }
    audio.srcObject = event.streams[0];
  };

  // إذا كنا نحن المبادرين بالاتصال
  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('voice-signal', {
          to: remoteUserId,
          signal: { sdp: pc.localDescription }
        });
      } catch (err) {
        console.error('[WebRTC] خطأ في إنشاء العرض:', err);
      }
    };
  }

  return pc;
}

// استقبال إشارات الـ WebRTC
socket.on('voice-signal', async ({ from, signal }) => {
  if (!isVoiceConnected) return;

  let pc = voicePeers[from];
  if (!pc) {
    pc = createPeerConnection(from, false);
  }

  try {
    if (signal.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice-signal', {
          to: from,
          signal: { sdp: pc.localDescription }
        });
      }
    } else if (signal.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  } catch (err) {
    console.error('[WebRTC] خطأ في معالجة الإشارة:', err);
  }
});

// استقبال قائمة المتصلين بالصوت
socket.on('voice-users-list', (users) => {
  voiceUsersInRoom = users || [];
  updateVoiceUsersListUI(voiceUsersInRoom);

  // إذا كنا متصلين، ننشئ اتصالات أقران مع جميع المتواجدين
  if (isVoiceConnected) {
    voiceUsersInRoom.forEach(u => {
      if (u.id !== socket.id) {
        createPeerConnection(u.id, true);
      }
    });
  }
});

socket.on('user-joined-voice', (user) => {
  if (!voiceUsersInRoom.find(u => u.id === user.id)) {
    voiceUsersInRoom.push(user);
  }
  updateVoiceUsersListUI(voiceUsersInRoom);

  // إذا كان المستخدم الجديد غير محلي، نبدأ التفاوض معه
  if (isVoiceConnected && user.id !== socket.id) {
    createPeerConnection(user.id, true);
    showToast(`🎙️ انضم ${user.name} للروم الصوتي`);
  }
});

socket.on('user-left-voice', ({ userId, username }) => {
  voiceUsersInRoom = voiceUsersInRoom.filter(u => u.id !== userId);
  updateVoiceUsersListUI(voiceUsersInRoom);

  if (voicePeers[userId]) {
    try { voicePeers[userId].close(); } catch (e) {}
    delete voicePeers[userId];
  }
  if (remoteAudioStreams[userId]) {
    remoteAudioStreams[userId].pause();
    remoteAudioStreams[userId].remove();
    delete remoteAudioStreams[userId];
  }

  if (username) showToast(`🚪 غادر ${username} الروم الصوتي`);
});

socket.on('user-voice-state', ({ userId, isMuted, isDeafened, isSpeaking }) => {
  const memberCard = document.querySelector(`.voice-member-card[data-user-id="${userId}"]`);
  if (!memberCard) return;

  if (isSpeaking) memberCard.classList.add('speaking');
  else memberCard.classList.remove('speaking');

  const icons = memberCard.querySelector('.voice-member-icons');
  if (icons) {
    icons.innerHTML = `
      ${isMuted ? '🔇' : ''}
      ${isDeafened ? '🎧❌' : ''}
    `;
  }
});

function updateVoiceUIState() {
  const joinBtn = document.getElementById('voiceJoinBtn');
  const joinBtnText = document.getElementById('voiceJoinBtnText');
  const activeCtrls = document.getElementById('voiceActiveControls');
  const statusCard = document.getElementById('voiceStatusCard');
  const statusTitle = document.getElementById('voiceStatusTitle');
  const statusSub = document.getElementById('voiceStatusSub');
  const mainActionBtn = document.getElementById('voiceMainActionBtn');
  const muteBtn = document.getElementById('voiceMuteBtn');
  const deafenBtn = document.getElementById('voiceDeafenBtn');
  const dockMuteBtn = document.getElementById('dockMuteBtn');
  const dockDeafenBtn = document.getElementById('dockDeafenBtn');
  const dockMuteLabel = document.getElementById('dockMuteLabel');
  const dockDeafenLabel = document.getElementById('dockDeafenLabel');

  if (isVoiceConnected) {
    if (joinBtnText) joinBtnText.innerText = 'متصل بالصوت 🟢';
    if (activeCtrls) activeCtrls.classList.remove('hidden');
    if (statusCard) statusCard.classList.add('connected');
    if (statusTitle) statusTitle.innerText = '🟢 متصل بالروم الصوتي المباشر';
    if (statusSub) statusSub.innerText = 'صوتك واضح ومباشر لجميع المتواجدين في السهرة.';
    if (mainActionBtn) {
      mainActionBtn.innerText = '🔴 مغادرة الروم الصوتي';
      mainActionBtn.classList.add('leave-btn');
    }

    if (muteBtn) {
      if (isVoiceMuted) {
        muteBtn.classList.add('muted');
        muteBtn.innerText = '🔇';
      } else {
        muteBtn.classList.remove('muted');
        muteBtn.innerText = '🎙️';
      }
    }

    if (deafenBtn) {
      if (isVoiceDeafened) {
        deafenBtn.classList.add('deafened');
        deafenBtn.innerText = '🔇';
      } else {
        deafenBtn.classList.remove('deafened');
        deafenBtn.innerText = '🎧';
      }
    }

    if (dockMuteBtn) {
      dockMuteBtn.className = 'voice-dock-btn ' + (isVoiceMuted ? 'active-muted' : '');
      if (dockMuteLabel) dockMuteLabel.innerText = isVoiceMuted ? 'المايك مكتوم 🔇' : 'المايك يعمل 🎙️';
    }

    if (dockDeafenBtn) {
      dockDeafenBtn.className = 'voice-dock-btn ' + (isVoiceDeafened ? 'active-deafened' : '');
      if (dockDeafenLabel) dockDeafenLabel.innerText = isVoiceDeafened ? 'السماعة مكتومة 🔇' : 'السماعة تعمل 🎧';
    }
  } else {
    if (joinBtnText) joinBtnText.innerText = '🎙️ الروم الصوتي';
    if (activeCtrls) activeCtrls.classList.add('hidden');
    if (statusCard) statusCard.classList.remove('connected');
    if (statusTitle) statusTitle.innerText = 'الروم الصوتي غير متصل';
    if (statusSub) statusSub.innerText = 'اضغط انضمام للتحدث بصوتك مباشرة مع الأصدقاء.';
    if (mainActionBtn) {
      mainActionBtn.innerText = '🎙️ انضمام للروم الصوتي';
      mainActionBtn.classList.remove('leave-btn');
    }
  }
}

function updateVoiceUsersListUI(users) {
  const container = document.getElementById('voiceMembersList');
  const countBadge = document.getElementById('voiceCountBadge');
  const connectedCount = document.getElementById('voiceConnectedCount');

  const list = users || [];
  if (countBadge) countBadge.innerText = list.length;
  if (connectedCount) connectedCount.innerText = list.length;

  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div class="voice-empty-state">
        <span class="empty-icon">🎙️</span>
        <p>لا يوجد أحد في الروم الصوتي حالياً.<br>انقر على انضمام لتكون أول المتحدثين!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(u => `
    <div class="voice-member-card ${u.isSpeaking ? 'speaking' : ''}" data-user-id="${u.id}">
      <div class="voice-member-info">
        <span class="voice-avatar-badge">${u.avatar || '🍿'}</span>
        <span class="voice-member-name">${escapeHtml(u.name)} ${u.id === socket.id ? '(أنت)' : ''}</span>
      </div>
      <div class="voice-member-icons">
        ${u.isMuted ? '🔇' : ''}
        ${u.isDeafened ? '🎧❌' : ''}
      </div>
    </div>
  `).join('');
}


// ==============================================================
// 📝 محرك الترجمة التلقائية الذكية ومزامنة التوقيت (Subtitles Engine)
// ==============================================================
let activeSubtitle = {
  title: '',
  cues: [],
  offset: 0
};
let subTickInterval = null;
let currentEstimatedMediaTime = 0;

// البحث عن الترجمات العربية عبر الـ API
async function searchArabicSubtitles(customQuery) {
  const input = document.getElementById('subSearchInput');
  const query = customQuery || (input ? input.value : '').trim();

  if (!query) {
    showToast('⚠️ يرجى كتابة اسم الفيلم للبحث عن ترجمته.');
    return;
  }

  const resultsList = document.getElementById('subResultsList');
  const resultsCount = document.getElementById('subResultsCount');
  if (resultsList) {
    resultsList.innerHTML = '<div class="sub-empty-hint">⏳ جاري البحث عن أفضل الترجمات العربية المتطابقة...</div>';
  }

  try {
    const res = await fetch(`/api/subtitles/search?query=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.success && data.results && data.results.length > 0) {
      renderSubtitlesResults(data.results);
      if (resultsCount) resultsCount.innerText = `(${data.results.length} ترجمة)`;
    } else {
      if (resultsList) {
        resultsList.innerHTML = `
          <div class="sub-empty-hint">
            <span>🔍</span>
            <p>لم نجد ترجمات دقيقة لهذا الاسم، جرب كتابة اسم الفيلم بالإنجليزية (مثل: Inception).</p>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error('Subtitle search error:', err);
    if (resultsList) {
      resultsList.innerHTML = '<div class="sub-empty-hint">⚠️ تعذر البحث، يرجى المحاولة مرة أخرى.</div>';
    }
  }
}

// الكشف التلقائي عن اسم الفيلم من صفحة المتصفح الحالية
function autoDetectMovieSubtitle() {
  showToast('🔍 جاري استخراج اسم الفيلم من الصفحة الحالية...');

  if (currentActiveMode === 'browser') {
    socket.emit('get-movie-meta', { roomId: currentRoomId }, (meta) => {
      let movieTitle = '';
      if (meta && meta.title) {
        // تنظيف العنوان من الكلمات الزائدة
        movieTitle = meta.title.replace(/مشاهدة|فيلم|مترجم|اون لاين|كامل|ايجي ديد|egydead|akwam|كاملة|hd|1080p/gi, '').trim();
      }
      if (!movieTitle) {
        const url = browserUrlInput.value || '';
        try {
          const u = new URL(url);
          movieTitle = u.pathname.split('/').filter(Boolean).pop() || '';
          movieTitle = movieTitle.replace(/[-_]/g, ' ');
        } catch (e) {}
      }

      const finalQuery = movieTitle || 'Inception';
      const input = document.getElementById('subSearchInput');
      if (input) input.value = finalQuery;
      showToast(`🎬 تم استخراج: "${finalQuery}" - جاري جلب الترجمة...`);
      searchArabicSubtitles(finalQuery);
    });
  } else {
    // في مشغل الفيديو المباشر
    const url = videoUrlInput.value || '';
    let fileName = url.split('/').pop().split('?')[0].replace(/\.(mp4|webm|mkv|m3u8)$/i, '').replace(/[-_]/g, ' ');
    const finalQuery = fileName || 'Big Buck Bunny';
    const input = document.getElementById('subSearchInput');
    if (input) input.value = finalQuery;
    showToast(`🎬 تم استخراج: "${finalQuery}" - جاري جلب الترجمة...`);
    searchArabicSubtitles(finalQuery);
  }
}

function renderSubtitlesResults(list) {
  const container = document.getElementById('subResultsList');
  if (!container) return;

  container.innerHTML = list.map(item => `
    <div class="sub-result-card" onclick="loadAndApplySubtitle('${escapeHtml(item.id)}', '${escapeHtml(item.title)}')">
      <div class="sub-result-title">🎬 ${escapeHtml(item.title)}</div>
      <div class="sub-result-meta">
        <span class="sub-result-lang">${escapeHtml(item.lang)}</span>
        <span>🏷️ ${escapeHtml(item.release)}</span>
        <span>${escapeHtml(item.rating || '⭐⭐⭐⭐⭐')}</span>
      </div>
    </div>
  `).join('');
}

async function loadAndApplySubtitle(subId, title) {
  showToast('⏳ جاري تحميل وتزامن ملف الترجمة...');

  try {
    const res = await fetch(`/api/subtitles/cues?id=${encodeURIComponent(subId)}&title=${encodeURIComponent(title)}`);
    const data = await res.json();

    if (data.success && data.cues) {
      activeSubtitle = {
        title: title,
        cues: data.cues,
        offset: 0
      };

      // مزامنة الترجمة مع باقي أعضاء القاعة
      socket.emit('sync-subtitle-track', {
        roomId: currentRoomId,
        title: title,
        cues: data.cues,
        offset: 0
      });

      updateActiveSubtitleUI();
      startSubtitleEngine();
      showToast(`✨ تم تفعيل الترجمة العربية: "${title}"`);
    }
  } catch (err) {
    console.error('Subtitle load error:', err);
    showToast('⚠️ تعذر تحميل الترجمة المختارة.');
  }
}

socket.on('subtitle-track-synced', ({ title, cues, offset, by }) => {
  activeSubtitle = { title, cues, offset: offset || 0 };
  updateActiveSubtitleUI();
  startSubtitleEngine();
  if (by) showToast(`📝 قام ${by} بتفعيل ترجمة: "${title}"`);
});

function updateActiveSubtitleUI() {
  const card = document.getElementById('activeSubCard');
  const titleEl = document.getElementById('activeSubTitle');
  const offsetVal = document.getElementById('subOffsetVal');

  if (activeSubtitle && activeSubtitle.cues && activeSubtitle.cues.length > 0) {
    if (card) card.classList.remove('hidden');
    if (titleEl) titleEl.innerText = activeSubtitle.title || 'ترجمة عربية متزامنة';
    if (offsetVal) offsetVal.innerText = `${activeSubtitle.offset >= 0 ? '+' : ''}${activeSubtitle.offset.toFixed(1)}ث`;
  } else {
    if (card) card.classList.add('hidden');
  }
}

function adjustSubtitleOffset(delta) {
  if (!activeSubtitle || !activeSubtitle.cues) return;
  activeSubtitle.offset = Math.round((activeSubtitle.offset + delta) * 10) / 10;
  updateActiveSubtitleUI();

  socket.emit('sync-subtitle-track', {
    roomId: currentRoomId,
    title: activeSubtitle.title,
    cues: activeSubtitle.cues,
    offset: activeSubtitle.offset
  });

  showToast(`⏱️ تم ضبط توقيت الترجمة: ${activeSubtitle.offset >= 0 ? '+' : ''}${activeSubtitle.offset}s`);
}

function resetSubtitleOffset() {
  if (!activeSubtitle || !activeSubtitle.cues) return;
  activeSubtitle.offset = 0;
  updateActiveSubtitleUI();

  socket.emit('sync-subtitle-track', {
    roomId: currentRoomId,
    title: activeSubtitle.title,
    cues: activeSubtitle.cues,
    offset: 0
  });

  showToast('🔄 تم إعادة ضبط توقيت الترجمة إلى 0.0s');
}

function removeActiveSubtitle() {
  activeSubtitle = { title: '', cues: [], offset: 0 };
  updateActiveSubtitleUI();
  const overlay = document.getElementById('cinemaSubOverlay');
  if (overlay) overlay.innerHTML = '';

  socket.emit('sync-subtitle-track', {
    roomId: currentRoomId,
    title: '',
    cues: [],
    offset: 0
  });

  showToast('✕ تم إلغاء تفعيل الترجمة');
}

function changeSubFontSize(size) {
  document.documentElement.style.setProperty('--sub-font-size', size);
}

function changeSubColor(color) {
  document.documentElement.style.setProperty('--sub-color', color);
}

// محرك عرض نصوص الترجمة على الكانفاس المتزامن
function startSubtitleEngine() {
  if (subTickInterval) clearInterval(subTickInterval);

  subTickInterval = setInterval(() => {
    if (!activeSubtitle || !activeSubtitle.cues || activeSubtitle.cues.length === 0) return;

    let timeSec = 0;
    if (currentActiveMode === 'player') {
      timeSec = cinemaPlayer ? cinemaPlayer.currentTime : 0;
    } else {
      // في المتصفح الافتراضي، نعتمد على التوقيت التقديري المستمر
      currentEstimatedMediaTime += 0.2;
      timeSec = currentEstimatedMediaTime;
    }

    renderActiveCueAtTime(timeSec);
  }, 200);
}

function renderActiveCueAtTime(timeSec) {
  const overlay = document.getElementById('cinemaSubOverlay');
  if (!overlay) return;

  if (!activeSubtitle || !activeSubtitle.cues || activeSubtitle.cues.length === 0) {
    overlay.innerHTML = '';
    return;
  }

  const adjustedTime = timeSec + (activeSubtitle.offset || 0);
  const cue = activeSubtitle.cues.find(c => adjustedTime >= c.start && adjustedTime <= c.end);

  if (cue) {
    overlay.innerHTML = `<span class="cinema-sub-box">${escapeHtml(cue.text).replace(/\n/g, '<br>')}</span>`;
  } else {
    overlay.innerHTML = '';
  }
}

// إعادة مزامنة توقيت وسائط المتصفح الافتراضي عند طلب تقديم أو تأخير
socket.on('browser-media-synced', ({ action, value }) => {
  if (action === 'seek-forward') currentEstimatedMediaTime += (value || 10);
  if (action === 'seek-backward') currentEstimatedMediaTime = Math.max(0, currentEstimatedMediaTime - (value || 10));
});

// تحديث العداد وشريط الوصول السريع وإضاءة السينما وعناصر التحكم البصري فور تحميل الصفحة
updateFavoritesBadge();
renderQuickAccess();
initAmbientBrightness();
initCanvasVisualControls();
