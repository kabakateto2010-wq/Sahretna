// ==========================================
// 🍿 Hyperbeam Cinema Sync - Client App
// ==========================================

const socket = io();
const player = document.getElementById('cinemaPlayer');

// حالة التطبيق المحلية
let currentRoomId = '';
let currentUsername = '';
let isHost = false;
let hostOnlyControl = false;
let isSyncing = false; // راية لمنع التكرار اللانهائي للأوامر
let activeStream = null; // لمشاركة الشاشة

// عناصر الواجهة
const urlBarContainer = document.getElementById('urlBarContainer');
const videoUrlInput = document.getElementById('videoUrlInput');
const localFileInput = document.getElementById('localFileInput');
const subtitleFileInput = document.getElementById('subtitleFileInput');
const roomCodeBadge = document.getElementById('roomCodeBadge');
const hostControlBtn = document.getElementById('hostControlBtn');
const syncToast = document.getElementById('syncToast');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const usersList = document.getElementById('usersList');
const usersCountBadge = document.getElementById('usersCountBadge');
const reactionsBox = document.getElementById('reactionsBox');
const welcomeModal = document.getElementById('welcomeModal');
const usernameInput = document.getElementById('usernameInput');
const customRoomInput = document.getElementById('customRoomInput');

// 1. استخراج الغرفة من الرابط URL
const urlParams = new URLSearchParams(window.location.search);
const initialRoomFromUrl = urlParams.get('room');

if (initialRoomFromUrl) {
  customRoomInput.value = initialRoomFromUrl;
}

// دالة الدخول للقاعة
function enterCinema(isNewRoom = false) {
  let name = usernameInput.value.trim();
  if (!name) {
    name = 'صديق_' + Math.floor(Math.random() * 900 + 100);
  }

  let room = customRoomInput.value.trim();
  if (isNewRoom || !room) {
    room = 'sahra-' + Math.floor(Math.random() * 9000 + 1000);
  }

  currentUsername = name;
  currentRoomId = room;

  // تحديث الرابط في المتصفح دون إعادة تحميل الصفحة
  const newUrl = `${window.location.pathname}?room=${currentRoomId}`;
  window.history.pushState({ path: newUrl }, '', newUrl);

  // إخفاء نافذة الترحيب
  welcomeModal.style.display = 'none';

  // تحديث الشارة
  roomCodeBadge.innerHTML = `<span>🍿</span><span>قاعة: ${currentRoomId}</span><small style="opacity:0.7">(نسخ الرابط)</small>`;

  // إرسال طلب الانضمام للسيرفر
  socket.emit('join-room', {
    roomId: currentRoomId,
    username: currentUsername,
    avatar: '🍿'
  });
}

// نسخ رابط الدعوة
function copyInviteLink() {
  const inviteUrl = window.location.href;
  navigator.clipboard.writeText(inviteUrl).then(() => {
    showToast('📋 تم نسخ رابط دعوة السهرة بنجاح!');
  });
}

// إظهار إشعار Toast سريع
function showToast(text, duration = 3000) {
  syncToast.innerHTML = text;
  syncToast.classList.add('show');
  setTimeout(() => {
    syncToast.classList.remove('show');
  }, duration);
}

// ==========================================
// 2. أحداث المشغل ومزامنتها لحظياً
// ==========================================

player.addEventListener('play', () => {
  if (isSyncing) return;
  socket.emit('video-action', {
    roomId: currentRoomId,
    action: 'play',
    time: player.currentTime
  });
});

player.addEventListener('pause', () => {
  if (isSyncing) return;
  socket.emit('video-action', {
    roomId: currentRoomId,
    action: 'pause',
    time: player.currentTime
  });
});

player.addEventListener('seeked', () => {
  if (isSyncing) return;
  socket.emit('video-action', {
    roomId: currentRoomId,
    action: 'seek',
    time: player.currentTime
  });
});

