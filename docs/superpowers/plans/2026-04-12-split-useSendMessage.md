# 拆分 useSendMessage Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 useSendMessage（498 行）中提取 useTypewriter 和 useRetryMessage 两个独立 hook，降低耦合度

**Architecture:** useTypewriter 封装打字机定时器逻辑（interval + advanceTypewriter），通过回调与调用方协调"网络完成 + 显示追上"的双重完成条件。useRetryMessage 封装消息重试逻辑（提取内容 + 删除旧消息 + 重发），依赖 sendMessage 函数引用。两者提取后 useSendMessage 减少约 100 行。

**Tech Stack:** React hooks / Redux Toolkit / Vitest

---

## File Structure

**新建文件：**
- `src/hooks/useTypewriter.ts` — 打字机效果 hook
- `src/hooks/useRetryMessage.ts` — 消息重试 hook

**修改文件：**
- `src/hooks/useSendMessage.ts` — 移除已提取逻辑，引用新 hook
- `src/hooks/useSendMessage.test.ts` — 确保现有测试不破

---

### Task 1: 提取 useTypewriter hook

**Files:**
- Create: `src/hooks/useTypewriter.ts`
- Modify: `src/hooks/useSendMessage.ts:37-39,72,85-88,296-312,379-382`

- [ ] **Step 1: 创建 useTypewriter.ts**

```typescript
// src/hooks/useTypewriter.ts
import { useRef, useCallback } from 'react';
import { useAppDispatch } from '@/redux/hooks';
import { useStore } from 'react-redux';
import { advanceTypewriter } from '@/redux/slices/streamSlice';
import type { StreamState } from '@/redux/slices/streamSlice';

const TYPEWRITER_CHARS_PER_TICK = 4;
const TYPEWRITER_TICK_MS = 30;

/**
 * 打字机效果 hook：定时推进 displayedTextLength，
 * 当网络完成且显示追上时调用 onCatchUp 回调。
 */
export function useTypewriter() {
  const dispatch = useAppDispatch();
  const store = useStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 通过 ref 传递闭包状态，避免 startTypewriter 重新创建
  const catchUpRef = useRef<(() => void) | null>(null);
  const networkDoneRef = useRef(false);

  const start = useCallback((onCatchUp: () => void) => {
    if (intervalRef.current !== null) return;

    catchUpRef.current = onCatchUp;
    intervalRef.current = setInterval(() => {
      const streamState = (store.getState() as { stream: StreamState }).stream;
      if (streamState.displayedTextLength < streamState.totalTextLength) {
        dispatch(advanceTypewriter(TYPEWRITER_CHARS_PER_TICK));
      }

      const updated = (store.getState() as { stream: StreamState }).stream;
      if (networkDoneRef.current && updated.displayedTextLength >= updated.totalTextLength) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        catchUpRef.current?.();
      }
    }, TYPEWRITER_TICK_MS);
  }, [dispatch, store]);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    networkDoneRef.current = false;
    catchUpRef.current = null;
  }, []);

  const markNetworkDone = useCallback(() => {
    networkDoneRef.current = true;
    // 如果打字机还没启动（无文本内容），直接触发 catchUp
    if (intervalRef.current === null) {
      catchUpRef.current?.();
    }
  }, []);

  const isRunning = useCallback(() => intervalRef.current !== null, []);

  return { start, stop, markNetworkDone, isRunning };
}
```

- [ ] **Step 2: 在 useSendMessage 中使用 useTypewriter**

修改 `src/hooks/useSendMessage.ts`：

a) 删除打字机常量（第 37-39 行）：
```
-const TYPEWRITER_CHARS_PER_TICK = 4;
-const TYPEWRITER_TICK_MS = 30;
```

b) 添加 import（第 1 行附近）：
```typescript
import { useTypewriter } from './useTypewriter';
```

c) 在 hook 内部（第 62 行 `const dispatch = ...` 之后），替换 typewriterIntervalRef：
```
-const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
+const typewriter = useTypewriter();
```

