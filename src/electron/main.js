const { app, BrowserWindow, ipcMain, session } = require('electron');
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

// 等待所有异步操作完成
async function startApp() {
  try {
    app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    app.commandLine.appendSwitch('disable-http-cache');
    // 等待应用准备就绪
    await app.whenReady();
    
    if (isDev) {
      // 仅在开发环境下放宽CSP限制
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': ["default-src * 'unsafe-inline' 'unsafe-eval'"]
          }
        });
      });
    }

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

    try {
      const { default: installExtension, REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS } = require('electron-devtools-installer');
      
      installExtension([REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS])
        .then((name) => console.log(`已添加扩展: ${name}`))
        .catch((err) => console.log('添加扩展失败:', err));
    } catch (e) {
      console.error('无法安装开发工具扩展:', e);
    }
  } else if (loadURL) {
    loadURL(mainWindow);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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