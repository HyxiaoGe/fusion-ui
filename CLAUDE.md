# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Development
- `npm run dev` - Start development server with Electron desktop app (Next.js on port 3000 + Electron)
- `npm run dev:next` - Start Next.js development server only
- `npm run dev:hot` - Start Next.js with hot reload on all network interfaces (0.0.0.0:3000)

### Build & Production
- `npm run build` - Build Next.js application
- `npm run build:electron` - Build Next.js and package as Electron desktop app
- `npm start` - Start production server on port 3000

### Analysis & Optimization
- `npm run analyze` - Analyze bundle size
- `npm run analyze:build` - Build with bundle analysis enabled
- `npm run analyze:visual` - Cross-platform bundle analysis with visualization

## High-Level Architecture

This is a hybrid Next.js + Electron application for AI chat conversations with the following key architectural components:

### Frontend Architecture
- **Next.js 15** with App Router for web and desktop UI
- **Redux Toolkit** for global state management across 8 slices:
  - `authSlice` - User authentication state
  - `chatSlice` - Chat conversations and messages
  - `modelsSlice` - AI model configurations
  - `fileUploadSlice` - File upload state and progress
  - `promptTemplatesSlice` - Reusable prompt templates
  - `searchSlice` - Search functionality state
  - `settingsSlice` - User preferences
  - `themeSlice` - Theme configuration

### Data Layer
- **Dexie.js** (IndexedDB wrapper) for local chat storage and offline support
- Chat messages are synced between Redux state and IndexedDB
- Custom middleware (`dbSyncMiddleware`) handles database synchronization

### Component Structure
- `src/app/` - Next.js pages using App Router
- `src/components/` - Reusable UI components organized by feature:
  - `chat/` - Chat-specific components (messages, sidebar, input)
  - `models/` - Model selection and configuration
  - `ui/` - Base UI components (Radix UI + Tailwind)
- `src/lib/` - Core utilities and API clients:
  - `api/` - Backend API integration (chat, files, search)
  - `db/` - Database management and chat storage
  - `hooks/` - Custom React hooks
  - `i18n/` - Internationalization support

### API Integration
- Backend API at `http://192.168.31.98:8000` (configurable via `NEXT_PUBLIC_API_BASE_URL`)
- Key endpoints:
  - `/api/chat` - Chat completions
  - `/api/models` - Available AI models
  - `/api/files` - File upload and processing
  - `/api/search` - Vector search functionality

### Electron Integration
- Desktop app wrapper with main process in `src/electron/main.js`
- Supports both web and desktop deployment
- Uses `electron-serve` for production builds

### Key Features Implementation
- **Real-time chat** with streaming responses
- **File uploads** via FilePond with preview support
- **Context enhancement** for improved AI responses
- **Multi-model support** with per-model settings
- **Markdown rendering** with code highlighting
- **Local storage** for offline access to chat history

## Deployment

### Railway Deployment
This project is configured for Railway deployment (Web version only, not Electron):

1. **Environment Variables** - Set in Railway dashboard:
   - `NEXT_PUBLIC_API_BASE_URL` - Your backend API URL
   - Railway auto-sets: `PORT`, `NODE_ENV=production`

2. **Deployment Steps**:
   - Connect GitHub repository to Railway
   - Railway will auto-detect Next.js and use railway.json config
   - Build command: `npm run build`
   - Start command: `npm start`

3. **Important Notes**:
   - Only the Next.js web app deploys to Railway (not Electron desktop)
   - Ensure your backend API is accessible from Railway's servers
   - The app will run on port 3000 by default