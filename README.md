# Fusion UI

一个基于 Next.js 和 Electron 的聊天产品前端，提供桌面客户端体验。

## 功能特点

- 💬 多模型AI对话支持
- 📝 Markdown渲染与代码高亮
- 📂 文件上传与处理功能
- 🗂️ 历史会话与服务端同步
- 🌐 桌面应用体验（Electron）
- 🌙 支持多语言（i18n）

## 技术栈

- **前端框架**: Next.js 15.x
- **桌面集成**: Electron
- **UI组件**: Radix UI, Shadcn/UI
- **样式**: Tailwind CSS
- **状态管理**: Redux Toolkit
- **本地缓存**: Dexie.js (IndexedDB, cache only)
- **编辑器**: TipTap
- **表单处理**: React Hook Form, Zod
- **文件处理**: FilePond, React Dropzone

## 快速开始

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器（Next.js + Electron）
npm run dev
```

### 构建应用

```bash
# 构建桌面应用
npm run build
```

### 启动应用

```bash
# 启动已构建的应用
npm start
```

## 项目结构

```
src/
  ├── app/           # Next.js 应用页面
  ├── components/    # UI组件
  ├── electron/      # Electron主进程代码
  ├── lib/           # 工具函数和API封装
  └── redux/         # Redux状态管理
```

## 当前范围

- 当前产品范围聚焦在 `chat / auth / files / models`
- 搜索增强、热点话题、RSS、摘要等非核心能力已从主产品面移除
- IndexedDB 仅作为本地缓存，不是产品真源

## 数据流文档

- 前端聊天主数据流说明见 [`CHAT_UI_DATA_FLOW.md`](/Users/sean/code/fusion/fusion-ui/CHAT_UI_DATA_FLOW.md)

## 许可证

[MIT](LICENSE)
