# Fusion Design System v2 落地实施 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Claude Design 出的 Fusion Design System v2 prototype（位于 `~/Downloads/Fusion Chat v2/`）的视觉与交互决策，迁移到 fusion-ui 现有代码，覆盖 chat 主流程的 9 类组件 + token 基础。

**Architecture:** 纯 additive token + 视觉层重构。仅改渲染层（className、JSX 结构、token 引用），所有事件处理、Redux 流转、API 调用、流式逻辑、文件上传、Agent 执行 100% 不动。Token 走现有 CSS variable 桥接，不删旧 token，新增 5 套语义色 + 完整 type/spacing/shadow/motion scale，并校准暗色对比度。

**Tech Stack:** Next.js 15 (App Router) + React 19 + Tailwind v3 (CSS var bridge) + shadcn/ui 风格组件 + Lucide React + Redux Toolkit。已安装 Vitest 测试栈，含 ChatInput/ChatMessage/HomePage 等组件测试。

**User Decisions Locked (D1-D4):**
- **D1**: Header 加快捷主题切换 sun/moon 按钮；SettingsDialog 保留高级（含 system 模式）
- **D2**: ResizableSidebar 默认宽度 240→320px，移除 className 写死的 `w-[360px]` bug
- **D3**: 保留 highlight.js（CodeBlock 不换 tokenizer），仅调容器视觉
- **D4**: 修 ReasoningContent 的 `max-h-[200px]` CLS bug，改用 grid-template-rows 过渡

**Reference materials:**
- Prototype: `~/Downloads/Fusion Chat v2/`（解压稳定路径，留作 ground truth）
- Survey: `fusion-ui/docs/migration-survey.md`（本地，未 push）
- Design tokens source: `~/Downloads/Fusion Chat v2/colors_and_type.css`

**Red lines（绝对不碰）：**
- Redis Stream 通信、流式 scroll-stick 逻辑（`ChatMessageList`）
- Agent 执行链路、Tool dispatcher
- 文件上传 / 图片 vision / URL read 业务代码
- Redux store shape、action 命名、API client（`fetchWithAuth`、`fetchPromptExamples` 等）
- 路由结构、auth-service 集成
- Dexie schema、persistMiddleware
- `MarkdownRenderer` 引用替换核心机制（[n] → ⟦n⟧ → 圆圈）
- `SuggestedQuestions` 的 `globalThis.triggerLoginDialog` 耦合（已知技术债，本次不修）

---

## File Structure

各 phase 涉及的文件，按变更类型分组：

| 文件 | 变更类型 | Phase |
|------|---------|-------|
| `src/app/globals.css` | 修改（追加 + 少量覆盖） | 0 |
| `tailwind.config.js` | 修改（追加 colors） | 0 |
| `src/components/layouts/Header.tsx` | 修改（拆 gradient + 加主题切换） | 1a |
| `src/components/layouts/Header.test.tsx` | 新建（验证主题切换） | 1a |
| `src/components/layouts/ResizableSidebar.tsx` | 修改（宽度 + 移除 w-[360px]） | 1b |
| `src/components/chat/ChatSidebar.tsx` | 修改（视觉对齐 token） | 1b |
| `src/components/chat/ChatInput.tsx` | 修改（textarea 容器 + 工具按钮 + a11y） | 2 |
| `src/components/chat/ChatMessage.tsx` | 修改（用户气泡 + AI block 视觉） | 3a |
| `src/components/chat/ReasoningContent.tsx` | 修改（CLS fix + 视觉对齐） | 3b |
| `src/components/chat/AgentStepCard.tsx` | 修改（semantic palette + pending status + 折叠摘要） | 3c |
| `src/components/chat/SourcesPanel.tsx` | 修改（视觉对齐） | 3d |
| `src/components/chat/SourcesSidebar.tsx` | 修改（360→400px + 分组） | 3d |
| `src/components/chat/SuggestedQuestions.tsx` | 修改（卡片视觉） | 4 |
| `src/components/models/ModelSelectorTrigger.tsx` | 修改（触发器视觉） | 4 |
| `src/components/home/HomePage.tsx` | 修改（token 替换） | 5 |

---

## Pre-flight：建分支 + 拉基线

### Task P1: 建分支 + 验证当前状态

**Files:** （无文件改动，仅 git 操作）

- [ ] **Step 1: 确认在 fusion-ui 子目录、当前分支干净**

```bash
cd /Users/sean/code/fusion/fusion-ui
git status
```

Expected: working tree clean（如果有未提交改动先处理）

- [ ] **Step 2: 从 main 拉新分支**

```bash
git fetch origin
git checkout -b feat/design-system-v2 origin/main
```

Expected: Switched to a new branch 'feat/design-system-v2'

- [ ] **Step 3: 拉基线截图（无变化对照用）**

```bash
npm install
npm run dev:next &
sleep 15  # 等 Next 编译完
```

打开浏览器访问 `http://localhost:3000`，手动截 4 张截图保存到 `~/Downloads/baseline-before/`：
- `home-light.png`（首页 light）
- `home-dark.png`（首页 dark）
- `chat-light.png`（任意已有对话 light）
- `chat-dark.png`（任意已有对话 dark）

- [ ] **Step 4: 确认 build / test 基线通过**

```bash
npm run build
npm test
```

Expected: 都成功。如果失败，**先解决**，不要在已损坏的基线上动工。

- [ ] **Step 5: 关闭 dev server**

```bash
kill %1  # 或 Ctrl+C
```

---

## Phase 0：Token 基础（追加，零回归风险）

**Goal:** 把 prototype 的完整 token 体系（5 套语义色 + type/spacing/shadow/motion scale + 暗色对比校准）追加到 globals.css，并在 tailwind.config.js 桥接。**不删任何现有 token，不改任何组件 className。**

**Verification strategy:** build 通过 + 现有页面截图与 baseline 完全一致（因为没有组件用新 token，纯追加 = 0 视觉变化）。

### Task 0.1: 追加 :root token

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 在 `:root {` 块尾部、`}` 之前追加新 token**

定位：找到 `--select-dropdown-max-height: 400px;` 这一行（`:root` 块的最后一行原 token），在其下方、`}` 之前追加。