d) 在 stopStreaming 中（第 85-88 行），替换打字机清理：
```
-if (typewriterIntervalRef.current !== null) {
-  clearInterval(typewriterIntervalRef.current);
-  typewriterIntervalRef.current = null;
-}
+typewriter.stop();
```

e) 在 sendMessage 内部，删除旧的 startTypewriter 定义（第 296-312 行），替换为：
```
-const startTypewriter = () => { ... 整个函数 ... };
```

删除 `networkDone`、`donePayload` 两个局部变量的声明（第 217-218 行），改为 ref 式：
```
-let networkDone = false;
-let donePayload: { incomingConvId: string; usage: Usage | null } | null = null;
+let donePayload: { incomingConvId: string; usage: Usage | null } | null = null;
```

f) 在 `sendMessageStream` 回调中：

`onTextDelta`（第 329-338 行）中 `startTypewriter()` 替换为：
```typescript
typewriter.start(() => {
  if (donePayload) doCompleteStream(donePayload);
});
```

`onDone`（第 356-367 行）整体替换为：
```typescript
onDone: (_messageId, incomingConvId, usage) => {
  donePayload = { incomingConvId, usage };
  typewriter.markNetworkDone();
  // 如果没有文本内容（只有 thinking），打字机不会启动，
  // markNetworkDone 内部会直接触发 catchUp → doCompleteStream
},
```

g) catch 块中（第 379-382 行），替换打字机清理：
```
-if (typewriterIntervalRef.current !== null) {
-  clearInterval(typewriterIntervalRef.current);
-  typewriterIntervalRef.current = null;
-}
+typewriter.stop();
```

h) 更新 sendMessage 的 deps 数组（第 428 行），将 `stopStreaming` 后面加上 `typewriter`（因为 start/stop/markNetworkDone 都是 stable ref，实际不影响）。

- [ ] **Step 3: 运行现有测试确认不破**

Run: `cd /Users/sean/code/fusion/fusion-ui && npm test -- --run src/hooks/useSendMessage.test.ts`
Expected: 4 tests PASS（materializes draft / stops previous / handles errors / completes immediately）

- [ ] **Step 4: 运行构建确认无类型错误**

Run: `cd /Users/sean/code/fusion/fusion-ui && npx tsc --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTypewriter.ts src/hooks/useSendMessage.ts
git commit -m "refactor: 从 useSendMessage 提取 useTypewriter hook

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 提取 useRetryMessage hook

**Files:**
- Create: `src/hooks/useRetryMessage.ts`
- Modify: `src/hooks/useSendMessage.ts:431-495`

- [ ] **Step 1: 创建 useRetryMessage.ts**

```typescript
// src/hooks/useRetryMessage.ts
import { useCallback } from 'react';
import { useAppDispatch } from '@/redux/hooks';
import { useStore } from 'react-redux';
import { removeMessage } from '@/redux/slices/conversationSlice';
import type { Message, TextBlock, FileBlock } from '@/types/conversation';
import type { Conversation } from '@/types/conversation';
import type { FileAttachment } from '@/lib/utils/fileHelpers';

type SendMessageFn = (
  content: string,
  options: { conversationId: string | null },
  attachments?: FileAttachment[],
) => Promise<void>;

function extractMessageContent(msg: Message) {
  const text = msg.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const attachments: FileAttachment[] = msg.content
    .filter((b): b is FileBlock => b.type === 'file')
    .map((b) => ({
      fileId: b.file_id,
      filename: b.filename,
      mimeType: b.mime_type,
      previewUrl: b.thumbnail_url,
    }));
  return { text, attachments };
}

/**
 * 消息重试 hook：删除目标消息（及关联消息）后重新发送。
 * 需要传入 sendMessage 函数引用以避免循环依赖。
 */
