# ChatInput Composer Polish Design

## 背景

`ChatInput.tsx` 是 Fusion Web 端最高频的操作区，当前同时承载文本输入、模型选择、思考开关、文件上传、发送/停止、文件预览和上传状态。功能完整，但视觉和交互层级还偏“堆叠”：工具按钮语义不够统一，附件状态占用面积不稳定，发送按钮状态缺少明确的可发送/处理中/停止区分。

本阶段只优化 Web 端桌面体验，不考虑移动端，不改发送协议、不改上传 API、不改模型选择器行为。

## 目标

1. 让 composer 看起来像一个统一的输入工作台，而不是 textarea 加一排零散按钮。
2. 将工具栏分成三个稳定区域：左侧工具、中央输入、右侧模型与发送动作。
3. 将附件预览和文件处理状态统一成紧凑、可扫描、稳定高度的状态区。
4. 保留现有行为：登录拦截、模型能力拦截、重复文件跳过、文件处理期间禁发、失败文件阻断发送、Enter 发送、Shift+Enter 换行、停止生成。
5. 保证按钮有明确 `aria-label`，测试不依赖按钮顺序。

## 非目标

- 不重写 `ChatInput` 的上传状态机。
- 不改 `onSendMessage` 参数和 pending chat id 逻辑。
- 不改 `ModelSelector` 组件。
- 不改移动端布局。
- 不启动本地 Fusion dev server 做验证。

## 设计

### Composer 外层

保留单一卡片容器，但将样式收敛为低干扰的输入面板：

- 默认：`rounded-xl`、细边框、轻微阴影。
- focus：只突出边框或 ring，避免大片高亮。
- drag over：虚线边框和浅色背景，明确可拖拽上传。
- disabled/unavailable：降低透明度，但仍显示模型不可用说明。

### 附件状态区

把图片和非图片附件统一放在卡片顶部的附件栏：

- 图片继续使用缩略图，但尺寸固定，删除按钮常驻。
- 非图片使用紧凑行：图标、文件名、大小、状态、删除按钮。
- 文件状态文案保持现有含义，但视觉从大块提示收敛为行内状态。
- 卡片外仍保留全局处理提示，用于解释“为什么暂时不能发送”。

### 工具栏

工具栏保持一行，按职责分区：

- 左侧：上传、思考开关。
- 右侧：模型选择器、发送/停止按钮。
- 上传按钮：
  - 支持时显示普通 ghost icon。
  - 不支持 vision 或 composer blocked 时 disabled，并保留 title/aria-label。
- 思考按钮：
  - 使用 icon + 短标签。
  - 开启时给轻量选中态。
  - 不支持时 disabled。
- 发送按钮：
  - 有内容且可发送时使用 primary 圆角 icon。
  - streaming 且有 `onStopStreaming` 时显示停止态。
  - disabled 时保持尺寸，不造成布局跳动。

### 测试策略

新增或更新 `ChatInput.test.tsx`，覆盖 UI/UX 行为而不是快照：

- 上传按钮有稳定 accessible name。
- 思考按钮开启后显示 selected/active 状态，并 dispatch `setReasoningEnabled`。
- 发送按钮 disabled/enabled 不依赖按钮顺序查询。
- streaming 时发送按钮切换为停止动作，点击触发 `onStopStreaming`。
- 文件处理中或失败时仍阻断发送，现有测试继续通过。

## 验证

必须运行：

```bash
npm test -- src/components/chat/ChatInput.test.tsx
npx eslint src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx
npm test
npm run build
```

不运行本地 dev server。
