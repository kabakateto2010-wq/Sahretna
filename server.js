const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// 🌐 خادم وسيط ذكي (Reverse Proxy) لكسر قيود المواقع وفتحها داخل المتصفح
// يقوم بحذف ترويسات X-Frame-Options و CSP للسماح بفتح المواقع داخل القاعة
// =========================================================================
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('رابط غير صالح');
  }

  try {
    let cleanUrl = targetUrl;
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    const response = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
      }
    });

    const contentType = response.headers.get('content-type') || '';

    // إزالة ترويسات الحماية التي تمنع التضمين
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (contentType.includes('text/html')) {
      let html = await response.text();

      // حقن <base> حتى تعمل الروابط والصور والملفات التابعة للموقع الأصلي
      const baseTag = `<base href="${cleanUrl}">`;

      // حقن سكريبت الجسر لمزامنة الفيديو في الموقع تلقائياً
      const bridgeScript = `
        <script>
          window.addEventListener('load', () => {
            console.log('[Hyperbeam Cinema Bridge] تم ربط الموقع بنجاح');
            setInterval(() => {
              const video = document.querySelector('video');
              if (video && !video.__cinemaAttached) {
                video.__cinemaAttached = true;
                video.addEventListener('play', () => window.parent.postMessage({ type: 'SYNC_PLAY', time: video.currentTime }, '*'));
                video.addEventListener('pause', () => window.parent.postMessage({ type: 'SYNC_PAUSE', time: video.currentTime }, '*'));
                video.addEventListener('seeked', () => window.parent.postMessage({ type: 'SYNC_SEEK', time: video.currentTime }, '*'));
              }
            }, 1000);
          });
        </script>
      `;

      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}${bridgeScript}`);
      } else {
        html = baseTag + bridgeScript + html;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    } else {
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      return res.send(Buffer.from(buffer));
    }
  } catch (err) {
    console.error('Proxy Error:', err.message);
    res.status(500).send(`تعذر تحميل الموقع عبر الوسيط: ${err.message}`);
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

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
  socket.on('join-room', ({ roomId, username, avatar }) => {
    const cleanRoomId = (roomId || 'cinema-main').trim().toLowerCase();
    const cleanName = (username || 'صديق السينما').trim().substring(0, 25);
    const userAvatar = avatar || '🍿';

    socket.join(cleanRoomId);
    socket.roomId = cleanRoomId;
    socket.username = cleanName;

    if (!rooms[cleanRoomId]) {
      rooms[cleanRoomId] = {
        id: cleanRoomId,
        hostId: socket.id,
        hostOnlyControl: false,
        activeMode: 'browser',
        browserUrl: 'https://www.google.com',
        videoState: {
          sourceType: 'url',
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          fileName: '',
          currentTime: 0,
          isPlaying: false,
          playbackRate: 1,
          lastUpdated: Date.now()
        },
        users: [],
        chatHistory: []
      };
    }

    const room = rooms[cleanRoomId];
    const isHost = room.hostId === socket.id || room.users.length === 0;
    if (isHost) room.hostId = socket.id;

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
      videoState: {
        ...room.videoState,
        currentTime: getEstimatedCurrentTime(room.videoState)
      },
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
  });

  // 2. مزامنة تنقل المتصفح المفتوح (Browser Navigation Sync)
  socket.on('browser-navigate', ({ roomId, url }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.hostOnlyControl && socket.id !== room.hostId) {
      socket.emit('action-denied', { reason: 'التحكم في المتصفح مقصور على المضيف حالياً.' });
      return;
    }

    room.browserUrl = url;
    room.activeMode = 'browser';

    socket.to(roomId).emit('sync-browser-navigate', {
      url: url,
      by: socket.username
    });
  });

  // 3. تبديل وضع العرض
  socket.on('switch-mode', ({ roomId, mode }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.activeMode = mode;
    socket.to(roomId).emit('sync-mode-switch', { mode });
  });

  // 4. استقبال أوامر التحكم في الفيديو ومزامنتها لحظياً
  socket.on('video-action', (data) => {
    const { roomId, action, time, url, sourceType, fileName, rate } = data;
    const room = rooms[roomId];
    if (!room) return;

    if (room.hostOnlyControl && socket.id !== room.hostId) {
      socket.emit('action-denied', {
        reason: 'التحكم مقصور على منشئ القاعة (المضيف) حالياً.'
      });
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

  // 5. قفل / فتح التحكم للمضيف فقط
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

  // 6. المحادثة اللحظية
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

  // 7. التفاعلات التعبيرية الحية
  socket.on('send-reaction', ({ roomId, emoji }) => {
    if (!rooms[roomId]) return;
    io.to(roomId).emit('floating-reaction', {
      emoji: emoji || '🍿',
      from: socket.username,
      id: Date.now() + Math.random()
    });
  });

  // 8. إشارات WebRTC للبث المباشر
  socket.on('webrtc-signal', ({ roomId, targetId, signal, type }) => {
    if (targetId) {
      io.to(targetId).emit('webrtc-signal', { senderId: socket.id, signal, type });
    } else {
      socket.to(roomId).emit('webrtc-signal', { senderId: socket.id, signal, type });
    }
  });

  // 9. معالجة مغادرة المستخدم
  socket.on('disconnect', () => {
    const { roomId } = socket;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    room.users = room.users.filter(u => u.id !== socket.id);

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
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🍿 Hyperbeam Cinema Sync Server is running!`);
  console.log(`🚀 URL: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
