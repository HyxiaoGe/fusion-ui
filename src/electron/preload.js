const { contextBridge, ipcRenderer } = require('electron');

// 扩展暴露给渲染进程的API
contextBridge.exposeInMainWorld('electron', {
  // 基本IPC通信
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  receive: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  },
  // 添加一些实用功能
  platform: process.platform,
  isDev: process.env.NODE_ENV === 'development',
  // 添加特定功能
  openExternal: (url) => ipcRenderer.send('open-external', url),
  // 应用控制
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window')
});

// 添加全局错误处理
window.addEventListener('error', (error) => {
  console.error('捕获到前端错误:', error);
  ipcRenderer.send('renderer-error', {
    message: error.message,
    stack: error.error ? error.error.stack : ''
  });
});

// 添加调试信息
console.log('Preload脚本已加载，当前环境:', process.env.NODE_ENV);