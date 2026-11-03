// ====================================================================
// 🍿 سهرة بلس - تطبيق سطح المكتب الذكي (Sahretna Desktop App)
// ====================================================================
const { app, BrowserWindow, session, ipcMain, shell, powerSaveBlocker } = require('electron');
const path = require('path');
const http = require('http');
const os = require('os');

let powerBlockerId = null;

// تحديد الآي بي المحلي لشبكة الواي فاي لمشاركته مع الأصدقاء
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// تشغيل السيرفر المدمج تلقائياً في الخلفية عند فتح البرنامج
function startEmbeddedServer() {
  return new Promise((resolve) => {
    // التحقق أولاً إذا كان السيرفر يعمل بالفعل على البورت 3000
    const checkReq = http.get('http://localhost:3000', (res) => {
      console.log('[Sahretna App] السيرفر يعمل بالفعل على البورت 3000.');
      resolve(true);
    });

    checkReq.on('error', () => {
      console.log('[Sahretna App] بدء تشغيل خادم السينما المدمج تلقائياً...');
      try {
        require('./server');
        // الانتظار ثانية واحدة للتأكد من استقرار تشغيل السيرفر
        setTimeout(() => resolve(true), 1200);
      } catch (err) {
        console.error('[Sahretna App] خطأ في تشغيل السيرفر:', err);
        resolve(false);
      }
    });
  });
}

let mainWindow = null;

async function createWindow() {
  await startEmbeddedServer();

  // إزالة قيود الحماية لتصفح أي موقع فيديو خارجي بحرية تامة داخل البرنامج
  const filter = { urls: ['*://*/*'] };
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const responseHeaders = Object.assign({}, details.responseHeaders);
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['X-Frame-Options'];
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['Content-Security-Policy'];
    delete responseHeaders['frame-options'];
    callback({ cancel: false, responseHeaders });
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 650,
    title: '🍿 سهرة بلس | قاعة السينما الافتراضية والتزامن اللحظي',
    backgroundColor: '#0a0a0c',
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.webContents.on('did-finish-load', () => {
    const localIp = getLocalNetworkIp();
    // إرسال عنوان الآي بي المحلي للنافذة لتمكين زر النسخ المباشر
    mainWindow.webContents.executeJavaScript(`
      window.SAHRETNA_LOCAL_IP = "${localIp}";
      console.log("🍿 سهرة بلس جاهز! رابط أصدقائك في نفس الشبكة: http://${localIp}:3000");
    `);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // منع نظام التشغيل من تعليق البرنامج أو الدخول في وضع السكون طالما السهرة شغالة
  try {
    powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    console.log('[Power] تم تفعيل وضع الاستيقاظ الدائم (Sleep Blocker Active, id:', powerBlockerId, ')');
  } catch (e) {}

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (powerBlockerId && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
