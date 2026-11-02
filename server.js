const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// تخزين حالات قاعات السينما في الذاكرة
// Room Schema:
// rooms[roomId] = {
//   id: string,
//   hostId: string,
//   hostOnlyControl: boolean,
//   videoState: {
//     sourceType: 'url' | 'local' | 'screen',
//     url: string,
//     fileName: string,
//     currentTime: number,
//     isPlaying: boolean,
//     playbackRate: number,
//     lastUpdated: number
//   },
//   users: [{ id, name, isHost, avatar }],
//   chatHistory: []
// }
const rooms = {};

// دالة لحساب الوقت الحالي التقديري للفيديو مع مراعاة سرعة التشغيل
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

    // إذا كانت القاعة غير موجودة يتم إنشاؤها وتعيين المستخدم كمضيف (Host)
    if (!rooms[cleanRoomId]) {
      rooms[cleanRoomId] = {
        id: cleanRoomId,
        hostId: socket.id,
        hostOnlyControl: false,
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

    // إرسال حالة القاعة الحالية بدقة للمستخدم الجديد
    const syncState = {
      roomId: cleanRoomId,
      isHost: isHost,
      hostId: room.hostId,
      hostOnlyControl: room.hostOnlyControl,
      videoState: {
        ...room.videoState,
        currentTime: getEstimatedCurrentTime(room.videoState)
      },
      users: room.users,
      chatHistory: room.chatHistory.slice(-50)
    };

    socket.emit('sync-state', syncState);

    // إشعار باقي المتصلين بانضمام الصديق الجديد وتحديث قائمة الحضور
    socket.to(cleanRoomId).emit('user-joined', userData);
    io.to(cleanRoomId).emit('user-list', room.users);

    // رسالة نظام في الشات
    const welcomeMsg = {
      id: 'sys_' + Date.now(),
      system: true,
      text: `انضم ${cleanName} إلى قاعة السهرة 🍿`,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };
    room.chatHistory.push(welcomeMsg);
    io.to(cleanRoomId).emit('new-message', welcomeMsg);
  });

  // 2. استقبال أوامر التحكم في الفيديو ومزامنتها لحظياً
  socket.on('video-action', (data) => {
    const { roomId, action, time, url, sourceType, fileName, rate } = data;
    const room = rooms[roomId];
    if (!room) return;

    // التحقق من صلاحية التحكم إذا كانت القاعة مقفلة للمضيف فقط
    if (room.hostOnlyControl && socket.id !== room.hostId) {
      socket.emit('action-denied', {
        reason: 'التحكم مقصور على منشئ القاعة (المضيف) حالياً.'
      });
      return;
    }

    // تحديث حالة الفيديو في الغرفة
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

    // بث الأمر فوراً لجميع المتصلين في الغرفة ما عدا المرسل
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

  // 3. قفل / فتح التحكم للمضيف فقط
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
        ? `🔒 جعل المضيف التحكم في العرض حصرياً له.`
        : `🔓 تم فتح صلاحية التحكم في العرض لجميع المتواجدين.`,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
    };
    room.chatHistory.push(msg);
    io.to(roomId).emit('new-message', msg);
  });

  // 4. المحادثة اللحظية
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

  // 5. التفاعلات التعبيرية الحية المتطايرة (Reactions: 🍿 😂 ❤️ 😱 🔥 👏)
  socket.on('send-reaction', ({ roomId, emoji }) => {
    if (!rooms[roomId]) return;
    io.to(roomId).emit('floating-reaction', {
      emoji: emoji || '🍿',
      from: socket.username,
      id: Date.now() + Math.random()
    });
  });

  // 6. إشارات WebRTC للبث المباشر ومشاركة الشاشة P2P
  socket.on('webrtc-signal', ({ roomId, targetId, signal, type }) => {
    if (targetId) {
      io.to(targetId).emit('webrtc-signal', {
        senderId: socket.id,
        signal,
        type
      });
    } else {
      socket.to(roomId).emit('webrtc-signal', {
        senderId: socket.id,
        signal,
        type
      });
    }
  });

  // 7. معالجة مغادرة المستخدم
  socket.on('disconnect', () => {
    const { roomId } = socket;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    room.users = room.users.filter(u => u.id !== socket.id);

    // إذا خرج المضيف وكانت الغرفة لا تزال بها أشخاص، يتم ترقية أول شخص كمضيف جديد
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

    // حذف الغرفة تلقائياً إذا أصبحت فارغة تماماً
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