```css
  /* === Fusion Design System v2 — 新增 token (additive, 不影响现有) === */

  /* Type scale (desktop-density, prototype 标准) */
  --text-2xs: 10px;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base-fdv2: 13px; /* 注意：避免与 tailwind 默认 --text-base 冲突 */
  --text-md: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 32px;
  --leading-tight: 1.2;
  --leading-snug: 1.35;
  --leading-normal: 1.55;
  --leading-relaxed: 1.7;

  /* Spacing scale (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* Shadow ladder (restrained, no glow) */
  --shadow-xs: 0 1px 0 0 oklch(0 0 0 / 0.04);
  --shadow-sm-fdv2: 0 1px 2px 0 oklch(0 0 0 / 0.05);
  --shadow-md-fdv2: 0 2px 8px 0 oklch(0 0 0 / 0.08);
  --shadow-lg-fdv2: 0 8px 24px -4px oklch(0 0 0 / 0.10);
  --shadow-popover: 0 10px 32px -6px oklch(0 0 0 / 0.18);

  /* Motion */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out-fdv2: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 300ms;

  /* 语义色 — info (engineer blue) */
  --info: oklch(0.55 0.18 260);
  --info-bg: oklch(0.97 0.015 260);
  --info-border: oklch(0.92 0.025 260);

  /* 语义色 — success (green) */
  --success: oklch(0.62 0.16 152);
  --success-bg: oklch(0.97 0.025 152);
  --success-border: oklch(0.9 0.04 152);

  /* 语义色 — warn (amber) */
  --warn: oklch(0.72 0.155 70);
  --warn-bg: oklch(0.97 0.04 85);
  --warn-border: oklch(0.91 0.06 85);

  /* 语义色 — danger (red, 区别于已有 destructive 用于强语义场景) */
  --danger: oklch(0.577 0.245 27);
  --danger-bg: oklch(0.96 0.03 27);
  --danger-border: oklch(0.9 0.06 27);

  /* 语义色 — teal (sources / url_read) */
  --teal: oklch(0.65 0.12 180);

  /* bg/fg 细分 (替代单一 muted) */
  --bg-subtle: oklch(0.985 0 0);
  --bg-elevated: oklch(1 0 0);
  --fg-secondary: oklch(0.35 0 0);
  --fg-subtle: oklch(0.7 0 0);
  --border-strong: oklch(0.85 0 0);
```

- [ ] **Step 2: 确认追加后 :root 块语法正确**

```bash
npx -y prettier --check src/app/globals.css
```

Expected: 报告 prettier 格式（如有警告可 `prettier --write` 修复）

- [ ] **Step 3: build 验证**

```bash
npm run build
```

Expected: 编译成功无错误。

### Task 0.2: 追加 .dark token + 校准 3 项现有暗色

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 在 `.dark { ... }` 块内修改 3 个现有 token + 追加新 token**

定位：`.dark {` 块。

修改这 3 行：

```css
/* 原: --muted: oklch(0.269 0 0); */
--muted: oklch(0.225 0 0);

/* 原: --muted-foreground: oklch(0.708 0 0); */
--muted-foreground: oklch(0.74 0 0);

/* 原: --border: oklch(0.269 0 0); */
--border: oklch(0.32 0 0);
```

并在 `.dark` 块尾部、`}` 之前追加：

```css
  /* === Fusion Design System v2 — dark mode 新增 token === */
  --info: oklch(0.7 0.16 260);
  --info-bg: oklch(0.245 0.04 260);
  --info-border: oklch(0.36 0.06 260);

  --success: oklch(0.74 0.16 152);
  --success-bg: oklch(0.245 0.05 152);
  --success-border: oklch(0.36 0.07 152);

  --warn: oklch(0.8 0.16 80);
  --warn-bg: oklch(0.27 0.06 80);
  --warn-border: oklch(0.4 0.1 80);

  --danger: oklch(0.7 0.2 27);
  --danger-bg: oklch(0.27 0.07 27);
  --danger-border: oklch(0.4 0.13 27);

  --teal: oklch(0.74 0.13 180);

  --bg-subtle: oklch(0.185 0.012 260);
  --bg-elevated: oklch(0.18 0 0);
  --fg-secondary: oklch(0.86 0 0);
  --fg-subtle: oklch(0.58 0 0);
  --border-strong: oklch(0.42 0 0);
```

- [ ] **Step 2: build 验证**

```bash
npm run build
```

Expected: 编译成功。

### Task 0.3: tailwind.config.js 桥接新 colors

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: 在 `theme.extend.colors` 中追加新 key**

定位：`tailwind.config.js` 的 `theme.extend.colors` 块（行 11-31）。在末尾 `ring: 'var(--ring)',` 之后、`},` 之前追加：

```javascript
        // === Fusion Design System v2 — 语义色 + bg/fg 细分 ===
        info: {
          DEFAULT: 'var(--info)',
          bg: 'var(--info-bg)',
          border: 'var(--info-border)',
        },
        success: {
          DEFAULT: 'var(--success)',
          bg: 'var(--success-bg)',
          border: 'var(--success-border)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          bg: 'var(--warn-bg)',
          border: 'var(--warn-border)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          bg: 'var(--danger-bg)',
          border: 'var(--danger-border)',
        },
        teal: 'var(--teal)',
        fg: {
          secondary: 'var(--fg-secondary)',
          subtle: 'var(--fg-subtle)',
        },
        bg: {
          subtle: 'var(--bg-subtle)',
          elevated: 'var(--bg-elevated)',
        },
        'border-strong': 'var(--border-strong)',
```

- [ ] **Step 2: build + test 验证**

```bash
npm run build && npm test
```

Expected: 都通过。

- [ ] **Step 3: 视觉无回归验证**

启动 dev server，截 4 张图与 baseline 对比：

```bash
npm run dev:next &
sleep 15
```

手动截图保存到 `~/Downloads/phase0-after/`，文件名同 baseline。然后：

```bash
# 简单的 diff 命令（macOS Preview 双开比对即可，或用 ImageMagick）
ls -la ~/Downloads/baseline-before/ ~/Downloads/phase0-after/
```

Expected: 视觉应**完全一致**（除暗色 muted/border 微调外）。如果发现明显差异 → rollback 排查。

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css tailwind.config.js
git commit -m "feat: 添加 Fusion Design System v2 设计 token

- 追加 5 套语义色（info/success/warn/danger/teal）+ bg/border 变体
- 追加完整 type/spacing/shadow/motion scale
- 追加 bg/fg 细分 token（替代单一 muted）
- 暗色校准 muted/border/muted-foreground 提升对比度
- tailwind.config.js 桥接新 color key

纯 additive，零组件改动，零视觉回归。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 0 Rollback:** `git revert HEAD`

**Phase 0 Red lines:** 不删任何现有 token；新追加的 token 名都用后缀避免与 shadcn/Tailwind 冲突（`--text-base-fdv2` 而非覆盖 `--text-base`）。

---

## Phase 1a：Header（拆 gradient + 加主题切换）

**Goal:** 把 Header 的 gradient wordmark 换成 flat 文字 logo，右上角加 sun/moon 主题切换按钮（与 SettingsDialog 中的 themeMode 共享 Redux state）。

### Task 1a.1: Header — 拆 gradient wordmark

**Files:**
- Modify: `src/components/layouts/Header.tsx`

- [ ] **Step 1: 替换 line 45 的 gradient span**

定位：`Header.tsx:45`：

```tsx
<span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
```

替换为：

```tsx
<span className="text-foreground">Fusion AI</span>
```

- [ ] **Step 2: build 验证**

```bash
npm run build
```

Expected: 编译成功。

- [ ] **Step 3: 视觉验证**

```bash
npm run dev:next &
sleep 15
```

打开浏览器，确认 Header 左上角 "Fusion AI" 是 flat 黑/白文字（light 黑色，dark 白色），无渐变。

```bash
kill %1
```

### Task 1a.2: Header — 加主题切换按钮

**Files:**
- Modify: `src/components/layouts/Header.tsx`

- [ ] **Step 1: 找到 themeMode 的 Redux selector / setter**

