# 架构概览

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + React 19 |
| 桌面端 | Electron 34 |
| 状态管理 | Redux Toolkit |
| 本地缓存 | Dexie.js (IndexedDB) |
| UI 组件 | Radix UI + Tailwind CSS |
| 国际化 | i18next (zh-CN / en-US) |
| 文件上传 | FilePond |
| Markdown | react-markdown + remark-gfm + rehype-katex |
| 代码高亮 | highlight.js |
| 动画 | framer-motion |
| 测试 | Vitest + Testing Library |

## Redux State 架构（9 个 slice）

| Slice | 文件 | 职责 |
|-------|------|------|
| `auth` | `authSlice.ts` | JWT token、用户信息、认证状态 |
| `conversation` | `conversationSlice.ts` | 对话列表、消息、hydration 状态 |
| `stream` | `streamSlice.ts` | 实时流式内容（content blocks + typewriter 效果） |
| `models` | `modelsSlice.ts` | 可用模型列表、当前选择模型 |
| `fileUpload` | `fileUploadSlice.ts` | 文件上传进度与处理状态 |
| `promptTemplates` | `promptTemplatesSlice.ts` | 提示词模板（Dexie 持久化） |
| `settings` | `settingsSlice.ts` | 头像选择、设置对话框 |
| `theme` | `themeSlice.ts` | 主题模式（light/dark/system） |
| `app` | `appSlice.ts` | 应用元数据（同步触发器） |

中间件：`toastMiddleware`（错误通知）、`persistMiddleware`（数据库同步）

## 数据层

- **Dexie.js** (IndexedDB) 作为本地缓存，**非数据源**
- 对话数据从后端 API 加载，缓存到 IndexedDB 供离线查看
- Redux ↔ IndexedDB 通过中间件同步

## 目录结构

```
src/
├── app/                    # Next.js 页面（App Router）
│   ├── page.tsx            # 首页（新建对话）
│   ├── chat/[chatId]/      # 对话页面
│   ├── auth/callback/      # OAuth 回调
│   ├── settings/           # 用户设置
│   └── debug/database/     # 数据库调试
├── components/
│   ├── chat/               # 对话组件（消息列表、输入框、侧边栏）
│   ├── models/             # 模型选择与配置
│   ├── layouts/            # 布局组件（Header、Sidebar、UserMenu）
│   ├── auth/               # 登录对话框
│   ├── settings/           # 设置组件
│   ├── prompts/            # 提示词模板
│   └── ui/                 # 基础 UI 组件（Radix UI 封装）
├── hooks/                  # 自定义 React Hooks
│   ├── useConversation.ts      # 单个对话状态 + hydration
│   ├── useConversationList.ts  # 对话列表 + 分页
│   ├── useSendMessage.ts       # 发送消息 + 流式处理
│   ├── useSidebarActions.ts    # 侧边栏操作
│   └── useSuggestedQuestions.ts # 推荐问题
├── lib/
│   ├── api/                # 后端 API 客户端
│   │   ├── chat.ts         # 流式消息发送（SSE + Redis Stream ID 断点续传）
│   │   ├── files.ts        # 文件上传
│   │   ├── fetchWithAuth.ts # JWT 认证 fetch 封装
│   │   ├── streamStatus.ts # 流状态查询
│   │   └── title.ts        # 标题生成
│   ├── auth/authService.ts # OAuth 登录流程（GitHub/Google）
│   ├── db/chatStore.ts     # Dexie 数据库（本地缓存）
│   ├── config/modelConfig.ts # 模型配置获取与缓存
│   ├── i18n/               # i18next 配置 + 语言包
│   └── utils/              # 工具函数
├── redux/
│   ├── slices/             # 9 个 Redux slice
│   ├── middleware/          # 自定义中间件
│   ├── store.ts            # Store 配置
│   └── providers.tsx       # Redux Provider
├── types/conversation.ts   # TypeScript 类型定义
└── electron/               # Electron 主进程
    ├── main.js             # 窗口创建、IPC
    └── preload.js          # Context Isolation API
```

## 核心数据类型

```typescript
ContentBlock = TextBlock | ThinkingBlock | FileBlock
Message { id, role, content: ContentBlock[], usage, timestamp }
Conversation { id, title, messages[], model_id, createdAt, updatedAt }
```

## 认证流程

- 通过独立的 auth-service 进行 OAuth 登录（GitHub/Google）
- Token 存储在 localStorage（`auth_token`、`auth_refresh_token`）
- `fetchWithAuth` 自动注入 Bearer token，401 时自动 refresh

## Electron 集成

- 主进程：`src/electron/main.js`（窗口 1200x800，Context Isolation）
- 开发模式加载 `http://localhost:3000`，生产模式用 `electron-serve`
- 通过 `window.electron` 暴露 IPC API（platform、openExternal 等）

## Next.js 配置要点

- API 请求通过 rewrites 代理到后端（`/api/*` → `NEXT_PUBLIC_API_BASE_URL`）
- 生产环境移除 console.log
- ESLint / TypeScript 错误在构建时不阻断

## 部署

| 平台 | 说明 |
|------|------|
| Docker | Web 版本，`Dockerfile` / `docker-compose.yml` |
| Electron | 桌面版本，`npm run build:electron` 打包 |

环境变量：
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_AUTH_SERVICE_BASE_URL=http://localhost:8100
NEXT_PUBLIC_AUTH_SERVICE_CLIENT_ID=fusion-client
NEXT_PUBLIC_AUTH_CALLBACK_URL=http://localhost:3000/auth/callback
```
