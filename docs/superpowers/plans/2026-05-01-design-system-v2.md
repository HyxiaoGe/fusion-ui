# Fusion Design System v2 落地 Plan (修订版 rev2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **本文档替代 `2026-04-30-design-system-v2.md`** 与本文件 rev1 版本。
> - rev1：处理了首轮审阅的 5 blocker + 5 高风险
> - **rev2（当前）**：处理了二轮审阅的 4 blocker + 2 polish：
>   - Header.tsx 经验证从未被使用 → 删除（dead code）
>   - 决策更新：D1 改走方案 C —— 主题切换按钮放 ChatSidebar 底部，**不新增桌面 top bar**
>   - `text-on-primary` 不存在 → 改用 `text-primary-foreground`
>   - Phase 3c "深度搜索开关" 残留 → 改为通用 agent 流程触发
>   - `transitionDuration.DEFAULT` 覆盖默认 → 删除 DEFAULT key
>   - `useResolvedTheme` 初始值闪现 → 从 mode 派生
>   - import 指令明确 "合并到现有 import"

**Goal:** 把 Claude Design 出的 Fusion Design System v2 prototype（位于 `~/Downloads/Fusion Chat v2/`）的视觉与交互决策，迁移到 fusion-ui 现有代码，覆盖 chat 主流程的 9 类组件 + token 基础。

**Architecture:** 纯 additive token + 视觉层重构。仅改渲染层（className、JSX 结构、token 引用），所有事件处理、Redux 流转、API 调用、流式逻辑、文件上传、Agent 执行 100% 不动。Token 走现有 CSS variable 桥接，不删旧 token，新增 5 套语义色 + 完整 type/spacing/shadow/motion scale，并校准暗色对比度。

**Tech Stack:** Next.js 15 (App Router) + React 19 + Tailwind v3 (CSS var bridge) + shadcn/ui 风格组件（含 `<Textarea>`、`<Button>`、`DropdownMenu`）+ Lucide React + Redux Toolkit。已安装 Vitest 测试栈。

**User Decisions (D1-D4):**
- **D1（rev2 修订）**: Header.tsx 当前从未被使用，**直接删除**作为死代码清理；快捷主题切换按钮加到 **ChatSidebar 底部** UserAvatarMenu 旁边（**不新增桌面 top bar**，保持 fusion-ui 现有 layout 结构）；SettingsDialog `ThemeToggle` 保留高级（system 模式）
- **D2**: ResizableSidebar 默认宽度 240→320px，移除 className 写死的 `w-[360px]` bug
- **D3**: 保留 highlight.js（CodeBlock 不换 tokenizer），仅调容器视觉
- **D4**: 修 ReasoningContent 的 `max-h-[200px]` 截断 bug，改用 grid-template-rows 自适应

**Reference:**
- Prototype: `~/Downloads/Fusion Chat v2/`（解压稳定路径）
- Survey: `fusion-ui/docs/migration-survey.md`
- Review: `fusion-ui/docs/superpowers/plans/2026-05-01-design-system-v2-plan-review.md`
- Token source: `~/Downloads/Fusion Chat v2/colors_and_type.css`

**Red lines（绝对不碰）：**
- Redis Stream 通信、流式 scroll-stick 逻辑（`ChatMessageList`）
- Agent 执行链路、Tool dispatcher、`AgentStep` 类型定义（`'running' | 'completed'`）
- 文件上传 / 图片 vision / URL read 业务代码
- Redux store shape、action 命名、API client（`fetchWithAuth` 等）
- `MarkdownRenderer` 引用替换核心机制
- `SuggestedQuestions` 的 `globalThis.triggerLoginDialog` 耦合（已知技术债，本次不修）
- `ModelSelector` 的 Popover panel 内部组件
- `SearchSourceSummary` 类型（`{title, url, favicon?}`，无 `section` 字段）

---

## File Structure

| 文件 | 变更类型 | Phase |
|------|---------|-------|
| `src/app/globals.css` | 修改（追加 token） | 0a |
| `src/app/globals.css` | 修改（暗色 3 个 token 校准） | 0b |
| `tailwind.config.js` | 修改（追加 colors / fontSize / transitionDuration / boxShadow） | 0a |
| `src/components/layouts/Header.tsx` | **删除**（dead code，从未被任何地方 import） | 1a |
| `src/lib/hooks/useResolvedTheme.ts` | 新建 | 1a |
| `src/lib/hooks/useResolvedTheme.test.ts` | 新建 | 1a |
| `src/components/chat/ChatSidebar.tsx` | 修改（Phase 1a 加主题切换 + Phase 1b 容器层 token） | 1a + 1b |
| `src/components/layouts/ResizableSidebar.tsx` | 修改（宽度 + 移除 w-[360px]） | 1b |
| `src/components/chat/ChatInput.tsx` | 修改（外层 card 视觉 + 思考按钮 active 改 info） | 2 |
| `src/components/chat/ChatMessage.tsx` | 修改（用户气泡 + 操作按钮 ≥32px + 文件卡片 MIME 标签） | 3a |
| `src/components/chat/ReasoningContent.tsx` | 修改（grid-rows + token 化） | 3b |
| `src/components/chat/AgentStepCard.tsx` | 修改（**仅 token 化**，不动 status 枚举） | 3c |
| `src/components/chat/SourcesPanel.tsx` | 修改（视觉对齐） | 3d |
| `src/components/chat/SourcesSidebar.tsx` | 修改（360→400px + 视觉对齐） | 3d |
| `src/components/chat/SuggestedQuestions.tsx` | 修改（卡片视觉） | 4 |
| `src/components/models/ModelSelectorTrigger.tsx` | 修改（触发器视觉） | 4 |
| `src/components/home/HomePage.tsx` | 修改（token 替换，**保留 subtle shadow**） | 5 |

---

## Pre-flight：建分支 + 拉基线

### Task P1: 建分支 + 验证当前状态

**Files:** （无文件改动）

- [ ] **Step 1: 确认在 fusion-ui 子目录、当前分支干净**

```bash
cd /Users/sean/code/fusion/fusion-ui
git status
```

Expected: working tree clean。如有未提交改动先 stash / commit / discard，**不要在脏工作区上动工**。

- [ ] **Step 2: 从 main 拉新分支**

```bash
git fetch origin
git checkout -b feat/design-system-v2 origin/main
```

Expected: Switched to a new branch 'feat/design-system-v2'

- [ ] **Step 3: lockfile 一致的依赖安装**

```bash
npm ci
```

Expected: 安装成功（不修改 lockfile）。如果失败请 fall back 到 `npm install` 但要 review lockfile diff。

- [ ] **Step 4: 拉基线截图 + 确认 build/test 干净**

```bash
mkdir -p ~/Downloads/baseline-before
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

打开浏览器访问 `http://localhost:3000`，**手动**截 4 张图保存到 `~/Downloads/baseline-before/`：
- `home-light.png`、`home-dark.png` — 首页空对话
- `chat-light.png`、`chat-dark.png` — 任意已有对话

然后：

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

```bash
npm run build && npm test
```

Expected: build 与 test 都通过。**任何一项失败 = 基线不干净 = 先解决再继续**。

---

## Phase 0a：纯 additive token（零回归）

**Goal:** 在 globals.css 追加 prototype 的完整 token 体系（type / spacing / shadow / motion / 5 套语义色 / bg-fg 细分），并在 tailwind.config.js 桥接为可用 utility。**本 phase 不改任何现有 token，不改任何组件**。

**Verification:** 截图必须与 baseline 完全一致（因为没有组件用新 token，纯追加）。

### Task 0a.1: 追加 :root token

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 在 `:root {` 块尾部追加新 token**

定位：找到 `:root` 块尾部的最后一行原 token（`--select-dropdown-max-height: 400px;`），在其下方、`}` 之前追加：

