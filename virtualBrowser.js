// ====================================================================
// 🍿 Hyperbeam Engine - Virtual Cloud Browser (CDP Screencast)
// ====================================================================
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const roomBrowsers = {};

async function getOrLaunchBrowser(roomId, io) {
  if (roomBrowsers[roomId] && roomBrowsers[roomId].isRunning) {
    return roomBrowsers[roomId];
  }

  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`Google Chrome غير موجود في المسار: ${CHROME_PATH}`);
  }

  console.log(`[VirtualBrowser] تشغيل متصفح افتراضي مستقل للقاعة: ${roomId}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,720',
      '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

  const client = await page.target().createCDPSession();

  const sessionData = {
    browser,
    page,
    client,
    isRunning: true,
    lastUrl: 'https://www.google.com'
  };

  roomBrowsers[roomId] = sessionData;

  // 1. استقبال إطارات الشاشة المباشرة وبثها لجميع المتصلين
  client.on('Page.screencastFrame', async ({ data, sessionId }) => {
    try {
      await client.send('Page.screencastFrameAck', { sessionId });
      io.to(roomId).emit('browser-frame', 'data:image/jpeg;base64,' + data);
    } catch (e) {}
  });

  // 2. مزامنة رابط الصفحة عند التنقل التلقائي
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      sessionData.lastUrl = url;
      io.to(roomId).emit('sync-browser-url', { url });
    }
  });

  // 3. بدء البث المباشر للشاشة بدقة 1280x720 وبجودة ممتازة وسريعة
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 75,
    maxWidth: 1280,
    maxHeight: 720,
    everyNthFrame: 1
  });

  try {
    await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch (err) {
    console.log('[VirtualBrowser] خطأ في تحميل صفحة البداية:', err.message);
  }

  return sessionData;
}

async function navigate(roomId, rawUrl, io) {
  const session = await getOrLaunchBrowser(roomId, io);
  let cleanUrl = rawUrl.trim();

  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    if (cleanUrl.includes('.') && !cleanUrl.includes(' ')) {
      cleanUrl = 'https://' + cleanUrl;
    } else {
      cleanUrl = 'https://www.google.com/search?q=' + encodeURIComponent(cleanUrl);
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

// تحويل أحداث الماوس وإرسالها للمتصفح الحقيقي
async function dispatchMouse(roomId, event) {
  const session = roomBrowsers[roomId];
  if (!session || !session.client) return;

  const { type, x, y, button, clickCount, deltaX, deltaY } = event;

  try {
    if (type === 'wheel') {
      await session.client.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: Math.round(x),
        y: Math.round(y),
        deltaX: deltaX || 0,
        deltaY: deltaY || 0
      });
    } else {
      await session.client.send('Input.dispatchMouseEvent', {
        type: type,
        x: Math.round(x),
        y: Math.round(y),
        button: button || 'left',
        clickCount: clickCount || 1
      });
    }
  } catch (e) {}
}

// تحويل أحداث الكيبورد مع دعم الحروف العربية والإنجليزية بشكل كامل
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
  navigate,
  goBack,
  goForward,
  reload,
  dispatchMouse,
  dispatchKey,
  closeBrowser
};