player.addEventListener('ratechange', () => {
  if (isSyncing) return;
  socket.emit('video-action', {
    roomId: currentRoomId,
    action: 'rate',
    rate: player.playbackRate,
    time: player.currentTime
  });
});

// ==========================================
// 3. استقبال أحداث السيرفر (Socket Listeners)
// ==========================================

// مزامنة الحالة الكاملة عند أول دخول
socket.on('sync-state', (state) => {
  isHost = state.isHost;
  hostOnlyControl = state.hostOnlyControl;
  updateHostControlsUI();

  const v = state.videoState;
  if (v.url && player.src !== v.url && v.sourceType === 'url') {
    isSyncing = true;
    player.src = v.url;
    videoUrlInput.value = v.url;
  }

  // مزامنة الوقت إذا كان هناك فارق
  if (Math.abs(player.currentTime - v.currentTime) > 0.5) {
    player.currentTime = v.currentTime;
  }

  if (v.isPlaying) {
    player.play().catch(() => {
      showToast('⚠️ انقر في أي مكان بالشاشة لتفعيل الصوت والتزامن');
    });
  }

  setTimeout(() => { isSyncing = false; }, 500);

  // تحميل الشات المسبق
  chatMessages.innerHTML = '';
  if (state.chatHistory) {
    state.chatHistory.forEach(appendMessage);
  }
});

// استقبال أوامر الفيديو اللحظية من باقي الأصدقاء
socket.on('sync-action', (data) => {
  isSyncing = true;
  const { action, time, url, sourceType, fileName, rate, by } = data;

  if (url && sourceType === 'url' && player.src !== url) {
    player.src = url;
    videoUrlInput.value = url;
    showToast(`🎬 ${by} قام بتغيير الفيلم`);
  }

  if (sourceType === 'local' && fileName) {
    showToast(`📁 ${by} يشغل ملفاً محلياً: [${fileName}]. اختر نفس الملف من جهازك!`, 5000);
  }

  // تصحيح التوقيت إذا كان الفارق أكثر من نصف ثانية
  if (time !== undefined && Math.abs(player.currentTime - time) > 0.45) {
    player.currentTime = time;
  }

  if (rate) {
    player.playbackRate = rate;
  }

  if (action === 'play') {
    player.play().catch(() => {});
    showToast(`▶️ ${by} استأنف العرض`);
  } else if (action === 'pause') {
    player.pause();
    showToast(`⏸️ ${by} أوقف العرض مؤقتاً`);
  } else if (action === 'seek') {
    showToast(`⏩ ${by} قفز بالتوقيت إلى ${formatTime(time)}`);
  }

  setTimeout(() => {
    isSyncing = false;
  }, 400);
});

// رفض الأمر إذا كانت القاعة مقفلة للمضيف
socket.on('action-denied', (data) => {
  showToast(`🔒 ${data.reason}`);
});

// تحديث إعدادات القاعة
socket.on('room-settings-updated', (settings) => {
  hostOnlyControl = settings.hostOnlyControl;
  updateHostControlsUI();
});

// ترقية المضيف عند خروج المضيف السابق
socket.on('promoted-to-host', () => {
  isHost = true;
  updateHostControlsUI();
  showToast('👑 أصبحت أنت الآن المضيف الرسمي للقاعة!');
});

// تحديث قائمة المتصلين
socket.on('user-list', (users) => {
  usersCountBadge.innerText = users.length;
  usersList.innerHTML = users.map(u => `
    <div class="user-card">
      <div class="user-info">
        <span class="user-avatar">${u.avatar || '🍿'}</span>
        <span class="user-name">${escapeHtml(u.name)} ${u.id === socket.id ? '(أنت)' : ''}</span>
      </div>
      ${u.isHost ? '<span class="host-badge">مضيف 👑</span>' : ''}
    </div>
  `).join('');
});

