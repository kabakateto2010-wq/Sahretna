// ====================================================================
// 🍿 Hyperbeam Engine - High-Performance Stealth Browser
// ====================================================================
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const USER_DATA_DIR = path.join(__dirname, '.chrome-session');

if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

const roomBrowsers = {};

// إعدادات مستويات الجودة والسرعة
const QUALITY_PROFILES = {
  ultra: { quality: 92, width: 1920, height: 1080, frameInterval: 33, label: '💎 فائقة (1080p)' },
  high: { quality: 82, width: 1280, height: 720, frameInterval: 40, label: '✨ عالية (720p)' },
  medium: { quality: 65, width: 1280, height: 720, frameInterval: 50, label: '⚡ متوسطة (متوازنة)' },
  fast: { quality: 45, width: 960, height: 540, frameInterval: 70, label: '🚀 خفيفة (انترنت ضعيف)' }
};

async function getOrLaunchBrowser(roomId, io, profileName = 'high') {
  if (roomBrowsers[roomId] && roomBrowsers[roomId].isRunning) {
    return roomBrowsers[roomId];
  }

  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`Google Chrome غير موجود في المسار: ${CHROME_PATH}`);
  }

  const profile = QUALITY_PROFILES[profileName] || QUALITY_PROFILES.high;
  console.log(`[VirtualBrowser] تشغيل المتصفح عالي الأداء للقاعة: ${roomId} بجودة [${profile.label}]`);

  // تشغيل المتصفح مع دعم كامل لفك تشفير الفيديو بالعتاد (Hardware Acceleration)
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    userDataDir: path.join(USER_DATA_DIR, roomId),
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-gpu-rasterization',
      '--enable-zero-copy',
      '--ignore-gpu-blocklist',
      '--disable-blink-features=AutomationControlled',
      '--autoplay-policy=no-user-gesture-required',
      `--window-size=${profile.width},${profile.height}`,
      '--lang=ar-EG,ar,en-US,en',
      '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: profile.width, height: profile.height, deviceScaleFactor: 1 });

  // 1. حظر الإعلانات المزعجة وحذف الطبقات الشفافة الخفية (Click-Traps) تلقائياً
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['ar-EG', 'ar', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };

    // منع فتح إعلانات النوافذ المنبثقة (Popups) التي تجمد مشغلات الأفلام
    window.open = function () {
      console.log('[AdBlock] تم حظر نافذة إعلانية منبثقة');
      return null;
    };

    // إزالة طبقات اصطياد النقرات مثل adfox-cover والطبقات ذات z-index فلكي
    function killAdOverlays() {
      const badSelectors = [
        '#adfox-cover',
        '[id*="adfox"]',
        '[class*="adfox"]',
        'div[style*="z-index: 2147483647"]',
        'div[style*="z-index: 9999999"]',
        'div[style*="z-index:9999999"]',
        '.menuOver',
        '.slideMenu.open',
        '#trailerPopup'
      ];
      for (const sel of badSelectors) {
        document.querySelectorAll(sel).forEach(el => {
          try { el.remove(); } catch (e) {}
        });
      }

      // البحث عن أي عنصر fixed يغطي كامل الشاشة مع z-index ضخم
      document.querySelectorAll('div, a').forEach(el => {
        try {
          const s = window.getComputedStyle(el);
          const z = parseInt(s.zIndex, 10);
          if (s.position === 'fixed' && z > 50000 && (s.width === '100%' || s.width.includes('100vw') || s.inset === '0px')) {
            el.remove();
          }
        } catch (e) {}
      });
    }

    setInterval(killAdOverlays, 250);
    window.addEventListener('DOMContentLoaded', killAdOverlays);
    window.addEventListener('load', killAdOverlays);
  });

  const client = await page.target().createCDPSession();

  const sessionData = {
    browser,
    page,
    client,
    isRunning: true,
    quality: profileName,
    frameInterval: profile.frameInterval,
    lastUrl: 'https://duckduckgo.com',
    lastFrameTime: 0
  };

  roomBrowsers[roomId] = sessionData;

  // إغلاق أي تبويب إعلاني يحاول الموقع فتحه في الخلفية تلقائياً
  browser.on('targetcreated', async (target) => {
    if (target.type() === 'page') {
      try {
        const newPage = await target.page();
        if (newPage && newPage !== sessionData.page) {
          console.log('[AdBlock] إغلاق صفحة إعلانية تلقائية');
          await newPage.close();
        }
      } catch (e) {}
    }
  });

  // 2. استقبال إطارات البث مع تحكم تدفق ذكي وتهدئة معالج Chrome (Flow Control via Delayed ACK)
  client.on('Page.screencastFrame', async ({ data, sessionId }) => {
    try {
      const now = Date.now();
      const interval = sessionData.frameInterval || 40;
      const elapsed = now - sessionData.lastFrameTime;

      const sendAck = async () => {
        try {
          await client.send('Page.screencastFrameAck', { sessionId });
        } catch (e) {}
      };

      if (elapsed >= interval) {
        sessionData.lastFrameTime = now;
        io.to(roomId).emit('browser-frame', 'data:image/jpeg;base64,' + data);
        await sendAck();
      } else {
        // تأخير الـ ACK حتى الوصول لمعدل الفريمات المطلوب لمنع استهلاك 100% CPU
        setTimeout(sendAck, interval - elapsed);
      }
    } catch (e) {}
  });

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      sessionData.lastUrl = url;
      io.to(roomId).emit('sync-browser-url', { url });
    }
  });

  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: profile.quality,
    maxWidth: profile.width,
    maxHeight: profile.height,
    everyNthFrame: 1
  });

  try {
    await page.goto('https://duckduckgo.com', { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch (err) {}

  return sessionData;
}

// دالة تغيير الجودة مباشرة أثناء التشغيل
async function setQuality(roomId, profileName) {
  const session = roomBrowsers[roomId];
  if (!session || !session.client) return;

  const profile = QUALITY_PROFILES[profileName] || QUALITY_PROFILES.high;
  session.quality = profileName;
  session.frameInterval = profile.frameInterval;
  console.log(`[VirtualBrowser] [${roomId}] تغيير الجودة إلى: ${profile.label} (Quality: ${profile.quality}%, MaxFPS: ${Math.round(1000/profile.frameInterval)})`);

  try {
    await session.page.setViewport({ width: profile.width, height: profile.height, deviceScaleFactor: 1 });
    await session.client.send('Page.stopScreencast');
    await session.client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: profile.quality,
      maxWidth: profile.width,
      maxHeight: profile.height,
      everyNthFrame: 1
    });
  } catch (err) {
    console.error('Error changing screencast quality:', err.message);
  }
}