export function useRetryMessage(sendMessage: SendMessageFn) {
  const dispatch = useAppDispatch();
  const store = useStore();

  return useCallback(
    async (messageId: string, conversationId: string) => {
      const state = store.getState() as {
        conversation: { byId: Record<string, Conversation> };
      };
      const conversation = state.conversation.byId[conversationId];
      if (!conversation) return;

      const messages = conversation.messages;
      const targetIndex = messages.findIndex((m) => m.id === messageId);
      if (targetIndex === -1) return;

      const targetMsg = messages[targetIndex];

      if (targetMsg.role === 'assistant') {
        // 重新生成：向上找 user 消息，删除 assistant + user，重新发送
        let userMessage: Message | null = null;
        for (let i = targetIndex - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            userMessage = messages[i];
            break;
          }
        }
        if (!userMessage) return;

        const { text, attachments } = extractMessageContent(userMessage);
        dispatch(removeMessage({ conversationId, messageId }));
        dispatch(removeMessage({ conversationId, messageId: userMessage.id }));

        if (text || attachments.length > 0) {
          await sendMessage(text, { conversationId }, attachments.length > 0 ? attachments : undefined);
        }
      } else if (targetMsg.role === 'user') {
        // 重新发送：删除 user + 其后的 assistant，重新发送
        const nextMsg = messages[targetIndex + 1];
        if (nextMsg && nextMsg.role === 'assistant') {
          dispatch(removeMessage({ conversationId, messageId: nextMsg.id }));
        }
        dispatch(removeMessage({ conversationId, messageId }));

        const { text, attachments } = extractMessageContent(targetMsg);

        if (text || attachments.length > 0) {
          await sendMessage(text, { conversationId }, attachments.length > 0 ? attachments : undefined);
        }
      }
    },
    [dispatch, sendMessage, store],
  );
}
```

- [ ] **Step 2: 在 useSendMessage 中使用 useRetryMessage**

修改 `src/hooks/useSendMessage.ts`：

a) 添加 import（顶部）：
```typescript
import { useRetryMessage } from './useRetryMessage';
```

b) 删除整个 retryMessage 定义（第 431-495 行的 `const retryMessage = useCallback(...)` 整块）。

c) 在 `sendMessage` 定义之后、`return` 之前，添加：
```typescript
const retryMessage = useRetryMessage(sendMessage);
```

d) `return` 保持不变：`return { sendMessage, stopStreaming, retryMessage };`

e) 移除不再需要的 import：`FileBlock` 类型（如果只有 retryMessage 在用的话）。检查 `removeMessage` 是否仍被 sendMessage 的 catch 块使用——是的（第 411-413 行），所以保留。

- [ ] **Step 3: 运行现有测试确认不破**

Run: `cd /Users/sean/code/fusion/fusion-ui && npm test -- --run src/hooks/useSendMessage.test.ts`
Expected: 4 tests PASS

- [ ] **Step 4: 运行构建确认无类型错误**

Run: `cd /Users/sean/code/fusion/fusion-ui && npx tsc --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRetryMessage.ts src/hooks/useSendMessage.ts
git commit -m "refactor: 从 useSendMessage 提取 useRetryMessage hook

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 验证 + 清理

**Files:**
- Modify: `src/hooks/useSendMessage.ts` (清理残留)

- [ ] **Step 1: 运行全部测试**

Run: `cd /Users/sean/code/fusion/fusion-ui && npm test -- --run`
Expected: ALL PASS

- [ ] **Step 2: 运行构建**

Run: `cd /Users/sean/code/fusion/fusion-ui && npm run build 2>&1 | tail -5`
Expected: 构建成功

- [ ] **Step 3: 检查 useSendMessage 行数**

Run: `wc -l src/hooks/useSendMessage.ts`
Expected: ~400 行以下（从 498 行减少约 100 行）

- [ ] **Step 4: Commit（如有清理改动）**

```bash
git add -u
git commit -m "chore: 清理 useSendMessage 残留 import

Co-Authored-By: Claude <noreply@anthropic.com>"
```