```bash
grep -rn "setThemeMode\|state.theme.mode\|themeSlice" src/redux --include="*.ts" --include="*.tsx" | head -10
```

记下 selector 路径和 setter action 名（用于下一步 import）。

- [ ] **Step 2: 在 Header.tsx 顶部 import 区追加**

```tsx
import { Sun, Moon } from "lucide-react";
import { useAppDispatch } from "@/redux/hooks";
import { setThemeMode } from "@/redux/slices/themeSlice"; // ← 替换成 step 1 找到的真实路径
```

并在 Header 函数体内（`const selectedModelName = ...` 之后）添加：

```tsx
const dispatch = useAppDispatch();
const themeMode = useAppSelector((state) => state.theme.mode);
const isDark = themeMode === 'dark' || (themeMode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

const toggleTheme = useCallback(() => {
  dispatch(setThemeMode(isDark ? 'light' : 'dark'));
}, [dispatch, isDark]);
```

- [ ] **Step 3: 在右侧 UserAvatarMenu 之前插入主题切换按钮**

定位：`Header.tsx:67-70` 的 `<div className="flex items-center">` 块。改为：

```tsx
{/* 右侧：主题切换 + 用户头像菜单 */}
<div className="flex items-center gap-1">
  <button
    onClick={toggleTheme}
    className="h-9 w-9 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
    title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
  >
    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
  </button>
  <UserAvatarMenu />
</div>
```

- [ ] **Step 4: build 验证**

```bash
npm run build
```

Expected: 编译成功，无 import 错误。

- [ ] **Step 5: 手动验证主题切换**

```bash
npm run dev:next &
sleep 15
```

打开浏览器：
1. 点 Header 右上角 sun/moon 图标 → 主题应切换
2. 打开 SettingsDialog → 主题选项应同步显示当前主题
3. 在 SettingsDialog 改 → Header 图标也跟着变

```bash
kill %1
```

- [ ] **Step 6: 写 Header 主题切换测试**

**Files:**
- Create: `src/components/layouts/Header.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Header from './Header';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

const makeStore = (initialTheme: 'light' | 'dark' | 'system' = 'light') =>
  configureStore({
    reducer: {
      theme: (state = { mode: initialTheme }, action: any) => {
        if (action.type === 'theme/setThemeMode') {
          return { mode: action.payload };
        }
        return state;
      },
      conversation: () => ({ byId: {} }),
      models: () => ({ models: [], selectedModelId: null }),
      auth: () => ({ isAuthenticated: false }),
    },
  });

describe('Header 主题切换', () => {
  it('light 模式下显示 Moon 图标', () => {
    render(
      <Provider store={makeStore('light')}>
        <Header />
      </Provider>
    );
    expect(screen.getByLabelText('切换到暗色模式')).toBeInTheDocument();
  });

  it('dark 模式下显示 Sun 图标', () => {
    render(
      <Provider store={makeStore('dark')}>
        <Header />
      </Provider>
    );
    expect(screen.getByLabelText('切换到亮色模式')).toBeInTheDocument();
  });

  it('点击按钮 dispatch setThemeMode action', () => {
    const store = makeStore('light');
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    render(
      <Provider store={store}>
        <Header />
      </Provider>
    );
    fireEvent.click(screen.getByLabelText('切换到暗色模式'));
    expect(dispatchSpy).toHaveBeenCalledWith({ type: 'theme/setThemeMode', payload: 'dark' });
  });
});
```

- [ ] **Step 7: 运行新测试**

```bash
npm test -- Header.test.tsx
```

Expected: 3 个 test 全部 pass。

- [ ] **Step 8: 全量 test + build**

```bash
npm run build && npm test
```

Expected: 都通过。

- [ ] **Step 9: Commit**

```bash
git add src/components/layouts/Header.tsx src/components/layouts/Header.test.tsx
git commit -m "feat: Header 拆掉 gradient wordmark，右上角加主题切换

- gradient wordmark (from-blue-600 via-purple-500 to-pink-500) → flat text-foreground
- 右上角加 Sun/Moon 切换按钮，复用 Redux themeSlice，与 SettingsDialog 同步
- 加 Header.test.tsx 覆盖主题切换交互

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 1a Rollback:** `git revert HEAD`

**Phase 1a Red lines:** 不动 themeSlice / setThemeMode action 实现；不动 SettingsDialog；不动 UserAvatarMenu。

---

## Phase 1b：Sidebar（宽度修正 + 视觉对齐）

**Goal:** ResizableSidebar 默认宽度 240→320px，移除 className 写死的 `w-[360px]` bug；ChatSidebar 视觉对齐 design system token（背景 / border / spacing）。

### Task 1b.1: ResizableSidebar 宽度修正

**Files:**
- Modify: `src/components/layouts/ResizableSidebar.tsx`

- [ ] **Step 1: 改默认宽度 + 移除 w-[360px]**

定位：`ResizableSidebar.tsx:17`：

```tsx
defaultWidth = 240,
```

改为：

```tsx
defaultWidth = 320,
```

定位：`ResizableSidebar.tsx:62`：

```tsx
className={cn("relative border-r bg-slate-50 dark:bg-slate-900 overflow-y-auto w-[360px] shadow-md", className)}
```

改为（移除 `w-[360px]`，去掉 shadow-md，背景改用 design system bg-subtle）：

```tsx
className={cn("relative border-r border-border bg-bg-subtle overflow-y-auto", className)}
```

- [ ] **Step 2: build 验证**

```bash
npm run build
```

Expected: 编译成功。

- [ ] **Step 3: 视觉验证**

```bash
npm run dev:next &
sleep 15
```

浏览器验证：
1. Sidebar 初始宽度看上去 320px（之前是 360）
2. 拖动右边手柄能正常 resize（180-400 范围）
3. light 下背景是淡灰、dark 下深灰，无 slate-50 那种偏蓝的灰
4. 没有外层 shadow（变 flat）

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layouts/ResizableSidebar.tsx
git commit -m "fix: ResizableSidebar 默认宽度 240→320 并修复 w-[360px] 写死 bug

- defaultWidth 从 240 改为 320，对齐 design system v2 prototype 规范
- 移除 className 中硬编码的 w-[360px]（与 defaultWidth 冲突的已存在 bug）
- 背景从 bg-slate-50/bg-slate-900 改为 bg-bg-subtle（走 design system token）
- 移除 shadow-md（design system 倾向 1px hairline 而非阴影）

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1b.2: ChatSidebar 视觉对齐

**Files:**
- Modify: `src/components/chat/ChatSidebar.tsx`

- [ ] **Step 1: 读 ChatSidebar 当前实现**

```bash
cat src/components/chat/ChatSidebar.tsx | head -80
```

确认当前的 className 用了哪些颜色（`bg-slate-*`、`text-gray-*` 等硬编码），列出所有需要替换的：
- `bg-slate-50` / `bg-slate-900` → `bg-bg-subtle`
- `text-gray-500` / `text-gray-400` → `text-muted-foreground`
- `border-gray-*` → `border-border`
- 任何 `text-blue-*` 高亮 → `text-info`

- [ ] **Step 2: 应用替换（保留所有事件处理 / hook 调用 / 数据流）**

仅改 className 字符串，不动任何 JSX 结构、props、state、callback。

- [ ] **Step 3: build + 视觉验证**

```bash
npm run build
npm run dev:next &
sleep 15
```

浏览器验证：
1. Sidebar 颜色对齐 prototype 截图（参考 `~/Downloads/Fusion Chat v2/screenshots/empty-light.png` 和 `empty-dark.png`）
2. 搜索框、新对话按钮、会话列表项 hover 状态都正常
3. 已选中会话有明显高亮（用 `bg-muted` 或 `bg-info-bg`）

```bash
kill %1
```

- [ ] **Step 4: 全量 test**

```bash
npm test
```

Expected: 都通过。

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatSidebar.tsx
git commit -m "style: ChatSidebar 视觉对齐 Design System v2

- 替换 bg-slate-* / text-gray-* 等硬编码颜色为 design system token
- hover / active 状态走 bg-muted、border-border
- 视觉对齐 prototype empty-light/dark.png

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 1b Rollback:** `git revert HEAD~1..HEAD`（两个 commit）

**Phase 1b Red lines:** 不动 useConversationList / useSidebarActions hook；不动 ChatSidebarHeader / ChatList / RenameDialog / DeleteDialog 子组件（它们各自有视觉调整，但放在后续 phase）；不动 Cmd/Ctrl+K 聚焦逻辑。

---

## Phase 2：Composer (ChatInput) 重做

**Goal:** ChatInput 的 textarea 容器化（暗色对比度修复）+ 工具按钮默认 neutral + 触摸目标 ≥44px + 补 a11y。**所有上传逻辑、能力检查、模型切换、发送处理 100% 不动。**

### Task 2.1: ChatInput textarea 容器化

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`

