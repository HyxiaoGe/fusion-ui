# Agent 可读化任务时间线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端接入 Agent Progress Protocol v2，将计划、进度、工具结果摘要和证据摘要展示为低干扰、可恢复、可读的 agent 任务时间线。

**Architecture:** `chat.ts` 继续负责 SSE envelope 解析，新增 v2 callbacks；`streamSlice` 保存 streaming 期 progress/plan/digest/evidence，`conversationHydration` 从历史 snapshot 恢复。`AgentRunTimeline` 只组合可读增强组件，业务映射收敛到 `src/lib/agent/streamEventHandlers.ts`，避免 send/continue/reconnect 三处复制。

**Tech Stack:** Next.js 15, React 19, Redux Toolkit, TypeScript, Vitest, Testing Library, lucide-react.

---

## 文件结构

- 修改 `src/types/agentRun.ts`：新增 v2 类型，扩展 `AgentRunState` 和 `AgentEventEnvelope`。
- 修改 `src/lib/api/chat.ts`：新增 v2 callback 类型和二级 dispatch。
- 修改 `src/redux/slices/streamSlice.ts`：新增 v2 reducers，保持 `endStream` 保留 currentRun。
- 新建 `src/lib/agent/streamEventHandlers.ts`：集中把 v1/v2 agent_event callback 映射到 Redux actions。
- 修改 `src/hooks/useSendMessage.ts`：复用共享 agent event handlers。
- 修改 `src/hooks/useContinueAgentRun.ts`：复用共享 agent event handlers。
- 修改 `src/app/(app)/chat/[chatId]/page.tsx`：reconnect 复用共享 agent event handlers。
- 修改 `src/lib/chat/conversationHydration.ts`：映射服务端 `agent_run.progress` snapshot。
- 新建 `src/components/chat/agent/RunProgressStrip.tsx`：展示当前阶段和预算进度。
- 新建 `src/components/chat/agent/PlanTimeline.tsx`：展示计划项和折叠规则。
- 新建 `src/components/chat/agent/EvidenceDigest.tsx`：展示最多 3 条关键证据。
- 修改 `src/components/chat/agent/ToolCallSummary.tsx`：details 模式优先展示 digest 摘要。
- 修改 `src/components/chat/agent/AgentRunTimeline.tsx`：组合新组件并调整 completed 隐藏规则。
- 修改 `src/components/chat/agent/index.ts`：导出新增组件。
- 新增/修改测试：
  - `src/lib/api/chat.test.ts`
  - `src/redux/slices/streamSlice.test.ts`
  - `src/lib/agent/streamEventHandlers.test.ts`
  - `src/lib/chat/conversationHydration.test.ts`
  - `src/components/chat/agent/RunProgressStrip.test.tsx`
  - `src/components/chat/agent/PlanTimeline.test.tsx`
  - `src/components/chat/agent/EvidenceDigest.test.tsx`
  - `src/components/chat/agent/ToolCallSummary.test.tsx`
  - `src/components/chat/agent/AgentRunTimeline.test.tsx`

## 实施约束

- 不解析 reasoning 文本，不从 raw tool output 猜证据链。
- 普通 completed 成功回答继续低干扰；running、failed、limit_reached、interrupted 才提高可见性。
- 所有新增控件必须在移动/桌面宽度内不溢出；长标题/domain/snippet 使用 `truncate` 和 `title`。
- spinner 必须伴随可读文字，不只靠动画表达状态。
- 不启动本地 Fusion 服务；验证使用 Vitest、Next build、CI/CD 和正式域名 Chrome 回归。
- 为减少 CI/CD 浪费，本计划执行时按测试检查点推进，最终合并为一个 UI 功能提交。

## Task 1: v2 类型和 API parser callbacks

**Files:**
- Modify: `src/types/agentRun.ts`
- Modify: `src/lib/api/chat.ts`
- Modify: `src/lib/api/chat.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/lib/api/chat.test.ts` 增加：

