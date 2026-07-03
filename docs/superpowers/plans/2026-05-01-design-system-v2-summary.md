# Fusion Design System v2 落地总结

完成时间：2026-05-01
分支：`feat/design-system-v2`
基于 commit：`c2ecf4b8` (origin/master)
HEAD commit：`78a19ba3`
总 commit 数：14

---

## 完成的 Phase

| Phase | 内容 | Commits |
|-------|------|---------|
| **P1** Pre-flight | 建分支 + baseline test snapshot | 0 (无 commit) |
| **0a** Token additive | globals.css 追加完整 token 体系 + tailwind.config.js 桥接 colors / fontSize / transitionDuration / boxShadow / transitionTimingFunction | `fd0bb22` |
| **0a fix** | shadow-xs 命名跟 shadcn UI 已有 className 冲突，改为 shadow-fdv2-xs；teal 改 object 形式保留默认色阶 | `a2d5ac0` |
| **0b** 暗色校准 | `--muted` 0.269→0.225、`--muted-foreground` 0.708→0.74、`--border` 0.269→0.32 | `b83236e` |
| **1a** Header 删 + 主题切换 | 删除 dead Header.tsx；新建 `useResolvedTheme` hook（含 5 个 vitest）；ChatSidebar 底部加 Sun/Moon 切换按钮 | `03ebdee` + `a10d97e` |
| **1b** Sidebar 宽度 + token | ResizableSidebar 240→320 + 删 w-[360px] 写死 bug；ChatSidebar 容器层经验证已干净，无需改 | `d67e87b` |
| **2** Composer (ChatInput) | 外层 card dark 用 bg-elevated；shadow-sm→shadow-fdv2-xs；focus ring 1→2px；思考 active amber→info | `47d22d4` |
| **3a** ChatMessage 视觉 | 用户气泡 bg-primary/10、操作按钮 h-6→h-8、时间戳对比度提升、文件卡片加 MIME 标签、流式光标 reduced-motion | `e65808b` |
| **3b** ReasoningContent | max-h-[200px] 截断改 grid-template-rows 0fr→1fr；token 化；motion-reduce | `c0a2823` |
| **3c** AgentStepCard | 全 token 化（info/success/warn/danger/teal）；保持 status 二态判断；不动类型 | `32060ef` |
| **3d** Sources | SourcesPanel pill token 化 + 删重复 "来源" label；SourcesSidebar 360→400px + token 化 | `3d29294` |
| **4** SuggestedQuestions + ModelSelector | 卡片 token 化 + HelpCircle info 色；ModelSelectorTrigger token 化 | `53fd1a9` |
| **5** HomePage | pill 走 bg-bg-subtle + 1px border + shadow-fdv2-xs；保留 wave-flip 动画 | `5250773` |
| **6 polish** | 修审阅 AI 反馈：ChatMessage 操作栏 wrapper h-6→h-8（按钮溢出 bug）；AgentStepCard line 80 残留硬编码灰色 token 化 | `78a19ba` |

---

## 自动化验证

| 项 | 状态 | 说明 |
|---|------|------|
| `npm run build` | ✅ Pass | 8 routes 全部生成；零编译错误 |
| `npm test` | 22 fail / 80 pass / 102 total | baseline 22 fail / 75 pass / 97 total；delta +5（新 useResolvedTheme.test.ts），**零回归** |

baseline 的 22 个 vitest 失败是 origin/master 自带的 mock 问题（多数 `await import()` 动态 import 在 vitest 环境下的 mock setup 问题），独立于本 redesign，snapshot 在 `/tmp/fusion-baseline/baseline-failing-tests.txt`。

---

## 实施过程关键决策

1. **D1 走方案 C（保守）** — Header.tsx 经 grep 验证从未被使用，直接删除；快捷主题切换放 ChatSidebar 底部，**不接入桌面 top bar**
2. **D2 修 ResizableSidebar bug** — defaultWidth 240→320，移除 className 写死的 w-[360px]
3. **D3 保留 highlight.js** — 不换成 prototype 的 tokenizer（CodeBlock 容器视觉本次不动）
4. **D4 修 ReasoningContent CLS** — 用 grid-rows trick 替代 max-h-[200px]
5. **shadow-xs 命名修正** — Phase 0a 第一版用了跟 shadcn UI 既有 className 冲突的名字，code reviewer 发现后 fix（commit `a2d5ac0`），plan 也同步 patch

---

## Implementer 在执行中做的视觉判断（need user 确认）

以下是 implementer 在 phase 4 执行时为了"忠实于 token 化"而做的视觉简化，**潜在 UX 降级**，需要 user 跑 dev 后判断接受/调回：

| 项 | 原状态 | 现状态 | 风险 |
|----|-------|-------|------|
| SuggestedQuestions 卡片 hover 微交互 | translate-y-[-1px] + scale-[1.01] + shadow lift | 纯 token-based color/border hover | UX 降级（少了"被选中"的轻微浮动反馈） |
| SuggestedQuestions pending 态 | border-primary + bg-primary/5 + text-primary | bg-muted + border-border-strong | pending 反馈较弱（**审阅 AI 标为 Minor，建议加更明显 affordance**） |
| ModelSelectorTrigger isOpen 高亮 | border-primary/30 | 仅 bg-muted（无额外 border 变化） | "已打开"视觉信号弱化 |

如果跑 dev 后任一处觉得不对，单独修 1-2 行 className 即可。

---

## 已知未做（明确 plan 范围外）

- ChatSidebar 子组件视觉（`ChatList` / `ChatItem` / `ChatSidebarHeader` / `Rename/DeleteDialog`）—— Phase 1b 红线
- AgentStep type 的 'pending' status —— Phase 3c 红线（要改 streamSlice 类型，越界）
- SourcesSidebar 按 section 分组 —— Phase 3d 红线（SearchSourceSummary 类型没 section）
- SuggestedQuestions `globalThis.triggerLoginDialog` 重构 —— 全局红线（架构债）
- ModelSelector Popover panel 内部组件视觉 —— Phase 4 红线
- ChatMessage 加 thumbs up/down 反馈按钮 —— 当前不存在的功能
- 桌面 top bar / Header.tsx 接入 MainLayout —— D1 决策方案 C 明确放弃
- highlight.js → Shiki 迁移 —— D3 决策保留 highlight.js
- baseline 22 个 vitest mock 失败 —— 独立技术债

---

## 用户待验证

跑 `cd fusion-ui && npm run dev:next` 后：

**强制项**：
1. **Phase 3b scroll-stick 回归**（高风险）：登录后开"思考"开关，发会触发推理的问题，观察流式过程聊天区**仍然黏底**。如黏底坏了/抖动 → 单 commit 回滚 `git revert c0a2823`
2. **完整对话流程**：发文本/图片消息 → 流式 → 完成态；hover 出 4 个操作按钮（复制/重新生成/编辑/重试）；切主题；切模型；拖 sidebar 宽度

**可选项**（implementer 视觉简化的 3 处，看你接不接受）：
- HomePage pill 在 light 下的视觉
- SuggestedQuestions hover 不再 lift
- SuggestedQuestions pending 态被弱化
- ModelSelectorTrigger isOpen 态高亮删了

---

## 下一步动作（等 user 拍板）

1. user 跑 dev 验证 → 反馈 OK 或具体调整
2. 调整完，user 明确说 "push" 才推 origin
3. push 后跑 dev server 验证（CI/CD 自动部署）
4. user 明确说 "merge" 才合 main

**当前不 push、不合 main、不用 git tag，全部本地等待**。