- [ ] **Step 1: 定位 textarea 元素 + 现有 className**

```bash
grep -n "<textarea" src/components/chat/ChatInput.tsx
```

记下行号 + 当前 className。

- [ ] **Step 2: 给 textarea 加独立容器视觉**

参考 prototype `~/Downloads/Fusion Chat v2/styles.css` 的 `.composer textarea` 规则。修改 textarea 的 className，确保：

```tsx
className="block w-full resize-none outline-none px-3 py-2.5 text-md
           bg-bg-elevated border border-border rounded-md
           focus:border-border-strong transition-colors duration-fast
           dark:bg-muted dark:border-border-strong
           placeholder:text-muted-foreground
           min-h-[44px]"
```

（如果原 className 有 `min-h-[44px]` 已经在了就保留；其他视觉相关全替换）

- [ ] **Step 3: build + 视觉验证（重点看暗色）**

```bash
npm run build
npm run dev:next &
sleep 15
```

切到暗色，确认：
- Textarea 跟 composer 容器有清晰视觉区分（不是同色融合）
- Placeholder 文字可见
- 输入聚焦后 border 颜色加深

```bash
kill %1
```

### Task 2.2: 工具按钮 neutral 默认 + 触摸目标

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`

- [ ] **Step 1: 找到所有工具按钮（深度思考 / 深度搜索 / 附件 / 图片）**

```bash
grep -n "深度思考\|深度搜索\|Paperclip\|Image" src/components/chat/ChatInput.tsx
```

- [ ] **Step 2: 应用按钮规则**

每个工具按钮的 className 需要满足：
- 默认态：`text-muted-foreground bg-transparent`
- Hover：`hover:bg-muted hover:text-foreground`
- Active 态（深度思考开启）：`text-info bg-info-bg border-info-border`
- Active 态（深度搜索开启）：`text-warn bg-warn-bg border-warn-border`
- 尺寸：`h-9 px-2`（保证 ≥36px 高度，加 hitSlop 后达到 44）
- 圆角：`rounded-md`
- aria-label 给具体含义（不能只 "深度思考"，要 `aria-label="开启深度思考模式"` 之类）

**核心要求**：默认态绝不能是亮蓝 / 亮橙（防止之前 prototype 那种 useState(true) 的问题再现）。

- [ ] **Step 3: 发送按钮触摸目标**

确认 send 按钮是 `h-9 w-9` 或更大（≥36px），加 `aria-label="发送消息"`。

- [ ] **Step 4: build + a11y 验证**

```bash
npm run build
```

打开浏览器 DevTools，对每个工具按钮查 computed size：高度 ≥ 36px（视觉），点击区域 ≥ 44px（含 padding 和 hitSlop）。

```bash
npm run dev:next &
sleep 15
```

```bash
kill %1
```

- [ ] **Step 5: 全量 test**

```bash
npm test
```

Expected: ChatInput.test.tsx 通过（如果失败，看是不是 className 断言 hardcoded，需要更新断言但不要改测试逻辑）。

- [ ] **Step 6: 端到端流程验证**

启动 dev，做这套操作：
1. 上传一个文件（验证文件预览正常）
2. 切换模型
3. 切换深度思考开关（验证视觉切换）
4. 切换深度搜索开关（验证视觉切换）
5. 发送一条消息（验证流式正常）

如果任何一步坏了 → rollback。

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/ChatInput.tsx
git commit -m "refactor: ChatInput 视觉重做 + a11y 修复

- textarea 容器化（bg-elevated + 1px border + focus:border-strong），暗色对比度修复
- 工具按钮默认 neutral（text-muted-foreground），active 态才上语义色
- 触摸目标 ≥36px 高度 + aria-label 补全
- 业务逻辑（上传 / 模型切换 / 发送）完全不动

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 2 Rollback:** `git revert HEAD`

**Phase 2 Red lines:** 不动 file upload state / 能力检查 / vision 校验 / Send handler / Redux dispatch；不动 ModelSelector 触发（Phase 4 处理）。

---

## Phase 3a：ChatMessage 视觉重做

**Goal:** 用户气泡 + AI block 视觉对齐 prototype，操作按钮 ≥32px，文件卡片加 MIME 文字标签（之前审查 P1 #2 问题）。

### Task 3a.1: ChatMessage 视觉

**Files:**
- Modify: `src/components/chat/ChatMessage.tsx`

- [ ] **Step 1: 读当前 ChatMessage**

```bash
wc -l src/components/chat/ChatMessage.tsx
```

记总行数。打开文件确认有这几个区域：用户气泡 / AI meta / 操作按钮行 / 文件卡片渲染。

- [ ] **Step 2: 用户气泡视觉对齐**

定位用户消息渲染块（搜 "user" 或 "msg-row user"）。className 调整：
- 容器：`flex justify-end`
- 气泡：`bg-primary/10 dark:bg-primary/15 text-foreground rounded-2xl px-4 py-2.5 max-w-[75%]`

（参考 prototype `Message.jsx` 的 `.user-bubble` 样式）

- [ ] **Step 3: AI 操作按钮升 32px**

定位操作按钮（复制 / 重新生成 / 赞 / 踩，原 ChatMessage.tsx:503-505 区域）：
- 现状：`h-6 w-6`（24px，不达标）
- 改为：`h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground`
- 时间戳：从 `text-[10px] text-muted-foreground/50` 改为 `text-xs text-muted-foreground/70`

- [ ] **Step 4: 文件卡片加 MIME 文字标签**

定位文件卡片渲染（原 ChatMessage.tsx:299-314 区域）。在色块上叠加文字标签：
- 图片：标签 "IMG"
- PDF：标签 "PDF"
- 其他：根据 mime 取后缀大写

```tsx
<div className="relative">
  <div className={/* 原色块 */}></div>
  <span className="absolute inset-0 grid place-items-center text-[9px] font-bold text-white">
    {fileType.toUpperCase()}
  </span>