async function navigate(roomId, rawUrl, io) {
  const session = await getOrLaunchBrowser(roomId, io);
  let cleanUrl = rawUrl.trim();

  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    if (cleanUrl.includes('.') && !cleanUrl.includes(' ')) {
      cleanUrl = 'https://' + cleanUrl;
    } else {
      cleanUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(cleanUrl);
    }
  }

  session.lastUrl = cleanUrl;
  console.log(`[VirtualBrowser] [${roomId}] الانتقال إلى: ${cleanUrl}`);

  try {
    await session.page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  } catch (err) {
    console.error(`[VirtualBrowser] تنبيه: ${err.message}`);
  }
}

async function goBack(roomId, io) {
  const session = await getOrLaunchBrowser(roomId, io);
  try { await session.page.goBack(); } catch (e) {}
}

async function goForward(roomId, io) {
  const session = await getOrLaunchBrowser(roomId, io);
  try { await session.page.goForward(); } catch (e) {}
}

async function reload(roomId, io) {
  const session = await getOrLaunchBrowser(roomId, io);
  try { await session.page.reload(); } catch (e) {}
}

// معالجة الماوس ونقرات المشغل بدقة عالية
async function dispatchMouse(roomId, event) {
  const session = roomBrowsers[roomId];
  if (!session || !session.client) return;

  const { type, x, y, button, clickCount, deltaX, deltaY } = event;
  const profile = QUALITY_PROFILES[session.quality] || QUALITY_PROFILES.high;

  // مطابقة الإحداثيات مع دقة العرض الحالية
  const scaleX = profile.width / 1280;
  const scaleY = profile.height / 720;
  const targetX = Math.round(x * scaleX);
  const targetY = Math.round(y * scaleY);

  try {
    if (type === 'wheel') {
      await session.client.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: targetX,
        y: targetY,
        deltaX: deltaX || 0,
        deltaY: deltaY || 0
      });
    } else {
      await session.client.send('Input.dispatchMouseEvent', {
        type: type,
        x: targetX,
        y: targetY,
        button: button || 'left',
        clickCount: clickCount || 1
      });
    }
  } catch (e) {}
}

// معالجة ضغطات الكيبورد
async function dispatchKey(roomId, event) {
  const session = roomBrowsers[roomId];
  if (!session || !session.client) return;

  const { type, key, code, text } = event;

  try {
    if (type === 'char' && text) {
      await session.client.send('Input.insertText', { text });
    } else if (key === 'Enter') {
      await session.client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await session.client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    } else if (key === 'Backspace') {
      await session.client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
      await session.client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    } else {
      await session.client.send('Input.dispatchKeyEvent', {
        type: type,
        key: key,
        code: code,
        text: text || ''
      });
    }
  } catch (e) {}
}

async function closeBrowser(roomId) {
  const session = roomBrowsers[roomId];
  if (session) {
    session.isRunning = false;
    try {
      await session.browser.close();
      console.log(`[VirtualBrowser] تم إنهاء جلسة المتصفح للقاعة: ${roomId}`);
    } catch (e) {}
    delete roomBrowsers[roomId];
  }
}

module.exports = {
  getOrLaunchBrowser,
  setQuality,
  navigate,
  goBack,
  goForward,
  reload,
  dispatchMouse,
  dispatchKey,
  closeBrowser
};