```css
  /* === Fusion Design System v2 — 新增 token (additive, 不影响现有) === */

  /* Type scale (desktop-density) */
  --text-2xs: 10px;
  --text-fdv2-xs: 11px;
  --text-fdv2-sm: 12px;
  --text-fdv2-base: 13px;
  --text-md: 14px;
  --text-fdv2-lg: 16px;
  --text-fdv2-xl: 20px;
  --text-fdv2-2xl: 24px;
  --text-fdv2-3xl: 32px;
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
  /* 注意：shadow-xs 已被 shadcn UI（button/input/textarea/radio/select）用作 className，
     Tailwind 默认未定义它所以现状是 no-op；用 -fdv2 前缀避免桥接后激活成真 shadow 引发回归 */
  --shadow-fdv2-xs: 0 1px 0 0 oklch(0 0 0 / 0.04);
  --shadow-fdv2-sm: 0 1px 2px 0 oklch(0 0 0 / 0.05);
  --shadow-fdv2-md: 0 2px 8px 0 oklch(0 0 0 / 0.08);
  --shadow-fdv2-lg: 0 8px 24px -4px oklch(0 0 0 / 0.10);
  --shadow-popover: 0 10px 32px -6px oklch(0 0 0 / 0.18);

  /* Motion */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-fdv2-out: cubic-bezier(0.16, 1, 0.3, 1);
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

  /* 语义色 — danger (red) */
  --danger: oklch(0.577 0.245 27);
  --danger-bg: oklch(0.96 0.03 27);
  --danger-border: oklch(0.9 0.06 27);

  /* 语义色 — teal */
  --teal: oklch(0.65 0.12 180);

  /* bg/fg 细分 */
  --bg-subtle: oklch(0.985 0 0);
  --bg-elevated: oklch(1 0 0);
  --fg-secondary: oklch(0.35 0 0);
  --fg-subtle: oklch(0.7 0 0);
  --border-strong: oklch(0.85 0 0);
```

> **命名约定**：所有可能与 shadcn / Tailwind 默认 token 冲突的，加 `-fdv2` 中缀（如 `--text-fdv2-base`）。完全新增的（如 `--info`、`--bg-subtle`）不加。

- [ ] **Step 2: 在 `.dark { ... }` 块尾部追加 dark 版本（仅追加，不覆盖）**

定位：`.dark {` 块尾部 `}` 之前。

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

- [ ] **Step 3: build 验证**

```bash
npm run build
```

Expected: 编译成功。

### Task 0a.2: tailwind.config.js 完整桥接

**Files:**
- Modify: `tailwind.config.js`

- [ ] **Step 1: 在 `theme.extend` 中追加四类 utility 桥接**

定位：`tailwind.config.js` 的 `theme.extend.colors` 块（行 11-31）末尾 `ring: 'var(--ring)',` 之后、`},` 之前追加 colors 部分；然后在 `theme.extend` 内（colors 块外）追加 fontSize / transitionDuration / boxShadow / transitionTimingFunction。

完整 patch（`theme.extend` 内部新增）：

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
        // teal 用 object 形式保留 Tailwind 默认 teal-50..teal-950 数字色阶
        // 不写成 'var(--teal)' 因为字符串形式会整个替换默认 teal 调色板
        teal: {
          DEFAULT: 'var(--teal)',
        },
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

并在 colors 块外、`animation:` 之前追加：

```javascript
      fontSize: {
        '2xs': 'var(--text-2xs)',
        // 注意：xs/sm/base/lg/xl 等已被 Tailwind 默认占用，不重写以免破坏现有类
        // 新引入的 fdv2 命名空间避免冲突
        'fdv2-xs': 'var(--text-fdv2-xs)',
        'fdv2-sm': 'var(--text-fdv2-sm)',
        'fdv2-base': 'var(--text-fdv2-base)',
        md: 'var(--text-md)',
        'fdv2-lg': 'var(--text-fdv2-lg)',
        'fdv2-xl': 'var(--text-fdv2-xl)',
        'fdv2-2xl': 'var(--text-fdv2-2xl)',
        'fdv2-3xl': 'var(--text-fdv2-3xl)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        // 注意：不写 DEFAULT 以避免覆盖 Tailwind 默认 transition-duration（150ms）
        // 后续若需要 base，用具体类名如 duration-200 即可
        slow: 'var(--duration-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        'fdv2-out': 'var(--ease-fdv2-out)',
      },
      boxShadow: {
        // shadow-xs 已被 shadcn UI 用作 className（Tailwind 默认未定义所以现状是 no-op），
        // 桥接成有效 shadow 会让 button/input/textarea 等组件突然多出阴影 → 用 fdv2-xs 避免
        'fdv2-xs': 'var(--shadow-fdv2-xs)',
        'fdv2-sm': 'var(--shadow-fdv2-sm)',
        'fdv2-md': 'var(--shadow-fdv2-md)',
        'fdv2-lg': 'var(--shadow-fdv2-lg)',
        popover: 'var(--shadow-popover)',
      },
```

> **重要**：Tailwind v3 默认已有 `text-xs/sm/base/lg/xl/2xl/3xl`、`duration-200/300`、`shadow-sm/md/lg`、`ease-in/out` 等。本扩展只**追加新 key**（如 `text-md`、`text-2xs`、`duration-fast`、`shadow-fdv2-xs`、`ease-standard`），不重写已有 key。后续 phase 写 className 时只能用本表已定义的 key 或 Tailwind 默认 key。
>
> **特别注意 shadow-xs**：shadcn UI 的 button/input/textarea/radio/select 已在 className 里写 `shadow-xs`（Tailwind 默认未定义此 key 所以现状是 no-op）。本 plan 故意用 `shadow-fdv2-xs` 而非 `shadow-xs`，避免桥接后激活成真 shadow 引发回归。

- [ ] **Step 2: build + 现有页面无回归验证**

