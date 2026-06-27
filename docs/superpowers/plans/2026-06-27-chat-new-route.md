# `/chat/new` 新建对话路由 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将新建对话从 `/?new=true` 命令式 URL 改为正式 `/chat/new` 路由，并保证发送第一条消息前不把本地 draft id 写入 URL。

**Architecture:** URL 只表达页面资源：`/chat/new` 是新建页，`/chat/:conversationId` 只表示服务端真实会话。路由 helper 集中处理路径构造和 legacy URL 规范化，页面组件只消费 `model` hint，不再消费 `new=true`。

**Tech Stack:** Next.js 15 App Router, React 19, Redux Toolkit, Vitest + Testing Library.

---

## File Structure

- Create `src/lib/routes/chatRoutes.ts`: 聊天路由 helper，集中构造 `/chat/new`、`/chat/:id`，识别 legacy `new=true`。
- Create `src/lib/routes/chatRoutes.test.ts`: helper 单元测试。
- Create `src/app/(app)/chat/new/page.tsx`: 正式新建对话页面，装配 `HomeChatSurface`。
- Create `src/app/(app)/chat/new/page.test.tsx`: 新建页渲染和发送过渡测试。
- Modify `src/app/(app)/page.tsx`: `/` 入口 alias，规范化到 `/chat/new`。
- Modify `src/app/(app)/page.test.tsx`: `/` 和 `/?new=true&model=...` redirect 测试。
- Modify `src/components/home/HomeChatSurface.tsx`: 移除 `new=true` effect，消费 `model` hint，发送时 draft 不进 URL。
- Modify `src/app/(app)/layout.tsx`: 侧边栏新建按钮导航到 `/chat/new?...`，移除 `showNewChatSurface` 覆盖层。
- Modify `src/app/(app)/layout.test.tsx`: 更新新建导航和 active 状态预期。
- Modify `src/components/chat/ChatSidebar.tsx`: `/chat/new` 作为新建 active；`/chat/new` 不当作会话 id。
- Modify `src/components/models/ModelSelector.tsx`: `/chat/new` 不当作 active chat id。
- Modify `src/app/(app)/chat/[chatId]/page.tsx`: 错误态“返回首页”改为 `/chat/new`。
- Update affected tests under `src/components/chat/*.test.tsx` and `src/components/models/*.test.tsx` only if existing expectations depend on `/`.

## Task 1: 建立聊天路由 helper

**Files:**
- Create: `src/lib/routes/chatRoutes.ts`
- Create: `src/lib/routes/chatRoutes.test.ts`

- [ ] **Step 1: Write failing helper tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildChatConversationPath,
  buildChatNewPath,
  getRouteConversationId,
  isChatNewPath,
  normalizeLegacyNewChatPath,
} from './chatRoutes';