```ts
it('agent_event v2 五类事件 dispatch 到对应 callback 且不触发 onReady', async () => {
  fetchWithAuthMock.mockResolvedValue(
    createStreamResponse([
      agentEvent('run_progress_updated', {
        protocol_version: 2,
        phase: 'researching',
        label: '正在搜索相关资料',
        completed_steps: 1,
        total_steps: 4,
      }, 0),
      agentEvent('plan_snapshot', {
        protocol_version: 2,
        plan_id: 'plan-r1',
        revision: 1,
        items: [{ id: 'search', title: '搜索资料', status: 'running', kind: 'search', tool_names: ['web_search'], evidence_item_ids: [] }],
      }, 1),
      agentEvent('plan_step_updated', {
        protocol_version: 2,
        plan_id: 'plan-r1',
        revision: 2,
        item: { id: 'search', title: '搜索资料', status: 'completed', kind: 'search', tool_names: ['web_search'], evidence_item_ids: ['ev-1'] },
      }, 2),
      agentEvent('tool_result_digest', {
        protocol_version: 2,
        tool_call_id: 'tc1',
        tool_name: 'web_search',
        status: 'success',
        title: '找到 2 条结果',
        summary: '优先保留官方来源。',
        key_findings: ['官方页面确认发布时间。'],
        source_refs: ['ev-1'],
        truncated: false,
      }, 3),
      agentEvent('evidence_item_upserted', {
        protocol_version: 2,
        evidence: {
          id: 'ev-1',
          kind: 'web',
          status: 'used',
          title: '官方发布页',
          url: 'https://example.com/news',
          domain: 'example.com',
          claim: '官方页面确认发布时间。',
          used_by_final_answer: true,
        },
      }, 4),
      envelope('done', {}),
      'data: [DONE]\n\n',
    ]),
  );

  const callbacks = {
    onReady: vi.fn(),
    onRunProgressUpdated: vi.fn(),
    onPlanSnapshot: vi.fn(),
    onPlanStepUpdated: vi.fn(),
    onToolResultDigest: vi.fn(),
    onEvidenceItemUpserted: vi.fn(),
    onReasoning: vi.fn(),
    onAnswering: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };

  await sendMessageStream({ model_id: 'g', message: 'q' }, callbacks);

  expect(callbacks.onReady).not.toHaveBeenCalled();
  expect(callbacks.onRunProgressUpdated).toHaveBeenCalledTimes(1);
  expect(callbacks.onPlanSnapshot).toHaveBeenCalledTimes(1);
  expect(callbacks.onPlanStepUpdated).toHaveBeenCalledTimes(1);
  expect(callbacks.onToolResultDigest).toHaveBeenCalledTimes(1);
  expect(callbacks.onEvidenceItemUpserted).toHaveBeenCalledTimes(1);
});
```

另加 sequence 倒退测试：v2 `sequence <= last` 时不触发 v2 callback。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/lib/api/chat.test.ts
```

Expected: FAIL，原因是 `StreamCallbacks` 没有 v2 callbacks，`dispatchAgentEvent` unknown warn。

- [ ] **Step 3: 扩展类型**

在 `src/types/agentRun.ts` 增加：

```ts
export type AgentProgressPhase = 'planning' | 'thinking' | 'researching' | 'reading' | 'synthesizing' | 'answering' | 'recovering';
export type AgentPlanItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked';
export type AgentPlanItemKind = 'reasoning' | 'search' | 'read' | 'synthesis' | 'answer' | 'other';

export interface AgentProgressState {
  phase: AgentProgressPhase;
  label: string;
  completedSteps?: number;
  totalSteps?: number;
  completedToolCalls?: number;
  maxToolCalls?: number;
}
```

继续增加 `AgentPlanItem`、`AgentPlanState`、`AgentEvidenceItem`、`AgentToolDigest`，并让 `AgentRunState` 增加：

```ts
protocolVersion?: number;
progress?: AgentProgressState;
plan?: AgentPlanState;
evidence: AgentEvidenceItem[];
toolDigests: AgentToolDigest[];
```

`initRun` 后默认 `evidence: []`、`toolDigests: []`。

- [ ] **Step 4: 扩展 parser callbacks**

`StreamCallbacks` 增加：

```ts
onRunProgressUpdated?: (ev: AgentEventEnvelope & {
  protocol_version: 2;
  phase: AgentProgressPhase;
  label: string;
  completed_steps?: number;
  total_steps?: number;
  completed_tool_calls?: number;
  max_tool_calls?: number;
}) => void;
```

同样增加 `onPlanSnapshot`、`onPlanStepUpdated`、`onToolResultDigest`、`onEvidenceItemUpserted`。`dispatchAgentEvent` 增加五个 case，未知 v2 仍 warn，不抛错。

- [ ] **Step 5: 验证通过**

Run:

```bash
npm test -- src/lib/api/chat.test.ts
```

Expected: PASS。

## Task 2: Redux v2 reducers

**Files:**
- Modify: `src/redux/slices/streamSlice.ts`
- Modify: `src/redux/slices/streamSlice.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/redux/slices/streamSlice.test.ts` 增加：

```ts
it('updateRunProgress 写入 progress 并按 sequence 幂等', () => {
  let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
  s = reducer(s, updateRunProgress({
    runId: 'r1',
    sequence: 1,
    progress: { phase: 'researching', label: '正在搜索相关资料', completedSteps: 1, totalSteps: 4 },
  }));
  s = reducer(s, updateRunProgress({
    runId: 'r1',
    sequence: 1,
    progress: { phase: 'answering', label: '旧事件不应覆盖' },
  }));

  expect(s.currentRun?.progress?.label).toBe('正在搜索相关资料');
});

