const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// 自己检测开发环境
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined;

// 声明变量，但不要立即执行导入
let serveHandler;

// 在应用程序初始化之前导入 electron-serve
(async function importServe() {
  const serve = await import('electron-serve');
  serveHandler = serve.default;
})();

let mainWindow;
let loadURL;

function createWindow() {
  // 在创建窗口前初始化 loadURL
  if (!isDev && serveHandler) {
    loadURL = serveHandler({ directory: 'out' });
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else if (loadURL) {
    loadURL(mainWindow);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 等待所有异步操作完成
async function startApp() {
  try {
    // 等待应用准备就绪
    await app.whenReady();
    createWindow();
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('启动应用时出错:', error);
  }
}

// 监听窗口关闭事件
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 启动应用
startApp().catch(err => {
  console.error('无法启动应用:', err);
});