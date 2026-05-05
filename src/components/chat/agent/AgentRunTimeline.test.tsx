import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import streamSliceReducer, { initRun, pushStep, pushToolCall, finalizeToolCall, finalizeStep, finalizeRun } from '@/redux/slices/streamSlice';
import { AgentRunTimeline } from './AgentRunTimeline';

function makeStore() {
  return configureStore({ reducer: { stream: streamSliceReducer } });
}

const baseConfig = { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 };

describe('AgentRunTimeline 集成', () => {
  it('currentRun 为空时不渲染', () => {
    const store = makeStore();
    const { container } = render(
      <Provider store={store}>
        <AgentRunTimeline assistantMessageId="m_other" />
      </Provider>
    );
    expect(container.firstChild).toBeNull();
  });

  it('messageId 不匹配时不渲染（contract §1 message 归属）', () => {
    const store = makeStore();
    store.dispatch(initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    const { container } = render(
      <Provider store={store}>
        <AgentRunTimeline assistantMessageId="m_OTHER" />
      </Provider>
    );
    expect(container.firstChild).toBeNull();
  });

  it('完整 run 渲染：RunHeader + StepTimeline + 工具步骤', () => {
    const store = makeStore();
    store.dispatch(initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    store.dispatch(pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    store.dispatch(pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: { query: 'GPT 5.5' }, sequence: 2,
    }));
    store.dispatch(finalizeToolCall({
      runId: 'r1', toolCallId: 't1',
      status: 'success', durationMs: 100, sequence: 3,
    }));
    store.dispatch(finalizeStep({ runId: 'r1', stepId: 's1', sequence: 4 }));

    render(
      <Provider store={store}>
        <AgentRunTimeline assistantMessageId="m1" />
      </Provider>
    );
    expect(screen.getByText(/已用/)).toBeInTheDocument();
    expect(screen.getByText(/搜索/)).toBeInTheDocument();
  });

  it('点击 RunBanner 重试按钮触发外层 onRetry callback', () => {
    const store = makeStore();
    store.dispatch(initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    // 模拟 failed 终态
    store.dispatch(pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    store.dispatch(finalizeRun({
      runId: 'r1', status: 'failed', sequence: 2,
      failure: { code: 'TEST_FAIL', message: '测试失败' },
    }));

    const onRetry = vi.fn();
    render(
      <Provider store={store}>
        <AgentRunTimeline assistantMessageId="m1" onRetry={onRetry} />
      </Provider>
    );
    fireEvent.click(screen.getByText(/重试运行/));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('serverMessageId 匹配时也能渲染 timeline（messageId 不匹配但 serverMessageId 匹配）', () => {
    const store = makeStore();
    // initRun 支持直接传 serverMessageId，无需 setServerMessageId action
    store.dispatch(initRun({
      runId: 'r1',
      messageId: 'placeholder_local',
      serverMessageId: 'm_server',
      config: baseConfig,
      sequence: 0,
    }));
    store.dispatch(pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));

    render(
      <Provider store={store}>
        <AgentRunTimeline assistantMessageId="m_server" />
      </Provider>
    );
    expect(screen.getByText(/已用/)).toBeInTheDocument();
  });

  it('completed + steps=[] 不渲染（M1 guard 行为）', () => {
    const store = makeStore();
    store.dispatch(initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    store.dispatch(finalizeRun({ runId: 'r1', status: 'completed', sequence: 1 }));
    const { container } = render(
      <Provider store={store}>
        <AgentRunTimeline assistantMessageId="m1" />
      </Provider>
    );
    expect(container.firstChild).toBeNull();
  });

  it('failed + steps=[] 仍显示失败 banner（防 M1 guard 误杀 ProviderOffline 场景）', () => {
    const store = makeStore();
    store.dispatch(initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    store.dispatch(finalizeRun({
      runId: 'r1', status: 'failed', sequence: 1,
      failure: { code: 'PROVIDER_OFFLINE', message: 'OpenAI 上游断流' },
    }));
    render(
      <Provider store={store}>
        <AgentRunTimeline assistantMessageId="m1" />
      </Provider>
    );
    expect(screen.getByText(/运行失败/)).toBeInTheDocument();
    expect(screen.getByText(/OpenAI 上游断流/)).toBeInTheDocument();
  });
});
