# Fusion UI

一个基于Next.js和Electron的AI对话应用程序，提供桌面客户端体验。

## 功能特点

- 💬 多模型AI对话支持
- 🔄 上下文增强和相关讨论推荐
- 📝 Markdown渲染与代码高亮
- 📂 文件上传与处理功能
- 💾 本地数据库存储聊天记录
- 🌐 桌面应用体验（Electron）
- 🔍 向量搜索功能
- 🌙 支持多语言（i18n）

## 技术栈

- **前端框架**: Next.js 15.x
- **桌面集成**: Electron
- **UI组件**: Radix UI, Shadcn/UI
- **样式**: Tailwind CSS
- **状态管理**: Redux Toolkit
- **本地数据库**: Dexie.js (IndexedDB)
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

## 功能扩展

本项目支持通过添加新的模型和功能进行扩展。查看代码中的相关组件以了解如何添加新功能。

## 许可证

[MIT](LICENSE)