```bash
npm run build
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

手动截 4 张图保存到 `~/Downloads/phase0a-after/`，文件名同 baseline。用 macOS Preview 双开比对：**应完全一致**（因为本 phase 没有组件用新 token）。

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css tailwind.config.js
git commit -m "feat: 追加 Fusion Design System v2 设计 token

- 新增 5 套语义色（info/success/warn/danger/teal）+ bg/border 变体
- 新增完整 type scale (--text-2xs/--text-md/--text-fdv2-*) + leading
- 新增 spacing/shadow/motion scale
- 新增 bg/fg 细分 token (--bg-subtle/--bg-elevated/--fg-secondary/--fg-subtle/--border-strong)
- tailwind.config.js 桥接 colors / fontSize / transitionDuration / boxShadow / transitionTimingFunction
- 命名加 -fdv2 中缀避免与 shadcn / Tailwind 默认值冲突

纯 additive，不改现有 token，零视觉回归。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 0a Rollback:** `git revert HEAD`

**Phase 0a Red lines:** 不删任何现有 token。命名规则：**可能与 Tailwind / shadcn 默认 token 冲突的名称使用 `-fdv2` 中缀**（如 `--text-fdv2-base`、`--shadow-fdv2-sm`、`--ease-fdv2-out`）；**全新语义 token 不加**（如 `--info`、`--bg-subtle`、`--fg-secondary`、`--border-strong`，因为 Tailwind/shadcn 默认无同名 key）。

---

## Phase 0b：暗色对比度校准（intentional 视觉变化）

**Goal:** 校准 prototype README 明确点名的 3 个暗色 token，提升暗色下次要文字 / 卡片 / border 的对比度。**这是有意视觉变化，不是回归。**

**Verification:** 暗色下截图与 baseline 对比，**只允许 muted/border/secondary 文字对比度提升**，不允许布局、组件状态、亮色任何变化。

### Task 0b.1: .dark 块校准 3 个 token

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: 修改 `.dark` 块的 3 个现有 token**

定位：`.dark {` 块。逐个修改（用 Edit 工具的 old_string/new_string，确保唯一定位）：

```css
/* 原: --muted: oklch(0.269 0 0); */
--muted: oklch(0.225 0 0);
```

```css
/* 原: --muted-foreground: oklch(0.708 0 0); */
--muted-foreground: oklch(0.74 0 0);
```

```css
/* 原: --border: oklch(0.269 0 0); */
--border: oklch(0.32 0 0);
```

- [ ] **Step 2: build 验证**

```bash
npm run build
```

- [ ] **Step 3: 暗色对比验证**

```bash
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

手动截 dark 截图保存到 `~/Downloads/phase0b-after/`：
- `home-dark.png`、`chat-dark.png`

跟 baseline-before/ 对比，**确认**：
- 卡片背景比 canvas 略微亮一些（更易区分）
- 次要文字（时间戳、placeholder、disabled）颜色更偏白（更易读）
- border 在卡片之间更可见

亮色应**完全无变化**，对比 `~/Downloads/baseline-before/home-light.png` 等确认。

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "fix: 暗色 token 对比度校准（intentional visual change）

- --muted: 0.269 → 0.225（卡片与 canvas 区分度提升）
- --muted-foreground: 0.708 → 0.74（次要文字对比度提升）
- --border: 0.269 → 0.32（border 在暗色下更可见）

依据：design system v2 prototype README 明确点名的 3 项暗色校准。
亮色无变化。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 0b Rollback:** `git revert HEAD`

**Phase 0b Red lines:** 只改这 3 个 token，不动 `.dark` 块的任何其他 token。

---

## Phase 1a：删除 Header.tsx + ChatSidebar 底部加快捷主题切换

**Goal:** Header.tsx 经 grep 验证从未被任何文件 import 或渲染，作为 dead code 删除（顺带清掉唯一的 gradient wordmark）。把快捷主题切换按钮加到 ChatSidebar 底部 UserAvatarMenu 旁，保持 fusion-ui 桌面端"无 top bar"的现有 layout 结构。SettingsDialog `ThemeToggle` 保留高级（system 模式）。

> **决策依据**：fusion-ui MainLayout 桌面端没有传 header prop，整个 Header.tsx 是 dead file。强行接入会引入 layout 高度变化、UserAvatarMenu 位置迁移等连锁问题，超出视觉重构范围。本 phase 走方案 C（最保守，user 已拍板）—— 不动 MainLayout，theme toggle 加到 sidebar 底部。

### Task 1a.0: 验证 Header.tsx 真未被使用 + grep gradient 残余

- [ ] **Step 1: grep Header import / 渲染**

```bash
cd /Users/sean/code/fusion/fusion-ui
grep -rn "from.*['\"].*layouts/Header['\"]\|<Header[^a-zA-Z]" src --include="*.tsx" --include="*.ts"
```

Expected: **无任何输出**。

如果**有结果**：停止本 phase，报告给 user 重新评估方案 A/B/C，不要继续删除。

- [ ] **Step 2: grep gradient wordmark 残余**

```bash
grep -rn "from-blue-600.*via-purple-500.*to-pink-500" src --include="*.tsx" --include="*.ts"
```

Expected: 仅在 `src/components/layouts/Header.tsx` 出现。如果其他文件也有（不应该有），记下来一起处理。

### Task 1a.1: 删除 Header.tsx

**Files:**
- Delete: `src/components/layouts/Header.tsx`

- [ ] **Step 1: 删除文件**

```bash
git rm src/components/layouts/Header.tsx
```

- [ ] **Step 2: build 验证**

```bash
npm run build
```

Expected: 编译成功。如失败 → 1a.0 grep 没扫干净，回退并追溯使用点。

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: 删除未使用的 Header.tsx

- 经 grep 验证 Header 从未被任何文件 import 或渲染
- MainLayout.tsx 的 header prop 也无人传入
- 移动端在 MainLayout 行内渲染简化 header，桌面端无 top bar
- 同时清理唯一的 gradient wordmark
  (from-blue-600 via-purple-500 to-pink-500)
- D1 决策方案 C：主题切换走 ChatSidebar 底部，不接入 Header

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 1a.2: 新建 useResolvedTheme hook

**Files:**
- Create: `src/lib/hooks/useResolvedTheme.ts`

- [ ] **Step 1: 写 hook（初始值从 mode 派生，避免首次 render 闪现）**

```typescript
'use client';

import { useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

/**
 * 把 'light' | 'dark' | 'system' 解析为实际的 'light' | 'dark'。
 * - 'light' / 'dark' 直接返回（包括 SSR 首次 render）
 * - 'system' 通过 matchMedia 解析，并订阅 change 事件自动更新
 *
 * 初始值从 mode 派生：'dark' 立即返回 'dark'，'light'/'system' 默认 'light'，
 * 客户端 hydrate 后 useEffect 处理 'system' 的真实 matchMedia 值。
 * 避免 dark 直设模式下首次 render 显示错误图标的闪现 bug。
 *
 * SSR 安全：服务端 'system' 默认返回 'light'（无 matchMedia）。
 */
export function useResolvedTheme(mode: ThemeMode): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(
    mode === 'dark' ? 'dark' : 'light'
  );

  useEffect(() => {
    if (mode !== 'system') {
      setResolved(mode);
      return;
    }

    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setResolved(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [mode]);

  return resolved;
}
```

### Task 1a.3: ChatSidebar 底部加快捷主题切换

**Files:**
- Modify: `src/components/chat/ChatSidebar.tsx`

> **本任务只加主题切换按钮**。Phase 1b 才做 ChatSidebar 容器层 token 化（两次 commit 合理拆分关注点）。

- [ ] **Step 1: 找 ChatSidebar 底部 UserAvatarMenu 渲染位置**

```bash
grep -n "UserAvatarMenu" src/components/chat/ChatSidebar.tsx
```

记下行号。

- [ ] **Step 2: 合并到现有 import 行（不要新增重复 import）**

ChatSidebar.tsx 顶部已有的 import 行**保留并合并**新增项：

- 现有 `import { useState } from 'react';` 之类的 React import → **合并** `useCallback`：
  ```tsx
  import { useState, useCallback } from 'react';
  ```
- 现有 `import { useAppSelector } from '@/redux/hooks';` → **合并** `useAppDispatch`：
  ```tsx
  import { useAppSelector, useAppDispatch } from '@/redux/hooks';
  ```
- 现有 `import { ... } from 'lucide-react';` → **合并** `Sun, Moon`
- 不存在的独立加：
  ```tsx
  import { setThemeMode } from '@/redux/slices/themeSlice';
  import { useResolvedTheme } from '@/lib/hooks/useResolvedTheme';
  ```

> 实际是合并还是新增取决于 ChatSidebar.tsx 当前 import 结构。原则：**避免对同一模块出现两个 import 语句**。

- [ ] **Step 3: 在组件函数体内添加 state + handler**

在已有 selector / state 区域附近加：

```tsx
const dispatch = useAppDispatch();
const themeMode = useAppSelector((state) => state.theme.mode);
const resolvedTheme = useResolvedTheme(themeMode);
const isDark = resolvedTheme === 'dark';

const toggleTheme = useCallback(() => {
  // 快捷切换：light/dark 互换。System 模式由 SettingsDialog 管理。
  // 在 system 模式下点此按钮会"逃出"system 切到反向具体值。
  dispatch(setThemeMode(isDark ? 'light' : 'dark'));
}, [dispatch, isDark]);
```

- [ ] **Step 4: 在 sidebar 底部 footer 加主题切换按钮**

定位 sidebar footer 区域（包 UserAvatarMenu 的容器）。把现有 footer 容器调整为 flex 布局，在 UserAvatarMenu 旁加 toggle button：

```tsx
{/* 原（示意，实际 className 以代码为准） */}
<div className="...sidebar footer container...">
  <UserAvatarMenu />
</div>
```

调整为：

```tsx
<div className="flex items-center justify-between gap-2 ...保留原 footer container className...">
  <UserAvatarMenu />
  <button
    type="button"
    onClick={toggleTheme}
    className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast"
    aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
    title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
  >
    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
  </button>
</div>
```

> 只新增 `flex items-center justify-between gap-2` 这种 layout 类，不破坏其他原有 className。如果 UserAvatarMenu 本身预期占满宽度，可能要加 `flex-1` 给它，按现有视觉决定。

### Task 1a.4: 写 useResolvedTheme hook 测试

**Files:**
- Create: `src/lib/hooks/useResolvedTheme.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResolvedTheme } from './useResolvedTheme';

beforeEach(() => {
  // jsdom 不实现 matchMedia，mock 一个默认返回 matches: false（系统亮色）
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('useResolvedTheme', () => {
  it("'light' 模式返回 'light'", () => {
    const { result } = renderHook(() => useResolvedTheme('light'));
    expect(result.current).toBe('light');
  });

  it("'dark' 模式首次 render 即返回 'dark'（修复闪现 bug）", () => {
    const { result } = renderHook(() => useResolvedTheme('dark'));
    expect(result.current).toBe('dark');
  });

  it("'system' 模式：matchMedia matches=false 时返回 'light'", () => {
    const { result } = renderHook(() => useResolvedTheme('system'));
    expect(result.current).toBe('light');
  });

  it("'system' 模式：订阅 matchMedia change 事件", () => {
    const addEventListener = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener,
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    renderHook(() => useResolvedTheme('system'));
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it("mode 切换时重新解析", () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: 'light' | 'dark' | 'system' }) => useResolvedTheme(mode),
      { initialProps: { mode: 'light' } }
    );
    expect(result.current).toBe('light');

    rerender({ mode: 'dark' });
    expect(result.current).toBe('dark');
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
npm test -- useResolvedTheme.test.ts
```

Expected: 5 个测试全部通过。

- [ ] **Step 3: build + 全量 test**

```bash
npm run build && npm test
```

Expected: 通过。

- [ ] **Step 4: 手动验证 3 种切换路径**

```bash
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

浏览器验证：
1. **light → dark**：点 sidebar 底部 Moon 图标 → 整页 dark，图标变 Sun
2. **dark → light**：再点 → 变 light
3. **system 模式同步**：进入 SettingsDialog 选 "跟随系统"。若系统当前 dark，sidebar 底部应显示 Sun。手动改 macOS 系统主题（System Settings → Appearance）→ sidebar 底部图标自动跟着变（matchMedia 订阅生效）

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 5: Commit Task 1a.2 + 1a.3 + 1a.4**

```bash
git add src/lib/hooks/useResolvedTheme.ts src/lib/hooks/useResolvedTheme.test.ts src/components/chat/ChatSidebar.tsx
git commit -m "feat: ChatSidebar 底部加快捷主题切换 + useResolvedTheme hook

- 新建 useResolvedTheme hook：解析 light|dark|system → 实际 light|dark
  - 订阅 matchMedia change 事件，系统主题变化自动同步
  - 初始值从 mode 派生，避免 dark 直设模式下首次 render 显示错误图标
- ChatSidebar 底部 UserAvatarMenu 旁加 Sun/Moon 切换按钮
- 复用现有 themeSlice，与 SettingsDialog ThemeToggle 共享 state
- useResolvedTheme.test.ts 覆盖 light/dark/system 三种状态 + 事件订阅
  + mode 切换重新解析

D1 方案 C：保持桌面端无 top bar 结构，主题切换走 sidebar 底部。
SettingsDialog ThemeToggle 不动（保留 system 高级选项）。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 1a Rollback:** `git revert HEAD~1..HEAD`（两个 commit：删 Header + 加切换）

**Phase 1a Red lines:** 不动 themeSlice / setThemeMode action 实现；不动 SettingsDialog；不动 UserAvatarMenu 内部；不动 `src/components/ui/theme-toggle.tsx`；**不接入 Header.tsx 到 MainLayout**（明确放弃这条路线，方案 C）；不动 MainLayout 的 layout 结构。

---

## Phase 1b：Sidebar（宽度修正 + 容器层 token 化）

**Goal:** ResizableSidebar 默认宽度 240→320px 并修复 className 写死 `w-[360px]` 的 bug；ChatSidebar **容器层** token 化。**子组件（ChatSidebarHeader / ChatList / ChatItem 等）本 phase 不动**——它们的视觉调整留作后续 phase 或单独 ticket。

### Task 1b.1: ResizableSidebar 宽度修正 + 背景 token 化

**Files:**
- Modify: `src/components/layouts/ResizableSidebar.tsx`

- [ ] **Step 1: 改 defaultWidth (line 17)**

```tsx
{/* 原 */}
defaultWidth = 240,
```

替换为：

```tsx
defaultWidth = 320,
```

- [ ] **Step 2: 改容器 className (line 62)，移除 w-[360px] 和 shadow-md，背景走 token**

```tsx
{/* 原 */}
className={cn("relative border-r bg-slate-50 dark:bg-slate-900 overflow-y-auto w-[360px] shadow-md", className)}
```

替换为：

```tsx
className={cn("relative border-r border-border bg-bg-subtle overflow-y-auto", className)}
```

- [ ] **Step 3: build + 视觉验证**

```bash
npm run build
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

浏览器验证：
1. Sidebar 默认宽度 320px（视觉测量）
2. 拖动右边手柄能正常 resize（180-400 范围）
3. light 下背景偏淡（bg-subtle，不是 slate-50 那种偏冷）
4. 无外层 shadow

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layouts/ResizableSidebar.tsx
git commit -m "fix: ResizableSidebar 默认宽度 240→320px 并修复 w-[360px] 写死 bug

- defaultWidth 240 → 320，对齐 design system v2 prototype 规范
- 移除 className 中硬编码的 w-[360px]（与 defaultWidth 冲突的已存在 bug）
- 背景 bg-slate-50/bg-slate-900 → bg-bg-subtle 走 design system token
- 移除 shadow-md（design system 倾向 1px hairline 而非阴影）
- border 显式声明 border-border

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 1b.2: ChatSidebar **容器层** token 替换

> **本任务范围限定**：仅替换 ChatSidebar.tsx **本身文件内**的硬编码颜色（如 `bg-slate-*` / `text-gray-*`），不进入子组件文件。"完整 sidebar 视觉对齐 prototype" 是非目标——本 phase 只确保容器层不破坏 design system。

**Files:**
- Modify: `src/components/chat/ChatSidebar.tsx`

- [ ] **Step 1: 找 ChatSidebar.tsx 内硬编码颜色**

```bash
grep -nE "bg-slate-|text-gray-|border-gray-|bg-blue-|text-blue-" src/components/chat/ChatSidebar.tsx
```

记下命中行。

- [ ] **Step 2: 逐个替换为 design token**

替换规则（仅在 ChatSidebar.tsx 文件内适用）：
- `bg-slate-50 dark:bg-slate-900` → `bg-bg-subtle`
- `text-gray-500 dark:text-gray-400` → `text-muted-foreground`
- `text-gray-700 dark:text-gray-300` → `text-foreground`
- `border-gray-200 dark:border-gray-800` → `border-border`
- 任何 `bg-blue-50` 类高亮 → `bg-info-bg` 或 `bg-accent`（看语义）

只改 className 字符串，**不动**任何 JSX 结构、props、useState、callback、hook 调用。

- [ ] **Step 3: build + 全量 test**

```bash
npm run build && npm test
```

Expected: 通过。

- [ ] **Step 4: 视觉验证**

```bash
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

浏览器验证 sidebar：
1. 整体颜色系统统一（无割裂的 slate 蓝 vs 系统中性灰）
2. 已选中会话有明显高亮
3. hover 行为正常
4. 子组件（ChatList / ChatItem）视觉**可能仍有硬编码颜色**——这是预期，本 phase 不动它们

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatSidebar.tsx
git commit -m "style: ChatSidebar 容器层 token 化

- 仅替换 ChatSidebar.tsx 文件内的硬编码颜色为 design system token
- 子组件（ChatSidebarHeader/ChatList/ChatItem/RenameDialog/DeleteDialog）
  本 phase 不动，留作后续单独处理

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 1b Rollback:** `git revert HEAD~1..HEAD`（两个 commit）

**Phase 1b Red lines:** 不动 useConversationList / useSidebarActions hook；不动 ChatSidebar 子组件文件（ChatSidebarHeader / ChatList / ChatItem / RenameChatDialog / DeleteChatDialog）；不动 Cmd/Ctrl+K 聚焦逻辑。

---

## Phase 2：Composer (ChatInput) 视觉调整

**Goal:** 利用 ChatInput 现有"外层 card + 透明 textarea"结构，**仅增强外层 card 视觉**（暗色对比度 + focus ring + token 化），不给 textarea 加独立边框。思考按钮 active 态颜色从 amber 改为 info（蓝），符合 design system 中 reasoning = info 的语义。

> **当前结构事实**：ChatInput.tsx:645 外层是 `rounded-2xl border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring` 的统一 card；line 745 textarea 是 `border-0 shadow-none focus-visible:ring-0` 透明嵌入。**保持这个结构**，只调外层视觉。

### Task 2.1: 外层 composer card token 化

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`

- [ ] **Step 1: 调整外层 card className (line 645)**

定位：`ChatInput.tsx:645` 外层 div className：

```tsx
{/* 原 */}
className={`relative rounded-2xl border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring transition-all ${
  isDragOver
    ? "border-primary border-dashed bg-primary/5"
    : "border-border"
}`}
```

替换为（暗色用 bg-elevated 提升对比、focus ring 走 ring token）：

```tsx
className={`relative rounded-2xl border bg-background dark:bg-bg-elevated shadow-fdv2-xs focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0 transition-colors duration-fast ${
  isDragOver
    ? "border-primary border-dashed bg-primary/5"
    : "border-border"
}`}
```

变化要点：
- 暗色背景从 `bg-background` 切到 `bg-bg-elevated`（更清晰区分于 canvas）
- shadow-sm → shadow-fdv2-xs（hairline 美学；用 fdv2 前缀避免与 shadcn UI 既有 shadow-xs 类名冲突）
- focus ring 1 → 2 px，对齐 design system "focus-visible only" 规则

- [ ] **Step 2: 调整思考按钮 active 颜色 amber → info (line 786)**

定位：`ChatInput.tsx:786`：

```tsx
{/* 原 */}
<Lightbulb className={`h-4 w-4 ${reasoningEnabled && supportsReasoning ? "text-amber-400" : ""}`} />
```

替换为：

```tsx
<Lightbulb className={`h-4 w-4 ${reasoningEnabled && supportsReasoning ? "text-info" : ""}`} />
```

> 依据：design system README 明确写 reasoning = `--info`（engineer blue），不是 warn (amber)。

- [ ] **Step 3: build + test**

```bash
npm run build && npm test
```

Expected: ChatInput 相关 test 通过。如果 className 断言失败，更新断言到新值（人工确认新视觉确实是预期）。

- [ ] **Step 4: 端到端流程验证（关键）**

```bash
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

执行：
1. 暗色下 composer card 与 canvas 有清晰视觉区分
2. 聚焦 textarea → focus ring 2px 蓝色（visible）
3. 上传图片（验证文件预览正常）
4. 切换模型
5. 切换思考开关（active 时 Lightbulb 变蓝色 info，不再是 amber）
6. 拖拽文件到 composer（验证 isDragOver 视觉切换）
7. 发送一条消息（验证流式正常）

任何一步坏 → rollback。

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatInput.tsx
git commit -m "refactor: ChatInput 外层 card 暗色对比度修复 + 思考 active 色改 info

- 外层 card 暗色背景 bg-background → bg-elevated（与 canvas 清晰区分）
- shadow-sm → shadow-fdv2-xs（design system hairline 美学）
- focus-within ring 1px → 2px（对齐 focus-visible only 规则）
- transition-all → transition-colors duration-fast（避免不必要的 layout 过渡）
- 思考按钮 active 颜色 text-amber-400 → text-info（reasoning 语义一致）
- textarea 内部结构与上传逻辑完全不动（继承现有'统一 card + 透明 textarea'结构）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 2 Rollback:** `git revert HEAD`

**Phase 2 Red lines:** 不动 file upload state / 能力检查 / vision 校验 / Send handler / Stop handler / Redux dispatch / `globalThis.triggerLoginDialog`；不动 ModelSelector 调用（Phase 4 处理触发器视觉）；**不给 Textarea 加独立 border**（保持现有透明嵌入结构）；**不新增"深度搜索"按钮**（不存在的功能）。

---

## Phase 3a：ChatMessage 视觉重做（**仅现有功能**）

**Goal:** 用户气泡 + AI block 视觉对齐 prototype；操作按钮升 32px（a11y）；文件卡片加 MIME 文字标签。**仅调整现有功能，不新增"赞/踩"等不存在的反馈按钮。**

> **当前 action 按钮事实**（基于 ChatMessage.tsx grep）：
> - line 510: AI 复制按钮 (h-6 w-6)
> - line 518: AI 重新生成 / retry 按钮 (h-6 w-6)
> - line 557: User 编辑按钮 (h-6 w-6)
> - line 566: User 重试按钮 (h-6 w-6)
> 全部 `h-6 w-6` (24px) → 升 `h-8 w-8` (32px)

### Task 3a.1: ChatMessage 视觉

**Files:**
- Modify: `src/components/chat/ChatMessage.tsx`

- [ ] **Step 1: 用户气泡视觉对齐**

定位用户消息 bubble 渲染（grep "user-bubble" 或类似）。bubble className 调整为：
- 容器：`flex justify-end`
- 气泡：`bg-primary/10 dark:bg-primary/15 text-foreground rounded-2xl px-4 py-2.5 max-w-[75%]`

> 实际 className 路径以代码为准，按 selector 找到对应元素后替换。

- [ ] **Step 2: 4 个操作按钮 h-6 w-6 → h-8 w-8**

定位 line 510 / 518 / 557 / 566 四个 Button：

```tsx
{/* 原 */}
<Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" ...>
```

替换：

```tsx
<Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast" ...>
```

> 同时把里面的 icon 大小 h-3 w-3 / h-3.5 w-3.5 改为 h-4 w-4 让按钮内空间更协调。

- [ ] **Step 3: 时间戳颜色对比度提升**

如果 ChatMessage 有 `text-[10px] text-muted-foreground/50` 类时间戳，改为：

```tsx
className="text-xs text-muted-foreground/70"
```

- [ ] **Step 4: 文件卡片加 MIME 文字标签**

定位 file 渲染区（line 299-314 区域，色块 ImageIcon / FileIcon）。在原色块旁或上方叠加 MIME 文字标签。例如：

```tsx
<div className="relative inline-flex items-center justify-center w-10 h-10 rounded-md bg-muted">
  {/* 原 icon */}
  <FileIcon className="h-4 w-4 text-fg-secondary" />
  {/* 新增 MIME 标签 */}
  <span className="absolute -bottom-1 -right-1 px-1 py-0 text-[8px] font-bold leading-tight text-primary-foreground bg-primary rounded">
    {fileType.toUpperCase()}
  </span>
</div>
```

> 具体 fileType 来源以现有代码为准（可能来自 mime / extension）。

- [ ] **Step 5: 流式光标尊重 prefers-reduced-motion**

定位 `<span className="animate-pulse">▌</span>` 类元素：

```tsx
<span className="animate-pulse motion-reduce:animate-none">▌</span>
```

- [ ] **Step 6: build + test**

```bash
npm run build && npm test
```

Expected: ChatMessage.test.tsx 通过。如果 className 字符串断言失败，**先确认新视觉是否符合本 plan**——符合则更新断言；不符合则代码改坏，rollback 重做。

- [ ] **Step 7: 端到端验证（关键）**

```bash
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

执行：
1. 发一条文本消息 → 看完整流式 → 完成态
2. 上传图片再发 → 看图片预览卡片
3. 上传 PDF 再发 → 看 PDF 卡片，验证 MIME 标签 "PDF" 可见
4. AI 完成后点复制 → 验证复制
5. 点重新生成 → 验证重新生成
6. 编辑用户消息 → 重试

任何一步坏 → rollback。

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 8: Commit**

```bash
git add src/components/chat/ChatMessage.tsx
git commit -m "refactor: ChatMessage 视觉重做 + a11y/对比度修复

- 用户气泡 bg-primary/10 dark:bg-primary/15 + rounded-2xl
- 4 个操作按钮（复制/重新生成/编辑/重试）h-6 w-6 → h-8 w-8（达 a11y 触摸目标）
- 时间戳 text-[10px]/50 → text-xs/70（暗色对比度提升）
- 文件卡片色块上叠加 MIME 文字标签（解决仅靠颜色传达信息）
- 流式光标加 motion-reduce:animate-none

业务逻辑（流式渲染 / 复制 / 重试 / 编辑回调）完全不动。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 3a Rollback:** `git revert HEAD`

**Phase 3a Red lines:** 不动流式渲染、scroll-stick、消息编辑/复制/重试逻辑、Redux action dispatch；**不新增"赞/踩"按钮**（当前不存在，超出视觉重构范围）；MarkdownRenderer 调用方式不动。

---

## Phase 3b：ReasoningContent 截断修复

**Goal:** 把 `max-h-[200px]` 硬编码截断改为 grid-template-rows 0fr→1fr 自适应展开。**展开后内容 scroll-stick 是核心回归项**——若坏立刻 rollback。

> 注意："grid-rows trick 减少硬截断，使展开高度自适应"，**不等于 "无 CLS"**。任何展开都会推动布局，对 scroll-stick 仍可能有影响，需重点验证。

### Task 3b.1: 重写折叠动画 + token 化

**Files:**
- Modify: `src/components/chat/ReasoningContent.tsx`

- [ ] **Step 1: 替换 line 95-145 折叠容器整块**

定位：`ReasoningContent.tsx:95-145`（整个 `{/* 内容区（可折叠，带过渡动画） */}` 块）。

完整替换为：

```tsx
      {/* 内容区（grid-rows 自适应展开，避免 200px 硬截断） */}
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

变化要点：
- 外层 `transition-all max-h-[200px]/max-h-0` → `grid grid-rows-[0fr]/[1fr]` + 多一层 `<div className="overflow-hidden">` 容器
- 内层 scroll 上限 `max-h-[160px]` → `max-h-[280px]`（仍有上限避免极端长内容撑爆视口）
- 流式 border 颜色 `border-l-blue-400/60` → `border-l-info/60`
- inline code 背景 `bg-slate-100 dark:bg-slate-800` → `bg-muted`
- 加 `motion-reduce:animate-none`

- [ ] **Step 2: 替换 line 64-69 容器外框颜色**

```tsx
{/* 原 */}
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

- [ ] **Step 3: 替换 line 76-79 流式状态点颜色**

```tsx
{/* 原 */}
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

- [ ] **Step 5: scroll-stick 回归验证（必做，最关键）**

```bash
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

执行（**全程观察滚动行为**）：
1. 触发深度思考（开思考开关后发个会触发推理的问题）
2. **关键观察**：流式过程中，reasoning 容器的展开高度自适应而不再硬截断
3. **关键观察**：流式输出整体的滚动黏底（scroll-stick）行为**没变化**——新内容到达时聊天区滚到底，用户手动滚动后停止黏底
4. 完成态：手动点击 reasoning 头部折叠 / 展开，过渡动画顺滑（不再硬截）

**如果 scroll-stick 行为变了**（例如不再黏底、或反复抖动）→ 立刻 rollback：
```bash
git revert HEAD
```
然后重新评估：可能 ChatMessageList 的 scroll detection 隐式依赖了 reasoning 容器的固定高度。需要单独 ticket 处理 scroll-stick 适配，本 phase 暂不做 grid-rows 改动。

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 6: 全量 test**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/ReasoningContent.tsx
git commit -m "fix: ReasoningContent 修复 max-h 硬截断 + token 化

- 折叠容器从 max-h-[200px]/max-h-0 改为 grid-template-rows 0fr/1fr
  → 展开高度自适应，移除 200px 硬截断
- 内层 scroll 上限 160px → 280px（仍有上限避免极长内容撑爆）
- 流式态颜色 blue-* → info-*，边框 border-blue-400/30 → border-info-border
- inline code bg-slate-* → bg-muted
- 加 motion-reduce:animate-none

注意：grid-rows trick 减少硬截断，但展开仍会推动布局；scroll-stick
经回归测试无变化。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 3b Rollback:** `git revert HEAD`

**Phase 3b Red lines:** 不动 ReactMarkdown 调用、不动 CodeBlock 调用、不动 scrollRef useEffect 滚动同步逻辑；不动 props 接口（ChatMessage 调用方不需要改）。

---

## Phase 3c：AgentStepCard token 化（**仅 token，不动 status 枚举**）

**Goal:** 把 AgentStepCard 内的硬编码颜色（gray/blue/green/amber/red 等）替换为 design system token。**不新增 pending status 渲染**——`AgentStep.status` 类型只有 `'running' | 'completed'`，新增 pending 会破坏类型并需要修改 stream 生成逻辑，超出本次视觉重构范围。

> 如果未来需要 pending 状态，应单独立项：扩展 AgentStep 类型 + 修改 streamSlice.ts 的 step 生成逻辑 + 补测试。本 plan 不做。

### Task 3c.1: AgentStepCard 颜色 token 化

**Files:**
- Modify: `src/components/chat/AgentStepCard.tsx`

- [ ] **Step 1: 容器 + header 颜色**

定位 line 38：

```tsx
{/* 原 */}
className="mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden"
```

替换：

```tsx
className="mb-3 rounded-lg border border-border bg-muted/30 overflow-hidden"
```

定位 line 42：

```tsx
{/* 原 */}
className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
```

替换：

```tsx
className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors duration-fast"
```

- [ ] **Step 2: status 图标 token 化**

定位 line 45-49：

```tsx
{/* 原 */}
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

定位 line 57：

```tsx
{/* 原 */}
<span className="text-xs text-amber-500 font-normal">已达上限</span>
```

替换：

```tsx
<span className="text-xs text-warn font-normal">已达上限</span>
```

- [ ] **Step 3: 折叠摘要按钮**

定位 line 28-33：

```tsx
{/* 原 */}
className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-2"
```

替换：

```tsx
className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-fast mb-2"
```

- [ ] **Step 4: 步骤项 status 图标（**仅处理 running/completed 两态**）**

定位 line 68-74：

```tsx
{/* 原 */}
<div className="mt-0.5 flex-shrink-0">
  {agentStep.status === 'completed' ? (
    <CheckCircle2 className="w-3 h-3 text-green-500" />
  ) : (
    <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
  )}
</div>
```

替换为（**保持二态判断**，只改颜色 + reduced-motion）：

```tsx
<div className="mt-0.5 flex-shrink-0">
  {agentStep.status === 'completed' ? (
    <CheckCircle2 className="w-3 h-3 text-success" />
  ) : (
    <Loader2 className="w-3 h-3 animate-spin text-info motion-reduce:animate-none" />
  )}
</div>
```

- [ ] **Step 5: 步骤标签颜色**

定位 line 76-78：

```tsx
{/* 原 */}
<div className="text-gray-500 dark:text-gray-400 mb-0.5">
  步骤 {agentStep.step}
</div>
```

替换：

```tsx
<div className="text-muted-foreground mb-0.5">
  步骤 {agentStep.step}
</div>
```

- [ ] **Step 6: 工具图标颜色**

定位 line 80-93。把：
- `text-blue-500` → `text-info`
- `text-emerald-500` → `text-teal`
- `text-gray-400` → `text-muted-foreground`
- `text-red-500` → `text-danger`
- 加 `motion-reduce:animate-none` 到所有 `animate-spin`

- [ ] **Step 7: build + test**

```bash
npm run build && npm test
```

- [ ] **Step 8: 端到端验证**

```bash
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

触发一次会产生 AgentStepCard 的搜索 / URL 读取流程（如复杂问题需要多步骤工具调用）。
如果当前环境无法稳定触发 agent 流程，则用 sidebar 里**已有的历史会话**（含 agent 步骤的对话）切换过去验证视觉。

验证清单：
1. 第一步 running → 蓝色 spinner（info）
2. 完成 → 绿色 check（success）
3. 工具图标按 kind 区分（search → info, url → teal）
4. 全部完成后折叠摘要 → 文字按钮干净
5. 重新展开 → 状态都正常
6. 限制达到 → "已达上限" 显示 amber (warn)

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 9: Commit**

```bash
git add src/components/chat/AgentStepCard.tsx
git commit -m "style: AgentStepCard 颜色 token 化

- 容器/header/按钮/图标颜色全走 design system token
  (info/success/warn/danger/teal)
- 移除硬编码 bg-gray-*/text-blue-*/text-green-*/text-amber-*/text-red-*
- 所有 animate-spin 加 motion-reduce:animate-none
- 保持现有 status 二态判断（'running' | 'completed'），不动类型

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 3c Rollback:** `git revert HEAD`

**Phase 3c Red lines:** 不动 `AgentStep` / `AgentToolCall` 类型定义；不动 step/toolCall 数据流；不动 isExpanded useState 折叠交互；**不新增 pending status 渲染**。

---

## Phase 3d：Sources 视觉调整（**不动数据结构**）

**Goal:** SourcesPanel pill 视觉对齐 token；SourcesSidebar 宽度 360→400px 并 token 化。**不新增分组渲染**——`SearchSourceSummary` 类型没有 `section` 字段，强加分组会引入未存在的数据需求。

### Task 3d.1: SourcesPanel pill 视觉

**Files:**
- Modify: `src/components/chat/SourcesPanel.tsx`

- [ ] **Step 1: 读 SourcesPanel 当前实现**

```bash
cat src/components/chat/SourcesPanel.tsx
```

确认是否有自带 label "来源"。注意：**ChatMessage 已经渲染 "参考 N 篇资料" 入口（点击打开 SourcesSidebar）**，所以 SourcesPanel **不应再重复显示这个 label**。SourcesPanel 仅负责行内 pill row。

- [ ] **Step 2: pill 视觉 token 化**

把每个 pill 容器的 className 调为：

```tsx
className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/40 bg-bg-subtle hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors duration-fast"
```

序号（如有）：`text-[9px] font-bold text-info`
host 文本：`text-fg-secondary`
favicon `<img>`：`w-3 h-3`

如果 SourcesPanel 当前有 "来源 N 篇" label，**删掉**——避免与 ChatMessage 的 "参考 N 篇资料" 重复。

- [ ] **Step 3: build + 视觉验证**

```bash
npm run build
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

完成态消息底部应只显示 pill row（无重复的"来源 N 篇"label）。

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

### Task 3d.2: SourcesSidebar 宽度 + token 化

**Files:**
- Modify: `src/components/chat/SourcesSidebar.tsx`

- [ ] **Step 1: 改宽度 360 → 400**

```bash
grep -n "w-\[360px\]" src/components/chat/SourcesSidebar.tsx
```

替换所有 `w-[360px]` → `w-[400px]`。

- [ ] **Step 2: token 化**

把硬编码颜色（如 `bg-slate-*` / `text-blue-*` / `border-gray-*`）替换为 design token：
- `bg-slate-50 dark:bg-slate-900` → `bg-bg-subtle`
- `text-blue-500` → `text-info`
- `border-gray-*` → `border-border`
- 列表项 hover：`hover:bg-muted`

- [ ] **Step 3: build + test**

```bash
npm run build && npm test
```

- [ ] **Step 4: 端到端验证**

启动 dev，触发完成态对话（带 sources）：
1. 点 ChatMessage 行内的 pill chip 或 "参考 N 篇" 入口 → 右侧 rail 展开
2. Rail 宽度 400px
3. 列表项颜色统一走 token，dark 下可读
4. ESC 关闭 / 点背景遮罩关闭都工作
5. 列表项点击 → target="_blank" 打开链接

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/SourcesPanel.tsx src/components/chat/SourcesSidebar.tsx
git commit -m "style: Sources 组件 token 化 + SourcesSidebar 宽度 360→400px

- SourcesPanel pill 视觉走 design token（border/bg-subtle/hover:bg-muted）
- 移除 SourcesPanel 内的 '来源 N 篇' label（与 ChatMessage '参考 N 篇资料'
  入口职责重叠）
- SourcesSidebar 宽度 360 → 400px（对齐 design system v2 规范）
- SourcesSidebar 颜色全走 token

不动 SearchSourceSummary 类型；不引入 section 分组（数据未提供）。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 3d Rollback:** `git revert HEAD`

**Phase 3d Red lines:** 不动 `SearchSourceSummary` 类型；不引入 section 字段；不动 ESC 关闭 / 背景遮罩 / target="_blank" 行为；不动数据流。

---

## Phase 4：SuggestedQuestions + ModelSelector 触发器视觉

**Goal:** SuggestedQuestions 卡片视觉对齐；ModelSelectorTrigger 视觉对齐。**完全不动登录检查、换一批 fetch、Popover panel 内部组件。**

### Task 4.1: SuggestedQuestions 视觉

**Files:**
- Modify: `src/components/chat/SuggestedQuestions.tsx`

- [ ] **Step 1: 卡片 + label className**

每个 question 卡片：

```tsx
className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg
           border border-border bg-bg-subtle hover:bg-muted hover:border-border-strong
           text-sm text-foreground transition-colors duration-fast"
```

label "你可能想问：" 加 HelpCircle (`text-info`)：

```tsx
<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
  <HelpCircle className="w-3 h-3 text-info" />
  你可能想问：
</span>
```

"换一批" 按钮：

```tsx
className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors duration-fast"
```

- [ ] **Step 2: build + test**

```bash
npm run build && npm test
```

- [ ] **Step 3: 端到端验证**

完成态查看推荐问题 + 换一批，确认登录检查 / fetch 行为不变。

### Task 4.2: ModelSelectorTrigger 视觉

**Files:**
- Modify: `src/components/models/ModelSelectorTrigger.tsx`

- [ ] **Step 1: 触发器视觉对齐**

按钮 className：

```tsx
className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md
           border border-border bg-bg-elevated hover:bg-muted
           text-sm text-foreground transition-colors duration-fast"
```

provider logo `<img>` 控制 `w-4 h-4`，model name `text-sm`，下拉箭头 `ChevronDown w-3 h-3 text-muted-foreground`。

- [ ] **Step 2: build + test**

```bash
npm run build && npm test
```

- [ ] **Step 3: 端到端验证**

点 composer 里 model picker → Popover 打开。**触发器视觉对齐，Popover 内部内容（model 列表）完全不动**。

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/SuggestedQuestions.tsx src/components/models/ModelSelectorTrigger.tsx
git commit -m "style: SuggestedQuestions + ModelSelectorTrigger 视觉对齐

- SuggestedQuestions 卡片走 border/bg-subtle/hover:bg-muted token
- HelpCircle 加 info 色
- '换一批' 按钮 hover 文字色变化
- ModelSelectorTrigger 触发器走 bg-elevated + border + hover:bg-muted token

不动 SuggestedQuestions onSelectQuestion/onRefresh/登录检查；
不动 ModelSelector Popover panel 内部组件。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 4 Rollback:** `git revert HEAD`

**Phase 4 Red lines:** 不动 SuggestedQuestions 的 onSelectQuestion / onRefresh / globalThis.triggerLoginDialog / isBusy 计算；不动 ModelSelectorPanel / ModelCard / CapabilityChip 等 panel 内部组件。

---

## Phase 5：HomePage（保留 subtle shadow）

**Goal:** HomePage 现有 9-pill wave-flip 已对齐 prototype，本 phase 仅 token 化 className。**保留轻微 shadow**（prototype 实际有 subtle 浮层感，纯 hairline 会让 pill "飘"）。

### Task 5.1: HomePage pill className 调整

**Files:**
- Modify: `src/components/home/HomePage.tsx`

- [ ] **Step 1: 替换 pill className (line 157)**

```tsx
{/* 原 */}
className="px-5 py-2.5 rounded-[20px] bg-muted/50 text-[14px] leading-5 text-foreground/70 whitespace-nowrap
           shadow-[0_2px_8px_rgba(0,0,0,0.12)]
           hover:bg-muted hover:text-foreground hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)]
           dark:shadow-[0_2px_8px_rgba(255,255,255,0.06)] dark:border dark:border-white/10
           dark:hover:shadow-[0_4px_12px_rgba(255,255,255,0.1)] dark:hover:border-white/20
           cursor-pointer"
```

替换（保留轻 shadow，加 1px hairline，token 化）：

```tsx
className="px-5 py-2.5 rounded-[20px] bg-bg-subtle text-md leading-5 text-fg-secondary whitespace-nowrap
           border border-border shadow-fdv2-xs
           hover:bg-muted hover:text-foreground hover:border-border-strong hover:shadow-fdv2-sm
           transition-all duration-fast cursor-pointer"
```

变化要点：
- 保留 shadow（用 `shadow-fdv2-xs` / `shadow-fdv2-sm`），不裸 hairline
- `bg-muted/50` → `bg-bg-subtle`（token 化）
- light/dark 统一规则（无需分岔写）
- `text-foreground/70` → `text-fg-secondary`

- [ ] **Step 2: skeleton loading className**

```tsx
{/* 原 */}
className="h-10 rounded-[20px] bg-muted/50 animate-pulse"
```

替换：

```tsx
className="h-10 rounded-[20px] bg-muted animate-pulse motion-reduce:animate-none"
```

- [ ] **Step 3: build + test**

```bash
npm run build && npm test
```

Expected: HomePage.test.tsx 通过。

- [ ] **Step 4: 端到端验证**

```bash
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

进入空对话状态：
1. 9 pill wave-flip 动画正常（每 15s 翻一次）
2. light 下 pill 有可见 1px border + 微 shadow，**视觉不"飘"**
3. dark 下 pill 也有 border + 微 shadow
4. 点击任意 pill → 正常发送消息

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 5: Commit**

```bash
git add src/components/home/HomePage.tsx
git commit -m "style: HomePage pill 走 design system token

- pill bg-muted/50 → bg-bg-subtle（token 化）
- 保留轻微 shadow-fdv2-xs（prototype 实际有微浮层感，纯 hairline 显空洞）
- 加 1px border-border + hover:border-border-strong
- text-foreground/70 → text-fg-secondary
- light/dark 统一规则（移除分岔写法）
- skeleton 加 motion-reduce:animate-none

wave-flip 动画 / 数据流 / 登录检查全部不动。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Phase 5 Rollback:** `git revert HEAD`

**Phase 5 Red lines:** 不动 wave-flip 动画时序、PROMPTS pool fetch、登录检查、shuffle 算法。

---

## Phase 6：全量验证 + 收尾

**Goal:** 全栈验证 + 暗色对比度肉眼回归 + 流式完整流程跑通 + **不 push**（等用户验收）。

### Task 6.1: 全量验证

**Files:** （无文件改动）

- [ ] **Step 1: build**

```bash
npm run build
```

Expected: 成功，无新增 warning。

- [ ] **Step 2: test**

```bash
npm test
```

Expected: 全通过。

- [ ] **Step 3: 整合 baseline 对照截图**

```bash
mkdir -p ~/Downloads/phase-final
npm run dev:next > /tmp/fusion-ui-next.log 2>&1 &
echo $! > /tmp/fusion-ui-next.pid
sleep 20
```

手动截 6 张图保存到 `~/Downloads/phase-final/`：
- `home-light.png` / `home-dark.png` — 空对话
- `chat-streaming-light.png` / `chat-streaming-dark.png` — 流式中
- `chat-done-light.png` / `chat-done-dark.png` — 完成态（带 reasoning + agent + sources）

逐张对比 prototype `~/Downloads/Fusion Chat v2/`（macOS Preview 双开）。

允许的差异：
- 字号略小/大（中文 vs 西文 metric）
- 时间戳格式
- 模型名长度

不允许的差异：
- 颜色用了硬编码而非 token
- 触摸目标 < 44px（含 hitSlop）
- 暗色对比度低于 baseline

```bash
kill "$(cat /tmp/fusion-ui-next.pid)" 2>/dev/null
rm /tmp/fusion-ui-next.pid
```

- [ ] **Step 4: 完整对话流程**

启动 dev，按这套跑：
1. 进入空对话 → 点 pill 发送 → 流式输出 → 完成（带 sources + suggested）
2. 点推荐问题 → 进入新流式
3. 切换主题（ChatSidebar 底部 sun/moon） → 整 UI 切色彩
4. 系统主题模式：SettingsDialog 选"跟随系统"，改 macOS 主题观察 ChatSidebar 底部图标自动同步
5. 点 sidebar 已有对话 → 跳到完成态
6. 拖动 sidebar 边缘 → 宽度变化（180-400 范围）
7. 上传图片 + 文本 → 发送 → AI 含图片理解
8. 切换模型 → 模型 picker 工作
9. 思考开关：开启时 Lightbulb 图标变 info 蓝色，关闭恢复 neutral

任何一步坏 → 定位到对应 phase rollback。

- [ ] **Step 5: git log 整理回顾**

```bash
git log --oneline main..feat/design-system-v2
```

Expected: ~12 个 commit（每个 phase 1-2 个），message 清晰，全部含 Co-Authored-By。

- [ ] **Step 6: 写 phase 总结**

**Files:**
- Create: `fusion-ui/docs/superpowers/plans/2026-05-01-design-system-v2-summary.md`

用 Write 工具新建文件，内容：

```markdown
# Design System v2 落地总结

完成时间: 2026-05-01
分支: feat/design-system-v2
基于 commit: <填实际的 main HEAD sha，用 git rev-parse origin/main 获取>

## 完成的 phase
- [x] Phase 0a — Token 追加（additive）
- [x] Phase 0b — 暗色对比校准（intentional）
- [x] Phase 1a — 删除 dead Header.tsx + ChatSidebar 底部加快捷主题切换 + useResolvedTheme hook
- [x] Phase 1b — Sidebar（宽度 + 容器层 token）
- [x] Phase 2 — Composer（外层 card 暗色对比 + 思考 active 改 info）
- [x] Phase 3a — ChatMessage（用户气泡 + 操作按钮 ≥32px + 文件 MIME 标签）
- [x] Phase 3b — ReasoningContent（grid-rows + token）
- [x] Phase 3c — AgentStepCard（颜色 token，不动 status 类型）
- [x] Phase 3d — Sources（宽度 + token，不动数据结构）
- [x] Phase 4 — SuggestedQuestions + ModelSelector trigger
- [x] Phase 5 — HomePage（保留 subtle shadow）
- [x] Phase 6 — 全量验证

## 未做（按红线 / 留作后续）
- ChatSidebar 子组件（ChatList / ChatItem / Header / Dialog）视觉对齐
- AgentStep 类型扩展 + pending status 渲染
- SourcesSidebar 按 section 分组（需 SearchSourceSummary 类型扩展）
- SuggestedQuestions globalThis.triggerLoginDialog 重构（架构债）
- ModelSelector Popover panel 内部视觉
- highlight.js → Shiki 迁移

## 下一步
- 用户切到 feat/design-system-v2 本地试用
- 用户验收
- 用户明确说 "push" 才推 origin
- 用户明确说 "merge" 才合 main
```

填实际 sha（用 `git rev-parse origin/main` 获取后填入）。

- [ ] **Step 7: 不要 push（等用户验收）**

```bash
echo "
=== 下一步动作（等 user 决定）===
1. user 切到 feat/design-system-v2 分支本地试用
2. user 验收所有功能 + 视觉
3. user 明确说 'push' 才推 origin
4. user 明确说 'merge' 才合 main
"
```

**Phase 6 Rollback:** 无（验证 phase 不改代码）

---

## 失败处理总规则

### 单 commit 已提交的回滚
**首选** `git revert <commit-sha>` —— 创建新 commit 反向应用，保留历史。

### 未提交改动出问题
1. `git status` + `git diff` 看清范围
2. **逐文件 diff 确认这些改动全部属于本 phase**：
   - 如果整文件 diff 都是本 phase 引入 → 可以 `git checkout -- <file>` 单文件回退
   - 如果文件里**混有用户改动 / 其他 agent 改动**（diff 出现你不认识的内容）→ **不要整文件回退**，手动反向编辑本 phase 引入的 hunks，保留无关改动
3. **避免 `git reset --hard`**——会丢失整个工作区的未提交改动

### 测试失败
- 先看测试断言什么
- 如果只是 className 字符串断言，且**人工已确认新视觉符合本 plan**：可以更新断言到新值（这属于合理的视觉变更）
- 如果是**行为断言失败**或**人工无法确认新视觉对**：代码改坏了，rollback 重做
- **绝不为了通过测试而改测试**

### Build 失败
- 先看是不是 import 错误（新 import 漏写、路径错误）
- 是不是 TS 类型错误（新加 prop / className 不匹配 type）
- 是不是 tailwind 配置错误（新 color key 名拼错、用了未定义的 utility）
- 是不是用了 Phase 0 没桥接的 utility（`text-md` / `duration-fast` / `shadow-fdv2-xs` / `ease-standard` 必须在 tailwind.config.js 桥接才生效）
- 都不是 → rollback 重做

### 跨 phase 影响
- 如果 phase N 改动影响了 phase N+1 的渲染
- 先 rollback phase N+1（最近 commit），再排查 phase N 根因

---

## Self-Review Checklist (rev2)

写完此 plan（rev2）自检（**已逐项核对，包含 rev1 review 未覆盖的二轮 review fix**）：

✅ **Spec coverage** — 6 个 phase（0/1/2/3/4/5/6）覆盖 migration-survey.md 全部 14 个 prototype 组件映射
✅ **D1-D4 决策对应任务**：
  - **D1 (rev2)** = Phase 1a：删除 dead Header.tsx + ChatSidebar 底部加切换（**不接入桌面 top bar**）
  - D2 = Phase 1b Task 1b.1
  - D3 = 全文不替换 highlight.js
  - D4 = Phase 3b
✅ **Header.tsx 处理**：经 grep 验证未被使用 → 删除（dead code 清理）；不再有"修改 Header"任务
✅ **No placeholders**：每步有具体代码 / 命令 / className 替换；总结模板的 `<填实际的 main HEAD sha>` 显式标注 "用 git rev-parse 获取后填入"
✅ **Type consistency**：完全保留 `AgentStep` / `AgentToolCall` / `SearchSourceSummary` 类型，不引入新 status / section 字段
✅ **Tailwind utility 一致性**：所有用到的非默认 utility 均在 Phase 0a Task 0a.2 桥接：
  - colors: `info/info-bg/info-border` 等 5 套语义色 + `bg-bg-subtle/bg-bg-elevated/text-fg-secondary/text-fg-subtle/border-border-strong/text-teal`
  - fontSize: `text-md`、`text-2xs`、`text-fdv2-*`
  - transitionDuration: `duration-fast`、`duration-slow`（**不写 DEFAULT** 避免覆盖 Tailwind 默认 150ms）
  - boxShadow: `shadow-fdv2-xs`、`shadow-fdv2-sm/md/lg`、`shadow-popover`（**绝不写 `shadow-xs`**——会激活 shadcn UI 已存在的 className 引发回归）
  - transitionTimingFunction: `ease-standard`、`ease-fdv2-out`
✅ **`text-on-primary` 误用**：Phase 3a Step 4 已改用 `text-primary-foreground bg-primary`（Tailwind/shadcn 已定义）
✅ **`useResolvedTheme` 初始值**：从 `mode` 派生，避免 dark 直设模式下首次 render 显示错误图标的闪现
✅ **import 重复风险**：Phase 1a Task 1a.3 Step 2 明确指令"合并到现有 import 行"，而非"追加新 import"
✅ **Phase 3c "深度搜索开关" 残留**：已改为"触发会产生 AgentStepCard 的 agent 流程；环境无法稳定触发就用历史会话验证"，不再提"开搜索开关"
✅ **Red lines** 每个 phase 末尾明确列出"绝对不碰"清单
✅ **Rollback** 每个 phase 都用 `git revert`（不再有 `git reset --hard`）
✅ **Verification** 每个 phase 都有 build + test + 视觉/端到端验证
✅ **不存在的功能**：删除了"深度搜索"按钮、"赞/踩"反馈、"pending status 渲染"、"section 分组" 等当前不存在的元素；Header.tsx 也确认从未被使用，作为 dead code 删除
✅ **基线**：用 `npm ci` 而非 `npm install`
✅ **进程管理**：所有 dev server 启动用 PID file，避免 `kill %1` 在非交互 shell 不稳定
✅ **CLS 描述**：Phase 3b "减少硬截断 + 重点回归 scroll-stick"，不写"无 CLS"
✅ **HomePage shadow**：Phase 5 保留 `shadow-fdv2-xs`
✅ **Sources label 职责**：ChatMessage 拥有 "参考 N 篇资料"；SourcesPanel 仅 pill row
✅ **Composer 结构**：保持"统一 card + 透明 textarea"，仅增强外层 card 暗色对比
