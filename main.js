const { app, BrowserWindow, session } = require('electron');
const path = require('path');

function createWindow() {
  // فك وحذف ترويسات الحماية بالكامل للسماح بتصفح أي موقع في العالم بحرية تامة
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

  const win = new BrowserWindow({
    width: 1360,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    title: '🍿 سهرة بلس | متصفح السينما المفتوح (Hyperbeam Alternative)',
    backgroundColor: '#0a0a0c',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  win.loadURL('http://localhost:3000');

  win.on('closed', () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