describe('chatRoutes', () => {
  it('builds /chat/new without model when no model id is provided', () => {
    expect(buildChatNewPath()).toBe('/chat/new');
    expect(buildChatNewPath(null)).toBe('/chat/new');
    expect(buildChatNewPath('')).toBe('/chat/new');
  });

  it('builds /chat/new with encoded model hint', () => {
    expect(buildChatNewPath('deepseek-chat')).toBe('/chat/new?model=deepseek-chat');
    expect(buildChatNewPath('model with space')).toBe('/chat/new?model=model+with+space');
  });

  it('builds conversation path from server id', () => {
    expect(buildChatConversationPath('conv-1')).toBe('/chat/conv-1');
  });

  it('recognizes only /chat/new and / as new chat routes', () => {
    expect(isChatNewPath('/chat/new')).toBe(true);
    expect(isChatNewPath('/')).toBe(true);
    expect(isChatNewPath('/chat/conv-1')).toBe(false);
  });

  it('does not treat /chat/new as a conversation id', () => {
    expect(getRouteConversationId('/chat/new')).toBeNull();
    expect(getRouteConversationId('/chat/conv-1')).toBe('conv-1');
  });

  it('normalizes legacy new=true URL to /chat/new', () => {
    expect(normalizeLegacyNewChatPath(new URLSearchParams('new=true&model=deepseek-chat'))).toBe(
      '/chat/new?model=deepseek-chat'
    );
    expect(normalizeLegacyNewChatPath(new URLSearchParams('new=true'))).toBe('/chat/new');
    expect(normalizeLegacyNewChatPath(new URLSearchParams('model=deepseek-chat'))).toBe('/chat/new?model=deepseek-chat');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/routes/chatRoutes.test.ts
```

Expected: FAIL because `src/lib/routes/chatRoutes.ts` does not exist.

- [ ] **Step 3: Implement helper**

```ts
export const CHAT_NEW_PATH = '/chat/new';

export function buildChatNewPath(modelId?: string | null): string {
  const trimmed = modelId?.trim();
  if (!trimmed) {
    return CHAT_NEW_PATH;
  }

  const params = new URLSearchParams();
  params.set('model', trimmed);
  return `${CHAT_NEW_PATH}?${params.toString()}`;
}

export function buildChatConversationPath(conversationId: string): string {
  return `/chat/${encodeURIComponent(conversationId)}`;
}

export function isChatNewPath(pathname: string | null | undefined): boolean {
  return pathname === CHAT_NEW_PATH || pathname === '/';
}

export function getRouteConversationId(pathname: string | null | undefined): string | null {
  if (!pathname?.startsWith('/chat/')) {
    return null;
  }

  const rawId = pathname.slice('/chat/'.length);
  if (!rawId || rawId === 'new') {
    return null;
  }

  return decodeURIComponent(rawId);
}

export function normalizeLegacyNewChatPath(searchParams: URLSearchParams): string {
  return buildChatNewPath(searchParams.get('model'));
}
```

- [ ] **Step 4: Verify helper tests pass**

Run:

```bash
npm test -- src/lib/routes/chatRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/routes/chatRoutes.ts src/lib/routes/chatRoutes.test.ts
git commit -m "refactor: 新增聊天路由工具" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 2: 引入 `/chat/new` 页面并规范化 `/`

**Files:**
- Create: `src/app/(app)/chat/new/page.tsx`
- Create: `src/app/(app)/chat/new/page.test.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/page.test.tsx`

- [ ] **Step 1: Move existing new-chat render test to `/chat/new`**

Create `src/app/(app)/chat/new/page.test.tsx` based on the current `src/app/(app)/page.test.tsx`, but import `NewChatPage` from `./page`.

Use this assertion for the existing send flow:

```ts
expect(routerReplaceMock.mock.calls).toEqual([
  ['/chat/server-conv'],
]);
```

This should fail before implementation because `chat/new/page.tsx` does not exist.

- [ ] **Step 2: Add `/` redirect tests**

Replace `src/app/(app)/page.test.tsx` with redirect-focused tests:

```ts
import { describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import Home from './page';

describe('Home route alias', () => {
  it('redirects / to /chat/new', async () => {
    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/chat/new');
    expect(redirectMock).toHaveBeenCalledWith('/chat/new');
  });

  it('normalizes legacy new=true model URL to /chat/new?model=...', async () => {
    await expect(
      Home({ searchParams: Promise.resolve({ new: 'true', model: 'deepseek-chat' }) })
    ).rejects.toThrow('NEXT_REDIRECT:/chat/new?model=deepseek-chat');
    expect(redirectMock).toHaveBeenCalledWith('/chat/new?model=deepseek-chat');
  });
});
```

- [ ] **Step 3: Run new route tests to verify failure**

Run:

```bash
npm test -- src/app/'(app)'/page.test.tsx src/app/'(app)'/chat/new/page.test.tsx
```

Expected: FAIL because route files still have old behavior.

- [ ] **Step 4: Create `/chat/new` page**

```tsx
'use client';

import { Suspense } from 'react';
import HomeChatSurface from '@/components/home/HomeChatSurface';

export default function NewChatPage() {
  return (
    <Suspense fallback={null}>
      <HomeChatSurface />
    </Suspense>
  );
}
```

- [ ] **Step 5: Make `/` a redirect alias**

```tsx
import { redirect } from 'next/navigation';
import { normalizeLegacyNewChatPath } from '@/lib/routes/chatRoutes';

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export default async function Home({ searchParams }: HomeProps) {
  const rawParams = (await searchParams) ?? {};
  const params = new URLSearchParams();
  const model = firstParam(rawParams.model);
  if (model) {
    params.set('model', model);
  }
  redirect(normalizeLegacyNewChatPath(params));
}
```

- [ ] **Step 6: Verify route tests pass**

Run:

```bash
npm test -- src/app/'(app)'/page.test.tsx src/app/'(app)'/chat/new/page.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/'(app)'/page.tsx src/app/'(app)'/page.test.tsx src/app/'(app)'/chat/new/page.tsx src/app/'(app)'/chat/new/page.test.tsx
git commit -m "refactor: 新增新建对话路由" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 3: 收敛新建页状态和发送过渡

**Files:**
- Modify: `src/components/home/HomeChatSurface.tsx`
- Test: `src/app/(app)/chat/new/page.test.tsx`

- [ ] **Step 1: Add failing tests for model hint and draft URL behavior**

Extend `src/app/(app)/chat/new/page.test.tsx`:

```ts
it('发送第一条消息时不把本地 draft id 写入 URL，只在 materialized 后进入真实会话', () => {
  sendMessageMock.mockImplementation((_content: string, options: any) => {
    options.onDraftCreated('draft-conv');
    options.onMaterialized('server-conv');
  });

  render(<NewChatPage />);
  fireEvent.click(screen.getByRole('button', { name: '示例问题' }));

  expect(routerReplaceMock.mock.calls).toEqual([
    ['/chat/server-conv'],
  ]);
});
```

Add a model hint test with mutable `searchParamsGetMock`:

```ts
it('直达 /chat/new?model=model-1 时只消费 model hint，不消费 new=true', () => {
  searchParamsGetMock.mockImplementation((name: string) => {
    if (name === 'model') return 'model-1';
    if (name === 'new') return 'true';
    return null;
  });

  render(<NewChatPage />);

  expect(setSelectedModelMock).toHaveBeenCalledWith('model-1');
  expect(chatInputMock).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/app/'(app)'/chat/new/page.test.tsx
```

Expected: FAIL because current `HomeChatSurface` still consumes `new=true` and replaces URL on draft creation.

- [ ] **Step 3: Update `HomeChatSurface` imports and state**

Use this structure:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setSelectedModel } from '@/redux/slices/modelsSlice';
import { buildChatConversationPath, buildChatNewPath } from '@/lib/routes/chatRoutes';
```

- [ ] **Step 4: Consume `model` hint once**

```tsx
const dispatch = useAppDispatch();
const searchParams = useSearchParams();
const queryModelId = searchParams?.get('model') ?? null;
const selectedModelId = useAppSelector((state) => state.models.selectedModelId);
const consumedModelHintRef = useRef<string | null>(null);

useEffect(() => {
  if (!queryModelId || consumedModelHintRef.current === queryModelId || models.length === 0) {
    return;
  }

  consumedModelHintRef.current = queryModelId;
  const hintedModel = models.find((model) => model.id === queryModelId && model.enabled !== false);
  if (hintedModel) {
    if (selectedModelId !== hintedModel.id) {
      dispatch(setSelectedModel(hintedModel.id));
    }
    return;
  }

  const fallbackModelId = getFirstEnabledModelId(models);
  router.replace(buildChatNewPath(fallbackModelId));
  if (fallbackModelId && selectedModelId !== fallbackModelId) {
    dispatch(setSelectedModel(fallbackModelId));
  }
}, [dispatch, models, queryModelId, router, selectedModelId]);
```

- [ ] **Step 5: Remove draft URL replacement**

Change `handleSendMessage` options:

```tsx
onDraftCreated: () => {
  // 新建页保留在 /chat/new，等待后端返回真实 conversationId。
},
onMaterialized: (serverConversationId) => {
  router.replace(buildChatConversationPath(serverConversationId));
  setInputKey(Date.now());
},
```

- [ ] **Step 6: Make local new-chat reset explicit**

Keep `handleNewChat` as local reset only:

```tsx
const handleNewChat = useCallback(() => {
  setInputKey(Date.now());
}, []);
```

- [ ] **Step 7: Verify tests pass**

Run:

```bash
npm test -- src/app/'(app)'/chat/new/page.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/home/HomeChatSurface.tsx src/app/'(app)'/chat/new/page.test.tsx
git commit -m "refactor: 收敛新建对话页面状态" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 4: 更新布局、侧边栏和模型选择的路由语义

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/layout.test.tsx`
- Modify: `src/components/chat/ChatSidebar.tsx`
- Modify: `src/components/models/ModelSelector.tsx`
- Modify: `src/app/(app)/chat/[chatId]/page.tsx`

- [ ] **Step 1: Write failing layout test**

Update `src/app/(app)/layout.test.tsx` expected navigation:

```ts
expect(routerPushMock).toHaveBeenCalledWith('/chat/new?model=model-1');
```

Add an assertion that `HomeChatSurface` is no longer mounted by layout override:

```ts
expect(homeChatSurfaceMock).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run layout test to verify failure**

Run:

```bash
npm test -- src/app/'(app)'/layout.test.tsx
```

Expected: FAIL because layout still pushes `/?new=true...` and renders override surface.

- [ ] **Step 3: Simplify `AppLayout`**

Remove `showNewChatSurface` and `pendingFromPathRef`. Use:

```tsx
const handleNewChat = useCallback(() => {
  const modelToUse = getFirstEnabledModelId(models);
  router.push(buildChatNewPath(modelToUse));
}, [models, router]);

return (
  <MainLayout
    sidebar={<ChatSidebar onNewChat={handleNewChat} isNewChatActive={isChatNewPath(pathname)} />}
  >
    <PerfProbe />
    {children}
  </MainLayout>
);
```

- [ ] **Step 4: Update sidebar active id parsing**

In `ChatSidebar.tsx`, replace direct string parsing with helper:

```tsx
const routeConversationId = getRouteConversationId(pathname);
const activeChatId = activeChatIdOverride === undefined ? routeConversationId : activeChatIdOverride;
```

- [ ] **Step 5: Update `ModelSelector` active chat parsing**

```tsx
const activeChatId = getRouteConversationId(pathname);
```

This prevents `/chat/new` from being treated as a conversation id named `new`.

- [ ] **Step 6: Update chat error fallback**

In `src/app/(app)/chat/[chatId]/page.tsx`, change the error button:

```tsx
onClick={() => router.push(CHAT_NEW_PATH)}
```

- [ ] **Step 7: Verify affected route tests**

Run:

```bash
npm test -- src/app/'(app)'/layout.test.tsx src/components/chat/ChatSidebar.test.tsx src/components/models/ModelSelector.test.tsx src/app/'(app)'/chat/'[chatId]'/page.test.tsx
```

Expected: PASS. If one of the component test files does not exist, remove it from the command and record that it was not present.

- [ ] **Step 8: Commit**

```bash
git add src/app/'(app)'/layout.tsx src/app/'(app)'/layout.test.tsx src/components/chat/ChatSidebar.tsx src/components/models/ModelSelector.tsx src/app/'(app)'/chat/'[chatId]'/page.tsx
git commit -m "refactor: 统一聊天路由语义" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

## Task 5: 全面清理 `new=true` 并做构建验证

**Files:**
- Modify tests/docs only if `rg` identifies stale references in active product tests.

- [ ] **Step 1: Search for remaining production usage**

Run:

```bash
rg -n "new=true|/\\?new=true" src
```

Expected: no production usage. Test files may contain legacy redirect coverage only.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm test -- src/lib/routes/chatRoutes.test.ts src/app/'(app)'/page.test.tsx src/app/'(app)'/chat/new/page.test.tsx src/app/'(app)'/layout.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full Vitest**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. Do not start local dev server.

- [ ] **Step 5: Commit verification-only cleanups if any**

If tests required expectation updates not covered by previous commits:

```bash
git add <exact changed test files>
git commit -m "test: 补充新建对话路由回归" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

If no changes remain, skip this commit.

## Task 6: 发布和真实 Chrome 回归

**Files:**
- No source changes expected.

- [ ] **Step 1: Push branch and open PR**

Use a feature branch, not `master`:

```bash
git status --short
git push -u origin "$(git branch --show-current)"
```

Open a draft PR with summary and validation evidence.

- [ ] **Step 2: Monitor CI**

Run:

```bash
gh pr checks --watch --interval 10
```

Expected: build/test job passes. If push/deploy auth fails, inspect workflow logs before changing code.

- [ ] **Step 3: Merge and deploy dev after CI passes**

After PR is ready and checks pass, merge through normal GitHub flow. Watch the `master` deployment run until dev health verification completes.

- [ ] **Step 4: Real Chrome regression on deployed URL**

Use the user's logged-in Chrome against deployed `https://fusion.seanfield.org`; do not start local Fusion services.

Verify:

- Open `https://fusion.seanfield.org/chat/new?model=deepseek-chat`; page shows new composer and no React #185.
- Send a smoke prompt; while streaming, URL stays `/chat/new...`.
- After materialization, URL becomes `/chat/<serverId>`.
- Open a historical `/chat/<serverId>` URL directly; content hydrates.
- Click sidebar “新对话”; page goes to `/chat/new?...`, old conversation content disappears immediately.
- Console has no new error-level logs.

## Plan Self-Review

- Spec coverage: URL 状态机、导航行为、发送过渡、模型选择优先级、回归测试点均有对应 task。
- Placeholder scan: no `TBD`, `TODO`, or open-ended “add tests” instructions; each task has exact file paths and commands.
- Type consistency: route helper names are reused consistently across tasks.
- Scope check: plan only changes routing/new-chat transition; it does not introduce offline draft URLs or broad chat state rewrites.
