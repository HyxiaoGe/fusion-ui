import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import streamSliceReducer, { initRun, pushStep, pushToolCall, finalizeToolCall, finalizeStep } from '@/redux/slices/streamSlice';
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
});
