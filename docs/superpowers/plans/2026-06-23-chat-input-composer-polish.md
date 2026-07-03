# ChatInput Composer Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 Fusion Web 端 `ChatInput` composer 的工具栏、附件区和发送状态体验，同时保持现有发送与上传行为不变。

**Architecture:** 这是单组件 polish，不拆业务状态机。第一步先用测试锁住按钮语义和发送状态；第二步收敛 `ChatInput.tsx` 的 UI class、accessible labels 和附件区结构；第三步做验证、提交、push、CI 监听。

**Tech Stack:** Next.js 15, React 19, Vitest, Testing Library, Tailwind CSS, lucide-react。

---

### Task 1: 锁定 composer 工具栏行为

**Files:**
- Modify: `src/components/chat/ChatInput.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `describe('ChatInput', ...)` 中新增测试，避免使用 `getAllByRole('button').at(-1)` 这类顺序查询。

```tsx
it('uses stable accessible actions for upload, reasoning, send and stop', () => {
  currentState.auth.isAuthenticated = true;
  currentState.models.selectedModelId = 'model-1';
  currentState.models.models = [
    {
      id: 'model-1',
      provider: 'qwen',
      capabilities: {
        vision: true,
        deepThinking: true,
      },
    },
  ];
  const onSendMessage = vi.fn();
  const onStopStreaming = vi.fn();

  const { rerender } = render(
    <ChatInput
      onSendMessage={onSendMessage}
      onStopStreaming={onStopStreaming}
      activeChatId="chat-1"
    />,
  );

  expect(screen.getByRole('button', { name: '上传文件' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '开启思考模式' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: '开启思考模式' }));
  expect(setReasoningEnabledMock).toHaveBeenCalledWith(true);

  fireEvent.change(screen.getByPlaceholderText('发消息给 Fusion AI（Enter 发送）'), {
    target: {
      value: '你好',
    },
  });

  expect(screen.getByRole('button', { name: '发送消息' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
  expect(onSendMessage).toHaveBeenCalledWith('你好');

  currentState.stream.isStreaming = true;
  rerender(
    <ChatInput
      onSendMessage={onSendMessage}
      onStopStreaming={onStopStreaming}
      activeChatId="chat-1"
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '停止生成' }));
  expect(onStopStreaming).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 跑红灯**

Run:

```bash
npm test -- src/components/chat/ChatInput.test.tsx
```

Expected: FAIL，因为现有发送按钮没有 `aria-label="发送消息"`，思考按钮 accessible name 不是 `开启思考模式`，停止按钮也没有稳定 name。

- [ ] **Step 3: 最小实现**

修改 `src/components/chat/ChatInput.tsx`：

- 上传按钮保留 `aria-label="上传文件"`。
- 思考按钮：
  - 未开启时 `aria-label="开启思考模式"`。
  - 已开启时 `aria-label="关闭思考模式"`。
  - 开启时加 `aria-pressed={true}`。
- 发送按钮：
  - 普通态 `aria-label="发送消息"`。
  - streaming 停止态 `aria-label="停止生成"`。
  - 保持固定尺寸。

- [ ] **Step 4: 跑绿灯**

Run:

```bash
npm test -- src/components/chat/ChatInput.test.tsx
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx
git commit -m "test: 锁定输入工具栏交互语义" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

### Task 2: 收敛 composer 视觉层级

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/components/chat/ChatInput.test.tsx`

- [ ] **Step 1: 写失败测试**

新增测试，检查 composer 和主要操作区有稳定语义节点：

```tsx
it('renders composer as a structured input panel with toolbar and attachment status area', async () => {
  currentState.auth.isAuthenticated = true;
  currentState.models.selectedModelId = 'model-1';
  currentState.models.models = [
    {
      id: 'model-1',
      provider: 'qwen',
      capabilities: {
        vision: true,
        deepThinking: true,
      },
    },
  ];
  uploadFilesMock.mockResolvedValue([{ file_id: 'file-1' }]);

  const { container } = render(<ChatInput onSendMessage={vi.fn()} activeChatId="chat-1" />);
  const panel = screen.getByRole('group', { name: '消息输入区' });
  expect(panel.className).toContain('rounded-xl');
  expect(screen.getByRole('toolbar', { name: '消息工具栏' })).toBeInTheDocument();

  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

  fireEvent.change(fileInput, {
    target: {
      files: [file],
    },
  });

  await waitFor(() => {
    expect(screen.getByRole('list', { name: '已添加文件' })).toBeInTheDocument();
    expect(screen.getByText('hello.txt')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑红灯**

Run:

```bash
npm test -- src/components/chat/ChatInput.test.tsx
```

Expected: FAIL，因为现有 composer 没有 `role="group"` / `role="toolbar"` / 文件 list 语义。

- [ ] **Step 3: 最小实现**

修改 `ChatInput.tsx`：

- 外层卡片加 `role="group"`、`aria-label="消息输入区"`。
- 工具栏容器加 `role="toolbar"`、`aria-label="消息工具栏"`。
- 附件区加 `role="list"`、`aria-label="已添加文件"`。
- 每个图片/文件项加 `role="listitem"`。
- 将卡片从 `rounded-2xl` 收敛到 `rounded-xl`。
- 保持文件处理提示和发送阻断逻辑不变。

- [ ] **Step 4: 跑绿灯**

Run:

```bash
npm test -- src/components/chat/ChatInput.test.tsx
```

Expected: PASS。

- [ ] **Step 5: 视觉 polish**

在保持测试通过的前提下调整 class：

- Composer：`rounded-xl border bg-background shadow-fdv2-xs`。
- Textarea：保留无边框，使用 `px-4 pt-3 pb-2`。
- 工具栏：`border-t border-border/40 px-2 py-1.5`，让工具区和输入区分层。
- 发送按钮：普通态和停止态保留统一尺寸，停止态用 secondary/destructive 轻量区分。
- 附件区：`p-2.5 border-b border-border/40`，非图片文件行使用 `rounded-md border border-border/50 bg-muted/20`。

- [ ] **Step 6: 提交**

```bash
git add src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx
git commit -m "style: 优化输入框工具栏层级" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

### Task 3: 验证、squash、push、CI

**Files:**
- No source edits expected.

- [ ] **Step 1: 运行目标测试**

```bash
npm test -- src/components/chat/ChatInput.test.tsx
```

Expected: PASS。

- [ ] **Step 2: 运行 lint**

```bash
npx eslint src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx
```

Expected: 0 errors。允许现有 `.eslintignore` warning。

- [ ] **Step 3: 运行全量验证**

```bash
npm test
npm run build
git diff --check origin/master..HEAD
```

Expected: tests/build/diff check all pass。

- [ ] **Step 4: squash**

```bash
git reset --soft origin/master
git commit -m "style: 优化输入框工具栏体验" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

- [ ] **Step 5: push**

```bash
git push origin master
```

- [ ] **Step 6: 监听 CI**

```bash
gh run list --repo HyxiaoGe/fusion-ui --branch master --limit 10 --json databaseId,headSha,displayTitle,status,conclusion,workflowName,createdAt,url
gh run watch <run-id> --repo HyxiaoGe/fusion-ui --exit-status
```

Expected: `Fusion UI Build & Deploy` success。