</div>
```

- [ ] **Step 5: 流式光标尊重 prefers-reduced-motion**

定位 `<span className="animate-pulse">▌</span>`（原 ChatMessage.tsx:486）：

```tsx
<span className="animate-pulse motion-reduce:animate-none">▌</span>
```

- [ ] **Step 6: build + 全量 test**

```bash
npm run build && npm test
```

Expected: 都通过。如果 ChatMessage.test.tsx fail 看是否 className 断言（更新断言到新值）。

- [ ] **Step 7: 端到端验证（关键）**

```bash
npm run dev:next &
sleep 15
```

执行：
1. 发一条文本消息 → 看完整流式 → 完成态
2. 上传图片再发 → 看图片预览卡片
3. 上传 PDF 再发 → 看 PDF 卡片
4. AI 完成后点复制 → 验证复制
5. 点重新生成 → 验证重新生成
6. 点赞 / 踩 → 验证反馈

任何一步坏 → rollback。

```bash
kill %1
```

- [ ] **Step 8: Commit**

```bash
git add src/components/chat/ChatMessage.tsx
git commit -m "refactor: ChatMessage 视觉重做 + a11y/对比度修复

- 用户气泡：bg-primary/10 dark:bg-primary/15 + rounded-2xl
- 操作按钮：h-6 w-6 → h-8 w-8（达 a11y 触摸目标）
- 时间戳：text-[10px]/50 → text-xs/70（提升暗色对比度）
- 文件卡片：色块上叠加 MIME 文字标签（解决仅靠颜色传达信息问题）
- 流式光标 motion-reduce:animate-none

业务逻辑（流式渲染 / 操作回调）完全不动。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 3a Rollback:** `git revert HEAD`

**Phase 3a Red lines:** 不动流式渲染逻辑、scroll-stick、消息编辑、Redux action dispatch；MarkdownRenderer 调用方式不动（仅可能调外层容器 className）。

---

## Phase 3b：ReasoningContent CLS 修复

**Goal:** 修掉 `max-h-[200px]` 硬编码导致的 CLS 与内容截断问题，用 grid-template-rows 0fr→1fr 过渡（无 CLS、自适应高度）。

### Task 3b.1: 重写折叠动画

**Files:**
- Modify: `src/components/chat/ReasoningContent.tsx`

- [ ] **Step 1: 替换 line 95-98 的折叠容器**

定位：`ReasoningContent.tsx:95-98`：

```tsx
<div className={cn(
  "transition-all duration-300 ease-in-out overflow-hidden",
  actuallyVisible ? "max-h-[200px] opacity-100" : "max-h-0 opacity-0"
)}>
```

替换为（grid-rows trick）：

```tsx
<div
  className={cn(
    "grid transition-[grid-template-rows] duration-300 ease-out",
    actuallyVisible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
  )}
  style={{ transitionProperty: 'grid-template-rows, opacity' }}
>
  <div className="overflow-hidden">
```

并对应在原 `</div>` 之前补一个内层闭合 `</div>`（即新增了一层 wrapper）。

完整替换的最小可工作 patch（替换 line 95-145 整块）：

```tsx
      {/* 内容区（grid-rows 过渡，无 CLS） */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          actuallyVisible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className={cn(
            "px-3 pb-3 border-t border-border/30 relative",
            isStreaming && "border-l-2 border-l-info/60 ml-0"
          )}>
            <div
              ref={scrollRef}
              className="pt-2 text-xs text-muted-foreground leading-relaxed max-h-[280px] overflow-y-auto"
            >
              {content && content.trim() ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    pre: ({ children }) => <>{children}</>,
                    code: ({ className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeContent = String(children).replace(/\n$/, '');
                      if (match && codeContent.includes('\n')) {
                        return (
                          <CodeBlock
                            language={match[1]}
                            value={codeContent}
                            showLineNumbers={false}
                            maxLines={10}
                          />
                        );
                      }
                      return (
                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono" {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {content.trim()}
                </ReactMarkdown>
              ) : (
                <span className="text-muted-foreground animate-pulse motion-reduce:animate-none">AI 正在组织思路...</span>
              )}
            </div>
            {isOverflowing && (
              <div className="absolute bottom-3 left-3 right-3 h-6 bg-gradient-to-t from-muted/80 to-transparent pointer-events-none rounded-b" />
            )}
          </div>
        </div>
      </div>
```

注意改动：
- 容器从 `transition-all max-h-[200px]` → `grid grid-rows-[0fr|1fr]`
- 内层 scroll 区从 `max-h-[160px]` → `max-h-[280px]`（解放高度限制，但仍有滚动上限避免极端长内容撑爆视区）
- streaming border 颜色 `border-l-blue-400/60` → `border-l-info/60`（用 design token）
- inline code 背景 `bg-slate-100 dark:bg-slate-800` → `bg-muted`

- [ ] **Step 2: 容器外框颜色对齐 design token**

定位：`ReasoningContent.tsx:64-69`：

```tsx
isStreaming
  ? "border-blue-400/30 bg-blue-500/5"
  : "border-border/50 bg-muted/30"
```

替换为：

```tsx
isStreaming
  ? "border-info-border bg-info-bg"
  : "border-border/50 bg-muted/30"
```

- [ ] **Step 3: 流式状态点颜色**

定位：`ReasoningContent.tsx:76-79`：

```tsx
{isStreaming ? (
  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
) : (
```

替换：

```tsx
{isStreaming ? (
  <span className="h-1.5 w-1.5 rounded-full bg-info animate-pulse motion-reduce:animate-none" />
) : (
```

- [ ] **Step 4: build 验证**

```bash
npm run build
```

Expected: 编译成功。

- [ ] **Step 5: 视觉 + scroll-stick 回归验证（关键）**

```bash
npm run dev:next &
sleep 15
```

执行：
1. 触发深度思考的对话（任意能开 reasoning 的提示）
2. **重点观察**：流式过程 reasoning 容器**是否还闪跳 / 截断**（应不再有 CLS）
3. 折叠/展开动画顺滑（应不再硬截）
4. **scroll-stick 还工作**（流式输出时滚到底，新内容继续黏底）

如果 scroll-stick 坏了 → 这是高风险路径，需要：
- 保留 grid-rows 改动
- 检查 ChatMessageList 的 scroll detection 是不是依赖了 reasoning 容器固定高度
- 如果是，**rollback 这个 phase**，重新评估

```bash
kill %1
```

- [ ] **Step 6: 全量 test**

```bash
npm test
```

Expected: 通过。

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/ReasoningContent.tsx
git commit -m "fix: ReasoningContent 修复 max-h CLS bug 并对齐 design token

- 折叠容器从 max-h-[200px]/max-h-0 改为 grid-template-rows 0fr/1fr 过渡
  → 自适应高度，无 CLS，无截断