it('plan reducers 按 revision 更新并忽略旧 revision', () => {
  let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
  s = reducer(s, applyPlanSnapshot({
    runId: 'r1',
    sequence: 1,
    plan: { planId: 'plan-r1', revision: 2, items: [] },
  }));
  s = reducer(s, updatePlanStep({
    runId: 'r1',
    sequence: 2,
    planId: 'plan-r1',
    revision: 2,
    item: { id: 'search', title: '搜索资料', status: 'running', kind: 'search', toolNames: [], evidenceItemIds: [] },
  }));
  expect(s.currentRun?.plan?.items).toHaveLength(0);
});

it('upsertEvidenceItem 和 upsertToolDigest 不重复', () => {
  let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
  s = reducer(s, upsertEvidenceItem({ runId: 'r1', sequence: 1, evidence: { id: 'ev-1', kind: 'web', status: 'candidate', title: '来源', claim: '发现', usedByFinalAnswer: false } }));
  s = reducer(s, upsertEvidenceItem({ runId: 'r1', sequence: 2, evidence: { id: 'ev-1', kind: 'web', status: 'used', title: '来源', claim: '已采用', usedByFinalAnswer: true } }));
  s = reducer(s, upsertToolDigest({ runId: 'r1', sequence: 3, digest: { toolCallId: 'tc1', toolName: 'web_search', status: 'success', title: '找到结果', summary: '摘要', keyFindings: [], sourceRefs: ['ev-1'], truncated: false } }));

  expect(s.currentRun?.evidence).toHaveLength(1);
  expect(s.currentRun?.evidence[0].status).toBe('used');
  expect(s.currentRun?.toolDigests).toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/redux/slices/streamSlice.test.ts
```

Expected: FAIL，原因是 reducers 和默认字段不存在。

- [ ] **Step 3: 实现 reducers**

新增 actions：

```ts
updateRunProgress(state, action: PayloadAction<{ runId: string; sequence: number; progress: AgentProgressState }>)
applyPlanSnapshot(state, action: PayloadAction<{ runId: string; sequence: number; plan: AgentPlanState }>)
updatePlanStep(state, action: PayloadAction<{ runId: string; sequence: number; planId: string; revision: number; item: AgentPlanItem }>)
upsertToolDigest(state, action: PayloadAction<{ runId: string; sequence: number; digest: AgentToolDigest }>)
upsertEvidenceItem(state, action: PayloadAction<{ runId: string; sequence: number; evidence: AgentEvidenceItem }>)
```

共同规则：

- `!currentRun`、`runId` 不匹配、`sequence <= lastSequence` 时 no-op。
- 成功应用后更新 `lastSequence`。
- `updatePlanStep` 要求 `planId` 匹配且 `revision > currentRun.plan.revision`。
- upsert 按 `id/toolCallId` 覆盖。
- `endStream` 继续保留 `currentRun`，自然保留 v2 字段。

- [ ] **Step 4: 验证通过**

Run:

```bash
npm test -- src/redux/slices/streamSlice.test.ts
```

Expected: PASS。

## Task 3: 共享 stream event handlers

**Files:**
- Create: `src/lib/agent/streamEventHandlers.ts`
- Create: `src/lib/agent/streamEventHandlers.test.ts`
- Modify: `src/hooks/useSendMessage.ts`
- Modify: `src/hooks/useContinueAgentRun.ts`
- Modify: `src/app/(app)/chat/[chatId]/page.tsx`

- [ ] **Step 1: 写失败测试**

新建 `src/lib/agent/streamEventHandlers.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { createAgentStreamEventHandlers } from './streamEventHandlers';

describe('createAgentStreamEventHandlers', () => {
  it('映射 v1 run_started 和 v2 progress 到 Redux action', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      setServerMessageId: vi.fn(),
    });

    handlers.onRunStarted?.({
      type: 'run_started',
      run_id: 'r1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 0,
      trace_id: 'r1',
      ts: 0,
      conversation_id: 'c1',
      message_id: 'm1',
      model: 'gpt',
      tools: [],
      config: { max_steps: 8, max_tool_calls: 20, timeout_s: 300 },
    });
    handlers.onRunProgressUpdated?.({
      type: 'run_progress_updated',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 1,
      trace_id: 'r1',
      ts: 0,
      phase: 'planning',
      label: '正在理解问题',
    });

    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/lib/agent/streamEventHandlers.test.ts
```

Expected: FAIL，原因是模块不存在。

- [ ] **Step 3: 实现共享 handler**

`createAgentStreamEventHandlers()` 接收：

```ts
interface AgentStreamEventHandlerOptions {
  dispatch: AppDispatch;
  isActive: () => boolean;
  resolveMessageId: (ev: RunStartedEvent) => string;
  setServerMessageId?: (messageId: string) => void;
}
```

返回 `Partial<StreamCallbacks>`，包含现有 v1 映射和新增 v2 映射。字段转换规则：

- snake_case -> camelCase：`completed_steps` -> `completedSteps`。
- `plan.items[].tool_names` -> `toolNames`。
- `evidence.used_by_final_answer` -> `usedByFinalAnswer`。
- `tool_result_digest.source_refs` -> `sourceRefs`。

- [ ] **Step 4: 替换三处重复映射**

`useSendMessage.ts`、`useContinueAgentRun.ts`、`chat/[chatId]/page.tsx` 保留各自的 `onReady/onReasoning/onAnswering/onDone/onError`，agent event 部分创建 `const agentHandlers = createAgentStreamEventHandlers(options)`，再展开到 `sendMessageStream` / `continueAgentRunStream` / `reconnectStream` callbacks 对象中：

```ts
const agentHandlers = createAgentStreamEventHandlers({
  dispatch,
  isActive: () => Boolean(activeConvIdRef.current),
  resolveMessageId: ev => assistantMessageIdRef.current ?? ev.message_id,
  setServerMessageId: messageId => {
    serverMessageIdRef.current = messageId;
  },
});
```

Continuation 使用 `resolveMessageId: () => assistantMessageId`。

- [ ] **Step 5: 验证 hooks/page 测试**

Run:

```bash
npm test -- src/lib/agent/streamEventHandlers.test.ts src/hooks/useSendMessage.test.ts src/hooks/useContinueAgentRun.test.ts src/app/'(app)'/chat/'[chatId]'/page.test.tsx
```

Expected: PASS。

## Task 4: 历史 hydration 映射 progress snapshot

**Files:**
- Modify: `src/lib/chat/conversationHydration.ts`
- Modify: `src/lib/chat/conversationHydration.test.ts`

- [ ] **Step 1: 写失败测试**

在 `conversationHydration.test.ts` 增加：

```ts
it('server agent_run.progress snapshot 映射为 AgentRunState v2 字段', () => {
  const chat = buildChatFromServerConversation({
    id: 'c1',
    title: 't',
    model_id: 'g',
    messages: [{
      id: 'm1',
      role: 'assistant',
      content: [{ type: 'text', id: 'b1', text: '回答' }],
      agent_run: {
        run_id: 'r1',
        status: 'completed',
        config: { max_steps: 8, max_tool_calls: 20, timeout_s: 300 },
        total_steps: 1,
        total_tool_calls: 1,
        progress: {
          protocol_version: 2,
          progress: { phase: 'answering', label: '正在整理回答', completed_steps: 4, total_steps: 4 },
          plan: { plan_id: 'plan-r1', revision: 2, items: [{ id: 'answer', title: '整理回答', status: 'completed', kind: 'answer', tool_names: [], evidence_item_ids: ['ev-1'] }] },
          evidence: [{ id: 'ev-1', kind: 'web', status: 'used', title: '官方页', domain: 'example.com', claim: '确认发布时间', used_by_final_answer: true }],
          tool_digests: [{ tool_call_id: 'tc1', tool_name: 'web_search', status: 'success', title: '找到结果', summary: '摘要', key_findings: [], source_refs: ['ev-1'], truncated: false }],
        },
      },
    }],
    created_at: 0,
    updated_at: 0,
  });

  const run = chat.messages[0].agent_run;
  expect(run?.progress?.completedSteps).toBe(4);
  expect(run?.plan?.items[0].toolNames).toEqual([]);
  expect(run?.evidence[0].usedByFinalAnswer).toBe(true);
  expect(run?.toolDigests[0].toolCallId).toBe('tc1');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/lib/chat/conversationHydration.test.ts
```

Expected: FAIL，原因是 `ServerAgentRunSummary` 没有 progress 映射。

- [ ] **Step 3: 实现 mapper**

新增 helper：

```ts
function mapAgentProgressSnapshot(snapshot: ServerAgentProgressSnapshot | null | undefined): Pick<AgentRunState, 'protocolVersion' | 'progress' | 'plan' | 'evidence' | 'toolDigests'> {
  return {
    protocolVersion: snapshot?.protocol_version ?? undefined,
    progress: snapshot?.progress ? {
      phase: snapshot.progress.phase,
      label: snapshot.progress.label,
      completedSteps: snapshot.progress.completed_steps,
      totalSteps: snapshot.progress.total_steps,
      completedToolCalls: snapshot.progress.completed_tool_calls,
      maxToolCalls: snapshot.progress.max_tool_calls,
    } : undefined,
    plan: snapshot?.plan ? {
      planId: snapshot.plan.plan_id,
      revision: snapshot.plan.revision,
      items: snapshot.plan.items.map(mapPlanItem),
    } : undefined,
    evidence: (snapshot?.evidence ?? []).map(mapEvidenceItem),
    toolDigests: (snapshot?.tool_digests ?? []).map(mapToolDigest),
  };
}
```

`buildAgentRunState()` 展开该 helper，缺失 snapshot 时 `evidence: []`、`toolDigests: []`。

- [ ] **Step 4: 验证通过**

Run:

```bash
npm test -- src/lib/chat/conversationHydration.test.ts
```

Expected: PASS。

## Task 5: RunProgressStrip、PlanTimeline、EvidenceDigest

**Files:**
- Create: `src/components/chat/agent/RunProgressStrip.tsx`
- Create: `src/components/chat/agent/RunProgressStrip.test.tsx`
- Create: `src/components/chat/agent/PlanTimeline.tsx`
- Create: `src/components/chat/agent/PlanTimeline.test.tsx`
- Create: `src/components/chat/agent/EvidenceDigest.tsx`
- Create: `src/components/chat/agent/EvidenceDigest.test.tsx`
- Modify: `src/components/chat/agent/index.ts`

- [ ] **Step 1: 写组件失败测试**

`RunProgressStrip.test.tsx`：

```ts
it('显示阶段 label 和步数/工具预算', () => {
  render(<RunProgressStrip run={run({ status: 'running', progress: { phase: 'researching', label: '正在搜索相关资料', completedSteps: 2, totalSteps: 4, completedToolCalls: 3, maxToolCalls: 20 } })} />);
  expect(screen.getByText(/正在搜索相关资料/)).toBeInTheDocument();
  expect(screen.getByText(/2\/4 步/)).toBeInTheDocument();
  expect(screen.getByText(/工具 3\/20/)).toBeInTheDocument();
});
```

`PlanTimeline.test.tsx`：

```ts
const planWithItems = {
  planId: 'plan-r1',
  revision: 1,
  items: [
    { id: 'understand', title: '理解问题', status: 'completed', kind: 'reasoning', toolNames: [], evidenceItemIds: [] },
    { id: 'search', title: '搜索资料', status: 'running', kind: 'search', toolNames: ['web_search'], evidenceItemIds: [] },
  ],
} satisfies AgentPlanState;

it('running 时默认展示计划项，completed 正常成功默认折叠', () => {
  render(<PlanTimeline run={run({ status: 'running', plan: planWithItems })} />);
  expect(screen.getByText('搜索资料')).toBeInTheDocument();
});
```

`EvidenceDigest.test.tsx`：

```ts
function evidence(title: string, status: 'candidate' | 'used' | 'discarded'): AgentEvidenceItem {
  return {
    id: title,
    kind: 'web',
    status,
    title,
    domain: 'example.com',
    claim: `${title} 的关键发现`,
    usedByFinalAnswer: status === 'used',
  };
}

it('最多显示 3 条 evidence 且 used 优先', () => {
  render(<EvidenceDigest run={run({ evidence: [
    evidence('candidate-1', 'candidate'),
    evidence('used-1', 'used'),
    evidence('used-2', 'used'),
    evidence('candidate-2', 'candidate'),
  ] })} />);
  expect(screen.getByText('used-1')).toBeInTheDocument();
  expect(screen.getByText('used-2')).toBeInTheDocument();
  expect(screen.queryByText('candidate-2')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/components/chat/agent/RunProgressStrip.test.tsx src/components/chat/agent/PlanTimeline.test.tsx src/components/chat/agent/EvidenceDigest.test.tsx
```

Expected: FAIL，原因是组件不存在。

- [ ] **Step 3: 实现组件**

组件规则：

- `RunProgressStrip`：`!run.progress` 返回 null；running 显示 `Loader2` 和 label；completed 正常成功返回 null；limit/failed/interrupted 保留。
- `PlanTimeline`：`!run.plan?.items.length` 返回 null；running/limit/failed/interrupted 默认展开；completed 无异常默认只显示 `已完成 N 步` 折叠按钮。
- `EvidenceDigest`：只展示 `used` 和 candidate，discarded 默认隐藏；最多 3 条；每条展示 title、domain、claim，snippet 放展开区。

样式保持低干扰：`text-xs`、`border-l`、`bg-muted/30`，不用大卡片包大卡片。

- [ ] **Step 4: 验证通过**

Run:

```bash
npm test -- src/components/chat/agent/RunProgressStrip.test.tsx src/components/chat/agent/PlanTimeline.test.tsx src/components/chat/agent/EvidenceDigest.test.tsx
```

Expected: PASS。

## Task 6: 接入 AgentRunTimeline 和工具摘要增强

**Files:**
- Modify: `src/components/chat/agent/AgentRunTimeline.tsx`
- Modify: `src/components/chat/agent/AgentRunTimeline.test.tsx`
- Modify: `src/components/chat/agent/ToolCallSummary.tsx`
- Modify: `src/components/chat/agent/ToolCallSummary.test.tsx`
- Modify: `src/lib/agent/toolCallGroups.ts`
- Modify: `src/lib/agent/toolCallGroups.test.ts`

- [ ] **Step 1: 写失败测试**

在 `AgentRunTimeline.test.tsx` 增加：

```ts
it('running v2 run 渲染 progress、plan、step timeline、evidence', () => {
  renderTimeline(run({
    progress: { phase: 'researching', label: '正在搜索相关资料', completedSteps: 1, totalSteps: 4 },
    plan: { planId: 'plan-r1', revision: 1, items: [{ id: 'search', title: '搜索资料', status: 'running', kind: 'search', toolNames: ['web_search'], evidenceItemIds: [] }] },
    evidence: [{ id: 'ev-1', kind: 'web', status: 'used', title: '官方页', domain: 'example.com', claim: '确认发布时间', usedByFinalAnswer: true }],
  }));

  expect(screen.getByText(/正在搜索相关资料/)).toBeInTheDocument();
  expect(screen.getByText('搜索资料')).toBeInTheDocument();
  expect(screen.getByText('官方页')).toBeInTheDocument();
});
```

在 `ToolCallSummary.test.tsx` 增加 digest details 测试：对应 `toolCallId` 有 digest 时，details 模式显示 `digest.summary` 和 `keyFindings`。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- src/components/chat/agent/AgentRunTimeline.test.tsx src/components/chat/agent/ToolCallSummary.test.tsx src/lib/agent/toolCallGroups.test.ts
```

Expected: FAIL，原因是 timeline 未接新组件，tool group 不带 digest。

- [ ] **Step 3: 接入 timeline**

`AgentRunTimelineContent` 结构改为：

```tsx
<RunHeader run={run} />
<RunBanner
  run={run}
  onRetry={onRetry}
  onContinue={onContinue ? () => onContinue(run.runId) : undefined}
/>
<RunProgressStrip run={run} />
<PlanTimeline run={run} />
<StepTimeline run={run} />
<EvidenceDigest run={run} />
```

空 steps 守卫调整：如果 run 有 `progress`、`plan.items`、`evidence` 或 `toolDigests`，即使 `steps=[]` 也允许渲染。

`shouldHideCompletedRun()` 调整：completed 正常成功仍隐藏；若有 failed/blocked plan、degraded digest、used evidence 或 limit reason，保留低权重摘要。

- [ ] **Step 4: 工具摘要增强**

扩展 `ToolCallGroup`：

```ts
digest?: AgentToolDigest;
```

`deriveToolCallGroups(run)` 按 `toolCallId` 把 `run.toolDigests` 挂到对应 group。`ToolCallSummary` details 模式优先渲染：

```tsx
{group.digest && (
  <div className="space-y-1 text-xs">
    <div className="text-foreground/80">{group.digest.summary}</div>
    {group.digest.keyFindings.slice(0, 3).map(finding => (
      <div key={finding} className="text-muted-foreground">- {finding}</div>
    ))}
  </div>
)}
```

无 digest 时保留现有 details。

- [ ] **Step 5: 验证通过**

Run:

```bash
npm test -- src/components/chat/agent/AgentRunTimeline.test.tsx src/components/chat/agent/ToolCallSummary.test.tsx src/lib/agent/toolCallGroups.test.ts
```

Expected: PASS。

## Task 7: UI 集成验证和提交

**Files:**
- All frontend files above.

- [ ] **Step 1: 跑目标测试集**

Run:

```bash
npm test -- \
  src/lib/api/chat.test.ts \
  src/redux/slices/streamSlice.test.ts \
  src/lib/agent/streamEventHandlers.test.ts \
  src/lib/chat/conversationHydration.test.ts \
  src/components/chat/agent/RunProgressStrip.test.tsx \
  src/components/chat/agent/PlanTimeline.test.tsx \
  src/components/chat/agent/EvidenceDigest.test.tsx \
  src/components/chat/agent/AgentRunTimeline.test.tsx \
  src/components/chat/agent/ToolCallSummary.test.tsx \
  src/lib/agent/toolCallGroups.test.ts \
  src/hooks/useSendMessage.test.ts \
  src/hooks/useContinueAgentRun.test.ts \
  src/app/'(app)'/chat/'[chatId]'/page.test.tsx
```

Expected: PASS。

- [ ] **Step 2: 跑 UI 全量检查**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: 全部 exit 0。

- [ ] **Step 3: 自审要求覆盖**

逐项确认：

- v1 agent run 和老消息没有 v2 字段时仍正常显示。
- `run_id + sequence` 幂等仍在 parser 和 reducer 两层生效。
- send、continue、reconnect 共用同一个 agent event mapping。
- completed 正常成功不会被新 timeline 抢主视觉。
- limit/failed/interrupted 能看到 progress 和未完成/blocked plan。
- hydration 后的历史消息可显示 compact snapshot。
- 没有新增本地服务启动命令。

- [ ] **Step 4: 提交 UI 功能**

Run:

```bash
git status --short
git add src/types/agentRun.ts src/lib/api/chat.ts src/redux/slices/streamSlice.ts src/lib/agent/streamEventHandlers.ts src/hooks/useSendMessage.ts src/hooks/useContinueAgentRun.ts src/app/'(app)'/chat/'[chatId]'/page.tsx src/lib/chat/conversationHydration.ts src/components/chat/agent/RunProgressStrip.tsx src/components/chat/agent/PlanTimeline.tsx src/components/chat/agent/EvidenceDigest.tsx src/components/chat/agent/ToolCallSummary.tsx src/components/chat/agent/AgentRunTimeline.tsx src/components/chat/agent/index.ts src/lib/agent/toolCallGroups.ts src/lib/api/chat.test.ts src/redux/slices/streamSlice.test.ts src/lib/agent/streamEventHandlers.test.ts src/lib/chat/conversationHydration.test.ts src/components/chat/agent/RunProgressStrip.test.tsx src/components/chat/agent/PlanTimeline.test.tsx src/components/chat/agent/EvidenceDigest.test.tsx src/components/chat/agent/ToolCallSummary.test.tsx src/components/chat/agent/AgentRunTimeline.test.tsx src/lib/agent/toolCallGroups.test.ts src/hooks/useSendMessage.test.ts src/hooks/useContinueAgentRun.test.ts src/app/'(app)'/chat/'[chatId]'/page.test.tsx
git commit -m "feat: 支持 agent 可读化任务时间线" -m "Co-Authored-By: Codex <noreply@anthropic.com>"
```

Expected: 生成一个 UI 功能提交，不包含既有无关未跟踪 docs。