// استقبال رسالة دردشة جديدة
socket.on('new-message', (msg) => {
  appendMessage(msg);
});

// استقبال تفاعل طافي (Floating Reaction)
socket.on('floating-reaction', ({ emoji }) => {
  createFloatingReaction(emoji);
});

// ==========================================
// 4. وظائف تغيير مصادر الوسائط
// ==========================================

// تغيير رابط الفيديو المباشر / كلاود
function applyVideoUrl() {
  const url = videoUrlInput.value.trim();
  if (!url) return;

  isSyncing = true;
  player.srcObject = null; // إيقاف مشاركة الشاشة إن وجدت
  player.src = url;
  player.play().catch(() => {});

  socket.emit('video-action', {
    roomId: currentRoomId,
    action: 'play',
    sourceType: 'url',
    url: url,
    time: 0
  });

  setTimeout(() => { isSyncing = false; }, 400);
  showToast('🎬 تم تحميل الفيديو بنجاح');
}

// تشغيل ملف محلي من الموبايل أو الكمبيوتر
function handleLocalFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const fileUrl = URL.createObjectURL(file);
  isSyncing = true;
  player.srcObject = null;
  player.src = fileUrl;
  player.play().catch(() => {});

  socket.emit('video-action', {
    roomId: currentRoomId,
    action: 'play',
    sourceType: 'local',
    fileName: file.name,
    time: 0
  });

  setTimeout(() => { isSyncing = false; }, 400);
  showToast(`📁 تم تشغيل الملف المحلي: ${file.name}`);
}

// مشاركة الشاشة بنقرة زر وبثها بصوت النظام (Screen Share)
async function startScreenShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: true
    });

    activeStream = stream;
    player.src = '';
    player.srcObject = stream;
    player.play();

    showToast('🖥️ تم بدء مشاركة الشاشة بصوت النظام!');

    // عند إيقاف المشاركة من المتصفح
    stream.getVideoTracks()[0].onended = () => {
      showToast('🛑 تم إنهاء مشاركة الشاشة');
      player.srcObject = null;
    };
  } catch (err) {
    console.error(err);
    showToast('❌ لم يتم تفعيل مشاركة الشاشة أو تم إلغاؤها');
  }
}

// تحميل ملف ترجمة خارجي (SRT أو VTT)
function handleSubtitleFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    let content = evt.target.result;

    // إذا كان الملف SRT نحوله تلقائياً لـ WebVTT
    if (file.name.endsWith('.srt')) {
      content = 'WEBVTT\n\n' + content
        .replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
    }

    const vttBlob = new Blob([content], { type: 'text/vtt' });
    const trackUrl = URL.createObjectURL(vttBlob);

    // إزالة التراكات السابقة
    const oldTracks = player.querySelectorAll('track');
    oldTracks.forEach(t => t.remove());

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = file.name;
    track.srclang = 'ar';
    track.src = trackUrl;
    track.default = true;
    player.appendChild(track);

    showToast(`💬 تم تفعيل ملف الترجمة: ${file.name}`);
  };
  reader.readAsText(file);
}

// تبديل قفل تحكم المضيف
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

// ==========================================
// 5. نظام الدردشة والتفاعلات الحية
// ==========================================

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  socket.emit('chat-message', {
    roomId: currentRoomId,
    message: text
  });

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

// إرسال تفاعل حركي طافٍ (Floating Reaction)
function sendReaction(emoji) {
  socket.emit('send-reaction', {
    roomId: currentRoomId,
    emoji: emoji
  });
}

function createFloatingReaction(emoji) {
  const el = document.createElement('div');
  el.className = 'reaction-bubble';
  el.innerText = emoji;
  el.style.right = `${Math.floor(Math.random() * 80)}px`;
  reactionsBox.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 2800);
}

// تبديل تبويبات القائمة الجانبية (شات / حضور)
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

// أدوات مساعدة
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m];
  });
}