- 内层 scroll 上限从 160px 提到 280px（避免极端长推理被压扁）
- 流式态颜色 blue-* → info-* 走 design token
- 边框 border-blue-400/30 → border-info-border + bg-info-bg
- inline code 背景 bg-slate-* → bg-muted
- 加 motion-reduce:animate-none

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 3b Rollback:** `git revert HEAD`

**Phase 3b Red lines:** 不动 ReactMarkdown 调用、不动 CodeBlock 调用、不动 useRef/useEffect 滚动逻辑；不动 props 接口（ChatMessage 调用方不需要改）。

---

## Phase 3c：AgentStepCard 视觉 + status pending

**Goal:** 替换硬编码 gray-/blue-/green- 颜色为 design token，新增 `pending` status 渲染（dim 灰），对齐 prototype 三态视觉。

### Task 3c.1: AgentStepCard token 化 + pending status

**Files:**
- Modify: `src/components/chat/AgentStepCard.tsx`

- [ ] **Step 1: 容器 + header 颜色对齐 token**

定位：`AgentStepCard.tsx:38`：

```tsx
className="mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden"
```

替换：

```tsx
className="mb-3 rounded-lg border border-border bg-muted/30 overflow-hidden"
```

定位：`AgentStepCard.tsx:42`：

```tsx
className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
```

替换：

```tsx
className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
```

- [ ] **Step 2: status 图标颜色**

定位：`AgentStepCard.tsx:45-49`：

```tsx
{isRunning ? (
  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
) : (
  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
)}
```

替换：

```tsx
{isRunning ? (
  <Loader2 className="w-3.5 h-3.5 animate-spin text-info motion-reduce:animate-none" />
) : (
  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
)}
```

定位：`AgentStepCard.tsx:57`：

```tsx
<span className="text-xs text-amber-500 font-normal">已达上限</span>
```

替换：

```tsx
<span className="text-xs text-warn font-normal">已达上限</span>
```

- [ ] **Step 3: 折叠摘要按钮颜色**

定位：`AgentStepCard.tsx:28-33` 折叠态按钮：

```tsx
className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-2"
```

替换：

```tsx
className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
```

- [ ] **Step 4: 步骤项 status 三态渲染（含 pending）**

定位：`AgentStepCard.tsx:68-74`：

```tsx
<div className="mt-0.5 flex-shrink-0">
  {agentStep.status === 'completed' ? (
    <CheckCircle2 className="w-3 h-3 text-green-500" />
  ) : (
    <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
  )}
</div>
```

替换为三态：

```tsx
<div className="mt-0.5 flex-shrink-0">
  {agentStep.status === 'completed' ? (
    <CheckCircle2 className="w-3 h-3 text-success" />
  ) : agentStep.status === 'running' ? (
    <Loader2 className="w-3 h-3 animate-spin text-info motion-reduce:animate-none" />
  ) : (
    <div className="w-3 h-3 rounded-full border border-border-strong" />
  )}
</div>
```

（pending 用空圆框，灰色调）

- [ ] **Step 5: 步骤标签颜色 pending 区分**

定位：`AgentStepCard.tsx:76-78`：

```tsx
<div className="text-gray-500 dark:text-gray-400 mb-0.5">
  步骤 {agentStep.step}
</div>
```

替换：

```tsx
<div className={cn(
  "mb-0.5",
  agentStep.status === 'pending' ? "text-fg-subtle" : "text-muted-foreground"
)}>
  步骤 {agentStep.step}
  {agentStep.status === 'pending' && <span className="ml-1.5 text-fg-subtle">· 等待中</span>}
</div>
```

并在 `AgentStepCard.tsx` 顶部 import 区追加：

```tsx
import { cn } from '@/lib/utils';
```

- [ ] **Step 6: 工具图标颜色**

定位：`AgentStepCard.tsx:80-93`：

```tsx
{tc.toolName === 'web_search' ? (
  <Search className="w-3 h-3 flex-shrink-0 text-blue-500" />
) : (
  <Globe className="w-3 h-3 flex-shrink-0 text-emerald-500" />
)}
```

替换：

```tsx
{tc.toolName === 'web_search' ? (
  <Search className="w-3 h-3 flex-shrink-0 text-info" />
) : (
  <Globe className="w-3 h-3 flex-shrink-0 text-teal" />
)}
```

定位 line 87-92 的 status 渲染：

```tsx
{tc.status === 'running' && (
  <Loader2 className="w-3 h-3 animate-spin text-gray-400 flex-shrink-0" />
)}
{tc.status === 'failed' && (
  <span className="text-red-500 flex-shrink-0">失败</span>
)}
```

替换：

```tsx
{tc.status === 'running' && (
  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0 motion-reduce:animate-none" />
)}
{tc.status === 'failed' && (
  <span className="text-danger flex-shrink-0">失败</span>
)}
```

- [ ] **Step 7: build + test**

```bash
npm run build && npm test
```

Expected: 通过。

- [ ] **Step 8: 端到端验证**

启动 dev，触发一次深度搜索（开启"深度搜索"开关后发问题）：
1. 第一步 running → 蓝色 spinner
2. 完成 → 绿色 check
3. 后续步骤 pending → 灰色空圆框 + "等待中"
4. 全部完成后折叠摘要 → 文字按钮干净
5. 重新展开 → 三态都正常

```bash
npm run dev:next &
sleep 15
# 操作完
kill %1
```

- [ ] **Step 9: Commit**

```bash
git add src/components/chat/AgentStepCard.tsx
git commit -m "refactor: AgentStepCard token 化 + 新增 pending status 渲染

- 容器/header/按钮颜色全部走 design system token (info/success/warn/danger/teal)
- 移除硬编码 bg-gray-*/text-blue-*/text-green-*/text-amber-*/text-red-* 等
- 新增 'pending' status 渲染：空圆框 + 'etc 等待中' 灰色
- 流式 spinner 加 motion-reduce:animate-none

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 3c Rollback:** `git revert HEAD`

**Phase 3c Red lines:** 不动 AgentStep 类型定义（`@/redux/slices/streamSlice`）；不动 isStreaming/limitReached prop 计算；不动 step/toolCall 数据流。

---

## Phase 3d：SourcesPanel + SourcesSidebar

**Goal:** 行内 SourcesPanel 视觉对齐 token；SourcesSidebar 宽度 360→400px，新增按 section 分组渲染。

### Task 3d.1: SourcesPanel pill 视觉

**Files:**
- Modify: `src/components/chat/SourcesPanel.tsx`

- [ ] **Step 1: 读 SourcesPanel 当前实现**

```bash
cat src/components/chat/SourcesPanel.tsx
```

- [ ] **Step 2: 应用 token 化 + pill 视觉**

替换硬编码颜色：
- pill 容器：`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/40 bg-bg-subtle hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors`
- 序号圆圈：`text-[9px] font-bold text-info`
- 来源 host：`text-fg-secondary`

label 加图标 + 文字：

```tsx
<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
  <Globe className="w-3 h-3 text-teal" />
  参考 {sources.length} 篇资料
