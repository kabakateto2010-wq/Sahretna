const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
let virtualBrowser;
try {
  virtualBrowser = require('./virtualBrowser');
} catch (e) {
  console.warn('[Server] Virtual browser disabled:', e.message);
  virtualBrowser = {
    getOrLaunchBrowser: async () => {},
    closeBrowser: async () => {},
    navigate: async () => {},
    reload: async () => {},
    goBack: async () => {},
    goForward: async () => {},
    dispatchMouse: async () => {},
    dispatchKey: async () => {}
  };
}
const subtitleService = require('./subtitleService');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 📝 API للبحث التلقائي عن الترجمات العربية للأفلام
app.get('/api/subtitles/search', async (req, res) => {
  try {
    const query = req.query.query || '';
    const results = await subtitleService.searchSubtitles(query);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, results: [] });
  }
});

// 📝 API لجلب نصوص وتوقيتات الترجمة (Cues)
app.get('/api/subtitles/cues', async (req, res) => {
  try {
    const subId = req.query.id || '';
    const title = req.query.title || '';
    const cues = await subtitleService.getSubtitleCues(subId, title);
    res.json({ success: true, cues });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, cues: [] });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// تخزين حالات قاعات السينما في الذاكرة
const rooms = {};

function getEstimatedCurrentTime(videoState) {
  if (!videoState.isPlaying) {
    return videoState.currentTime;
  }
  const elapsedSec = (Date.now() - videoState.lastUpdated) / 1000;
  return videoState.currentTime + (elapsedSec * (videoState.playbackRate || 1));
}

io.on('connection', (socket) => {
  // 1. الانضمام إلى قاعة سينما
  socket.on('join-room', async ({ roomId, username, avatar }) => {
    const cleanRoomId = (roomId || 'cinema-main').trim().toLowerCase();
    const cleanName = (username || 'صديق السينما').trim().substring(0, 25);
    const userAvatar = avatar || '🍿';

    socket.join(cleanRoomId);
    socket.roomId = cleanRoomId;
    socket.username = cleanName;
    socket.avatar = userAvatar;

    if (!rooms[cleanRoomId]) {
      rooms[cleanRoomId] = {
        id: cleanRoomId,
        hostId: socket.id,
        hostOnlyControl: false,
        activeMode: 'browser',
        browserUrl: 'https://www.google.com',
        browserQuality: 'high',
        videoState: {
          sourceType: 'url',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          fileName: '',
          currentTime: 0,
          isPlaying: false,
          playbackRate: 1,
          lastUpdated: Date.now()
        },
        voiceUsers: {},
        activeSubtitle: null,
        maxUsers: 5,
        users: [],
        chatHistory: []
      };
    }

    const room = rooms[cleanRoomId];
    if (!room.voiceUsers) room.voiceUsers = {};
    if (!room.maxUsers) room.maxUsers = 5;
    const isHost = room.hostId === socket.id || room.users.length === 0;
    if (isHost) room.hostId = socket.id;

    // التحقق من الحد الأقصى للمشاهدين في القاعة
    if (!isHost && room.users.length >= room.maxUsers) {
      socket.emit('room-capacity-full', {
        maxUsers: room.maxUsers,
        message: `⚠️ عذراً، اكتمل العدد الأقصى المسموح به للمشاهدة في هذه القاعة (${room.maxUsers} أصدقاء).`
      });
      return;
    }

    const userData = {
      id: socket.id,
      name: cleanName,
      avatar: userAvatar,
      isHost: isHost
    };

    room.users.push(userData);

    const syncState = {
      roomId: cleanRoomId,
      isHost: isHost,
      hostId: room.hostId,
      hostOnlyControl: room.hostOnlyControl,
      activeMode: room.activeMode,
      browserUrl: room.browserUrl,
      browserQuality: room.browserQuality || 'high',
      videoState: {
        ...room.videoState,
        currentTime: getEstimatedCurrentTime(room.videoState)
      },
      voiceUsers: Object.values(room.voiceUsers),
      activeSubtitle: room.activeSubtitle,
      maxUsers: room.maxUsers || 5,
      users: room.users,
      chatHistory: room.chatHistory.slice(-50)
    };

    socket.emit('sync-state', syncState);
    socket.to(cleanRoomId).emit('user-joined', userData);
    io.to(cleanRoomId).emit('user-list', room.users);

    const welcomeMsg = {
      id: 'sys_' + Date.now(),
      system: true,
      text: `انضم ${cleanName} إلى قاعة السهرة 🍿`,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };
    room.chatHistory.push(welcomeMsg);
    io.to(cleanRoomId).emit('new-message', welcomeMsg);

    // تشغيل المتصفح الافتراضي السحابي للقاعة فوراً إذا لم يكن يعمل
    try {
      await virtualBrowser.getOrLaunchBrowser(cleanRoomId, io);
    } catch (err) {
      console.error('[Server] خطأ في تشغيل المتصفح الافتراضي:', err.message);
    }
  });

  // 2. أحداث المتصفح الافتراضي (Virtual Browser Events)
  socket.on('browser-navigate', async ({ roomId, url }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.hostOnlyControl && socket.id !== room.hostId) {
      socket.emit('action-denied', { reason: 'التحكم في المتصفح مقصور على المضيف حالياً.' });
      return;
    }

    room.browserUrl = url;
    await virtualBrowser.navigate(roomId, url, io);
  });

  socket.on('browser-back', async ({ roomId }) => {
    await virtualBrowser.goBack(roomId, io);
  });

  socket.on('browser-forward', async ({ roomId }) => {
    await virtualBrowser.goForward(roomId, io);
  });

  socket.on('browser-reload', async ({ roomId }) => {
    await virtualBrowser.reload(roomId, io);
  });

  socket.on('browser-mouse', async (data) => {
    const { roomId, event } = data;
    const room = rooms[roomId];
    if (room && room.hostOnlyControl && socket.id !== room.hostId) return;
    await virtualBrowser.dispatchMouse(roomId, event);
  });

  socket.on('browser-key', async (data) => {
    const { roomId, event } = data;
    const room = rooms[roomId];
    if (room && room.hostOnlyControl && socket.id !== room.hostId) return;
    await virtualBrowser.dispatchKey(roomId, event);
  });

  socket.on('change-browser-quality', async ({ roomId, quality }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.hostOnlyControl && socket.id !== room.hostId) {
      socket.emit('action-denied', { reason: 'تغيير جودة المتصفح مقصور على المضيف حالياً.' });
      return;
    }

    room.browserQuality = quality;
    await virtualBrowser.setQuality(roomId, quality);
    io.to(roomId).emit('browser-quality-updated', { quality, by: socket.username });
  });

  socket.on('browser-media-control', async ({ roomId, action, value }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.hostOnlyControl && socket.id !== room.hostId) {
      socket.emit('action-denied', { reason: 'التحكم في وسائط الفيلم مقصور على المضيف حالياً.' });
      return;
    }

    await virtualBrowser.controlMedia(roomId, action, value);
    socket.to(roomId).emit('browser-media-synced', { action, value, by: socket.username });
  });

  // طلب معلومات الفيلم الحالية لحفظه في المفضلة
  socket.on('get-movie-meta', async ({ roomId }, callback) => {
    try {
      const meta = await virtualBrowser.getPageMeta(roomId);
      if (typeof callback === 'function') {
        callback(meta || { url: '', title: 'فيلم سينمائي', poster: null });
      }
    } catch (e) {
      if (typeof callback === 'function') callback(null);
    }
  });

  // 3. تبديل وضع العرض
  socket.on('switch-mode', ({ roomId, mode }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.activeMode = mode;
    socket.to(roomId).emit('sync-mode-switch', { mode });
  });

  // 4. أوامر مشغل الفيديو المباشر
  socket.on('video-action', (data) => {
    const { roomId, action, time, url, sourceType, fileName, rate } = data;
    const room = rooms[roomId];
    if (!room) return;

    if (room.hostOnlyControl && socket.id !== room.hostId) {
      socket.emit('action-denied', { reason: 'التحكم مقصور على المضيف حالياً.' });
      return;
    }

    const v = room.videoState;
    if (sourceType) v.sourceType = sourceType;
    if (url !== undefined) v.url = url;
    if (fileName !== undefined) v.fileName = fileName;
    if (time !== undefined) v.currentTime = time;
    if (rate !== undefined) v.playbackRate = rate;

    if (action === 'play') {
      v.isPlaying = true;
      v.lastUpdated = Date.now();
    } else if (action === 'pause') {
      v.isPlaying = false;
      v.lastUpdated = Date.now();
    } else if (action === 'seek') {
      v.lastUpdated = Date.now();
    }

    socket.to(roomId).emit('sync-action', {
      action,
      time: v.currentTime,
      url: v.url,
      sourceType: v.sourceType,
      fileName: v.fileName,
      rate: v.playbackRate,
      by: socket.username
    });
  });

  // 5. قفل / فتح التحكم للمضيف
  socket.on('toggle-host-control', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;

    room.hostOnlyControl = !room.hostOnlyControl;
    io.to(roomId).emit('room-settings-updated', {
      hostOnlyControl: room.hostOnlyControl,
      updatedBy: socket.username
    });

    const msg = {
      id: 'sys_' + Date.now(),
      system: true,
      text: room.hostOnlyControl
        ? `🔒 جعل المضيف التحكم في التصفح والعرض حصرياً له.`
        : `🔓 تم فتح صلاحية التحكم في التصفح والعرض لجميع المتواجدين.`,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };
    room.chatHistory.push(msg);
    io.to(roomId).emit('new-message', msg);
  });

  // 5.1 ضبط الحد الأقصى لعدد المشاهدين في القاعة من قِبل المضيف
  socket.on('set-max-users', ({ roomId, maxUsers }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;

    const count = Math.max(2, Math.min(25, parseInt(maxUsers, 10) || 5));
    room.maxUsers = count;
    io.to(roomId).emit('room-limit-updated', { maxUsers: count });

    const msg = {
      id: 'sys_' + Date.now(),
      system: true,
      text: `👥 حدد المضيف الحد الأقصى للحضور بـ [${count} أصدقاء] لضمان أعلى سرعة وسلاسة في البث.`,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };
    room.chatHistory.push(msg);
    io.to(roomId).emit('new-message', msg);
  });

  // 6. الدردشة
  socket.on('chat-message', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room || !message || !message.trim()) return;

    const chatMsg = {
      id: 'msg_' + Date.now() + Math.random().toString(36).substring(2, 6),
      user: socket.username,
      userId: socket.id,
      text: message.trim().substring(0, 500),
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      system: false
    };

    room.chatHistory.push(chatMsg);
    if (room.chatHistory.length > 100) room.chatHistory.shift();
    io.to(roomId).emit('new-message', chatMsg);
  });

  // 7. التفاعلات الحية
  socket.on('send-reaction', ({ roomId, emoji }) => {
    if (!rooms[roomId]) return;
    io.to(roomId).emit('floating-reaction', {
      emoji: emoji || '🍿',
      from: socket.username,
      id: Date.now() + Math.random()
    });
  });

  // 8. الغرفة الصوتية المباشرة (Live WebRTC Voice Chat)
  socket.on('voice-join', ({ roomId }) => {
    const targetRoomId = roomId || socket.roomId;
    const room = rooms[targetRoomId];
    if (!room) return;
    if (!room.voiceUsers) room.voiceUsers = {};

    const voiceUser = {
      id: socket.id,
      name: socket.username || 'صديق السينما',
      avatar: socket.avatar || '🍿',
      isMuted: false,
      isDeafened: false,
      isSpeaking: false
    };

    room.voiceUsers[socket.id] = voiceUser;

    // إرسال قائمة المتصلين بالصوت حالياً للمنضم الجديد
    socket.emit('voice-users-list', Object.values(room.voiceUsers));

    // إشعار بقية المتصلين في القاعة بانضمام عضو جديد للروم الصوتي
    socket.to(targetRoomId).emit('user-joined-voice', voiceUser);

    const voiceMsg = {
      id: 'sys_' + Date.now(),
      system: true,
      text: `🎙️ انضم ${voiceUser.name} إلى الروم الصوتي.`,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };
    room.chatHistory.push(voiceMsg);
    io.to(targetRoomId).emit('new-message', voiceMsg);
  });

  socket.on('voice-leave', ({ roomId }) => {
    const targetRoomId = roomId || socket.roomId;
    const room = rooms[targetRoomId];
    if (!room || !room.voiceUsers) return;

    if (room.voiceUsers[socket.id]) {
      delete room.voiceUsers[socket.id];
      io.to(targetRoomId).emit('user-left-voice', { userId: socket.id, username: socket.username });
    }
  });

  // ترحيل إشارات WebRTC (Offer, Answer, ICE Candidates) مباشرة للطرف الآخر
  socket.on('voice-signal', ({ to, signal }) => {
    io.to(to).emit('voice-signal', {
      from: socket.id,
      signal: signal
    });
  });

  // مزامنة حالة المايك والتحدث الحي (Speaking / Mute / Deafen)
  socket.on('voice-state', ({ roomId, isMuted, isDeafened, isSpeaking }) => {
    const targetRoomId = roomId || socket.roomId;
    const room = rooms[targetRoomId];
    if (room && room.voiceUsers && room.voiceUsers[socket.id]) {
      if (isMuted !== undefined) room.voiceUsers[socket.id].isMuted = isMuted;
      if (isDeafened !== undefined) room.voiceUsers[socket.id].isDeafened = isDeafened;
      if (isSpeaking !== undefined) room.voiceUsers[socket.id].isSpeaking = isSpeaking;

      socket.to(targetRoomId).emit('user-voice-state', {
        userId: socket.id,
        isMuted,
        isDeafened,
        isSpeaking
      });
    }
  });

  // 9. مزامنة الترجمة المختارة بين جميع الحضور (Synced Subtitles)
  socket.on('sync-subtitle-track', ({ roomId, title, cues, offset }) => {
    const room = rooms[roomId];
    if (room) {
      room.activeSubtitle = { title, cues, offset: offset || 0 };
      socket.to(roomId).emit('subtitle-track-synced', {
        title,
        cues,
        offset: offset || 0,
        by: socket.username
      });
    }
  });

  // 10. مغادرة المستخدم
  socket.on('disconnect', async () => {
    const { roomId } = socket;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    room.users = room.users.filter(u => u.id !== socket.id);

    // تنظيف المستخدم من الروم الصوتي إذا كان متصلاً
    if (room.voiceUsers && room.voiceUsers[socket.id]) {
      delete room.voiceUsers[socket.id];
      io.to(roomId).emit('user-left-voice', { userId: socket.id, username: socket.username });
    }

    if (room.hostId === socket.id && room.users.length > 0) {
      room.hostId = room.users[0].id;
      room.users[0].isHost = true;
      io.to(room.hostId).emit('promoted-to-host');
      io.to(roomId).emit('new-message', {
        id: 'sys_' + Date.now(),
        system: true,
        text: `👑 تم تعيين ${room.users[0].name} كمضيف جديد للقاعة.`,
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      });
    }

    io.to(roomId).emit('user-list', room.users);

    if (room.users.length === 0) {
      delete rooms[roomId];
      await virtualBrowser.closeBrowser(roomId);
    }
  });
});

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🍿 Hyperbeam Cinema Sync Server is running!`);
    console.log(`🚀 URL: http://localhost:${PORT}`);
    console.log(`===============================================`);
  });
}

module.exports = app;