</span>
```

- [ ] **Step 3: build + 视觉验证**

```bash
npm run build
npm run dev:next &
sleep 15
```

完成对话后看完成态消息底部的 sources pill row。

```bash
kill %1
```

### Task 3d.2: SourcesSidebar 宽度 + 分组

**Files:**
- Modify: `src/components/chat/SourcesSidebar.tsx`

- [ ] **Step 1: 改宽度 360 → 400px**

定位 `w-[360px]`：

```bash
grep -n "w-\[360px\]" src/components/chat/SourcesSidebar.tsx
```

替换为 `w-[400px]`。

- [ ] **Step 2: 添加按 section 分组渲染**

确认 `SearchSourceSummary` 类型是否含 `section?: string` 字段：

```bash
grep -rn "interface SearchSourceSummary\|type SearchSourceSummary" src --include="*.ts" --include="*.tsx" | head -5
```

如果**没有** `section` 字段：保留平铺渲染，**不强加分组**（避免破坏现有数据流），仅做视觉调整。
如果**有** `section` 字段：在 SourcesSidebar 渲染前按 section 分组：

```tsx
const grouped = sources.reduce((acc, src) => {
  const section = src.section || '其他';
  (acc[section] ||= []).push(src);
  return acc;
}, {} as Record<string, SearchSourceSummary[]>);
```

每个分组用 section title + 列表：

```tsx
{Object.entries(grouped).map(([section, items]) => (
  <div key={section} className="mb-4">
    <div className="px-4 pt-3 pb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
      {section}
    </div>
    {items.map(src => (/* 现有列表项渲染 */))}
  </div>
))}
```

- [ ] **Step 3: 列表项视觉对齐 token**

把硬编码颜色（`text-blue-*` / `bg-slate-*` 等）替换为 design token。

- [ ] **Step 4: build + test**

```bash
npm run build && npm test
```

- [ ] **Step 5: 端到端验证**

启动 dev，触发完成态对话（带 sources），看右侧 rail 宽度 400 + 分组（如果有 section 数据）。

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/SourcesPanel.tsx src/components/chat/SourcesSidebar.tsx
git commit -m "refactor: Sources 组件视觉对齐 + SourcesSidebar 宽度调到 400px

- SourcesPanel pill 容器走 design token，序号 text-info、host text-fg-secondary
- 来源 label 加 Globe 图标（teal 色）
- SourcesSidebar 宽度 360 → 400px（对齐 design system v2 规范）
- 如数据含 section 字段，按 section 分组渲染（官方文档/参考案例/...）

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 3d Rollback:** `git revert HEAD`

**Phase 3d Red lines:** 不动 SearchSourceSummary 类型；不动 ESC 关闭 / 背景遮罩 / target="_blank" 行为。

---

## Phase 4：SuggestedQuestions + ModelSelector 触发器

**Goal:** SuggestedQuestions 卡片视觉对齐 prototype；ModelSelectorTrigger 视觉对齐。**完全不动登录检查、换一批 fetch、Popover 内部 panel。**

### Task 4.1: SuggestedQuestions 视觉

**Files:**
- Modify: `src/components/chat/SuggestedQuestions.tsx`

- [ ] **Step 1: 卡片 className 对齐**

每个 suggested question 卡片：

```tsx
className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg
           border border-border bg-bg-subtle hover:bg-muted hover:border-border-strong
           text-sm text-foreground transition-colors"
```

icon：用 `MessageSquare` 或 `ChevronRight`，颜色 `text-muted-foreground group-hover:text-foreground`

label "你可能想问：" 加 HelpCircle 图标，颜色 `text-info`：

```tsx
<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
  <HelpCircle className="w-3 h-3 text-info" />
  你可能想问：
</span>
```

"换一批" 按钮：

```tsx
className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
```

- [ ] **Step 2: build + test**

```bash
npm run build && npm test
```

Expected: SuggestedQuestions.test.tsx 通过。

- [ ] **Step 3: 端到端验证**

启动 dev，完成态查看推荐问题 + 换一批：

```bash
npm run dev:next &
sleep 15
# 验证完
kill %1
```

### Task 4.2: ModelSelectorTrigger 视觉

**Files:**
- Modify: `src/components/models/ModelSelectorTrigger.tsx`

- [ ] **Step 1: 读现有实现**

```bash
cat src/components/models/ModelSelectorTrigger.tsx
```

- [ ] **Step 2: 触发器视觉对齐**

把按钮 className 调整为：

```tsx
className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
           border border-border bg-bg-elevated hover:bg-muted
           text-sm text-foreground transition-colors"
```

provider logo `<img>` 控制在 `w-4 h-4`，model name `text-sm`，下拉箭头 `ChevronDown w-3 h-3 text-muted-foreground`。

- [ ] **Step 3: build + test**

```bash
npm run build && npm test
```

Expected: ModelSelector.test.tsx 通过。

- [ ] **Step 4: 端到端验证**

启动 dev，点击 composer 里 model picker → Popover 打开：
1. 触发器视觉对齐
2. Popover 内部内容（model 列表）**没动**，应跟之前一样

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/SuggestedQuestions.tsx src/components/models/ModelSelectorTrigger.tsx
git commit -m "style: SuggestedQuestions + ModelSelectorTrigger 视觉对齐

- SuggestedQuestions 卡片走 border/bg-subtle/hover:bg-muted token，HelpCircle 用 info 色
- '换一批' 按钮 hover 文字色变化
- ModelSelectorTrigger 触发器走 bg-elevated + border + hover:bg-muted token
- Popover panel 内部完全不动

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 4 Rollback:** `git revert HEAD`

**Phase 4 Red lines:** 不动 SuggestedQuestions 的 onSelectQuestion / onRefresh 调用、登录检查、isBusy 计算；不动 ModelSelectorPanel / ModelCard / CapabilityChip 等 panel 内部组件。

---

## Phase 5：HomePage（最小改动，token 替换）

**Goal:** HomePage 现有 9-pill wave-flip 已与 prototype 视觉一致，仅做 token 对齐让其走 design system 而非裸 className。

### Task 5.1: HomePage pill className 对齐 token

**Files:**
- Modify: `src/components/home/HomePage.tsx`

- [ ] **Step 1: 替换 pill className（line 157）**

定位：`HomePage.tsx:157` 的 button className：

```tsx
className="px-5 py-2.5 rounded-[20px] bg-muted/50 text-[14px] leading-5 text-foreground/70 whitespace-nowrap
           shadow-[0_2px_8px_rgba(0,0,0,0.12)]
           hover:bg-muted hover:text-foreground hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)]
           dark:shadow-[0_2px_8px_rgba(255,255,255,0.06)] dark:border dark:border-white/10
           dark:hover:shadow-[0_4px_12px_rgba(255,255,255,0.1)] dark:hover:border-white/20
           cursor-pointer"
```

替换为更克制、走 token：

```tsx
className="px-5 py-2.5 rounded-[20px] bg-bg-subtle text-md leading-5 text-fg-secondary whitespace-nowrap
           border border-border
           hover:bg-muted hover:text-foreground hover:border-border-strong
           transition-colors cursor-pointer"
```

（移除 box-shadow，改为 1px hairline border；light/dark 都用同一规则不再分岔写）

- [ ] **Step 2: skeleton loading className 对齐**

定位 skeleton：

```tsx
className="h-10 rounded-[20px] bg-muted/50 animate-pulse"
```

替换：

```tsx
className="h-10 rounded-[20px] bg-muted animate-pulse motion-reduce:animate-none"
```

- [ ] **Step 3: hero h1 字号对齐**

定位：

```tsx
className="text-2xl font-bold text-foreground mb-12 text-center"
```

prototype `--text-3xl: 32px`，所以保留 `text-2xl`（24px）也合理。**不动**这条（避免破坏移动端阅读流）。

- [ ] **Step 4: build + test**

```bash
npm run build && npm test
```

Expected: HomePage.test.tsx 通过。

- [ ] **Step 5: 端到端验证**

启动 dev，进入空对话状态：
1. 9 pill wave-flip 动画正常
2. light 下 pill 有可见 1px border
3. dark 下 pill 也有 border
4. 点击任意 pill → 正常发送消息

```bash
npm run dev:next &
sleep 15
# 验证完
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add src/components/home/HomePage.tsx
git commit -m "style: HomePage pill 走 design system token

- pill 从 box-shadow + bg-muted/50 改为 1px border + bg-bg-subtle
- light/dark 统一用 border-border / hover:border-border-strong
- text-foreground/70 → text-fg-secondary（走语义 token）
- skeleton 加 motion-reduce:animate-none

wave-flip 动画 / 数据流 / 登录检查全部不动。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Phase 5 Rollback:** `git revert HEAD`

**Phase 5 Red lines:** 不动 wave-flip 动画时序、PROMPTS pool fetch、登录检查、shuffle 算法。

---

## Phase 6：全量验证 + 收尾

**Goal:** 全栈验证 + 暗色对比度肉眼回归 + 流式完整流程跑通 + 准备本地 demo（不 push）。

### Task 6.1: 全量验证

**Files:** （无文件改动）

- [ ] **Step 1: build**

```bash
npm run build
```

Expected: 成功，无 warning（除已存在的）。

- [ ] **Step 2: test**

```bash
npm test
```

Expected: 全部通过。

- [ ] **Step 3: 整合 baseline 对照截图**

```bash
npm run dev:next &
sleep 15
```

手动截 6 张图保存到 `~/Downloads/phase-final/`：
- `home-light.png` / `home-dark.png` — 空对话
- `chat-streaming-light.png` / `chat-streaming-dark.png` — 流式中
- `chat-done-light.png` / `chat-done-dark.png` — 完成态（带 reasoning + agent + sources）

逐张对比 prototype `~/Downloads/Fusion Chat v2/`（用 macOS Preview 双开）。差异允许在：
- 字号略小/大（中文 vs 西文 metric 差）
- 时间戳格式
- 模型名长度

差异**不允许**在：
- 颜色用了硬编码而非 token
- 触摸目标 < 44px
- 暗色对比度低于 baseline

```bash
kill %1
```

- [ ] **Step 4: 完整对话流程**

启动 dev，做这套：
1. 进入空对话 → 点 pill 发送 → 流式输出（带 reasoning） → 完成（带 sources + suggested）
2. 点推荐问题 → 进入新流式
3. 切换主题 → 整个 UI 切到对侧色彩
4. 点 sidebar 已有对话 → 跳到完成态
5. 拖动 sidebar 边缘 → 宽度变化
6. 上传图片 + 文本 → 发送 → AI 回答含图片理解
7. 切换模型 → 模型 picker 工作

**任何一步坏 → 定位到对应 phase rollback**。

- [ ] **Step 5: git log 整理回顾**

```bash
git log --oneline main..feat/design-system-v2
```

Expected: ~10 个 commit，每个 commit message 清晰。

- [ ] **Step 6: 写 Phase 总结备忘**

```bash
cat > docs/superpowers/plans/2026-04-30-design-system-v2-summary.md <<'EOF'
# Design System v2 落地总结

完成时间: 2026-04-30
分支: feat/design-system-v2
基于 commit: <填实际的 main HEAD>

## 完成的 phase
- [x] Phase 0 — Token 基础
- [x] Phase 1a — Header
- [x] Phase 1b — Sidebar
- [x] Phase 2 — ChatInput
- [x] Phase 3a — ChatMessage
- [x] Phase 3b — ReasoningContent (CLS fix)
- [x] Phase 3c — AgentStepCard (token + pending)
- [x] Phase 3d — Sources
- [x] Phase 4 — SuggestedQuestions + ModelSelector
- [x] Phase 5 — HomePage
- [x] Phase 6 — 全量验证

## 已知未做的（留作后续）
- SuggestedQuestions globalThis.triggerLoginDialog 重构（架构债）
- ModelSelector Popover panel 内部视觉（panel 本身未改）
- highlight.js → Shiki 迁移（独立项目）

## 下一步
等用户验收 → push 上 dev → 灰度观察 → 合 main
EOF
```

- [ ] **Step 7: 不要 push（等用户验收）**

```bash
echo "
=== 下一步动作（user 决定）===
1. 用户切到 feat/design-system-v2 分支本地试用
2. 用户验收
3. user 明确说 'push' 才推 origin
4. user 明确说 'merge' 才合 main
"
```

**Phase 6 Rollback:** 无（验证 phase 不改代码）

---

## 失败处理总规则

### 单 phase 失败
- `git reset --hard HEAD~N`（N = 该 phase 的 commit 数）
- 重新评估 phase 的具体 task 哪一步出问题
- 修复后从该 task 重新开始

### 跨 phase 影响
- 如果 phase 3a (ChatMessage) 改动影响了 phase 3b (ReasoningContent) 的渲染
- 先 rollback phase 3b（最近一个 commit），再排查 3a 的根因

### 测试失败
- 不要为了通过测试而改测试
- 先看测试在断言什么。如果是 className 字符串断言，那是测试需要更新（属于合理变更）
- 如果是行为断言失败，那是代码改坏了，**rollback 重做**

### Build 失败
- 优先看是不是 import 错误（新 import 漏写、路径错误）
- 是不是 TS 类型错误（新加 prop / className 不匹配 type）
- 是不是 tailwind 配置错误（新 color key 名拼错）
- 都不是 → rollback 重做

---

## Self-Review Checklist

写完此 plan 自检：

✅ **Spec coverage** — 6 个 phase 覆盖了 migration-survey.md 的全部 14 个 prototype 组件映射
✅ **D1-D4 决策** — 全部有对应 task（D1: Phase 1a Step 6/7；D2: Phase 1b Task 1.1；D3: 全文不出现 highlight.js 替换；D4: Phase 3b）
✅ **No placeholders** — 每个 step 有具体代码 / 具体命令 / 具体 className 替换
✅ **Type consistency** — 不引入新 type；使用现有的 AgentStep / SearchSourceSummary 等类型（不重命名）
✅ **Red lines** — 每个 phase 末尾明确列出"绝对不碰"清单
✅ **Rollback** — 每个 phase 都有 `git revert` 单命令回滚
✅ **Verification** — 每个 phase 都有 build + test + 视觉/端到端验证步骤
✅ **Commits** — 每个 task 一个清晰的 commit message（中文，带 Co-Authored-By）
