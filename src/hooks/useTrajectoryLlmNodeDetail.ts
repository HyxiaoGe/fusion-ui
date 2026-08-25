import { useCallback, useEffect, useRef, useState } from 'react';

import { getTrajectoryLlmNodeDetail } from '@/lib/api/trajectory';
import type { TrajectoryNodeDetailResponse } from '@/types/trajectory';

export interface TrajectoryLlmNodeIdentity {
  conversationId: string | null;
  runId: string | null;
  llmRoundId: string | null;
}

export type TrajectoryLlmNodeDetailRequestStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface LlmNodeDetailState {
  identity: string | null;
  status: TrajectoryLlmNodeDetailRequestStatus;
  response: TrajectoryNodeDetailResponse | null;
  error: string | null;
}

const IDLE_STATE: LlmNodeDetailState = {
  identity: null,
  status: 'idle',
  response: null,
  error: null,
};

const LOADING_STATE: Omit<LlmNodeDetailState, 'identity'> = {
  status: 'loading',
  response: null,
  error: null,
};

function requestIdentity(
  identity: TrajectoryLlmNodeIdentity | null,
  enabled: boolean,
): string | null {
  if (!enabled || !identity?.conversationId || !identity.runId || !identity.llmRoundId) return null;
  return JSON.stringify([identity.conversationId, identity.runId, identity.llmRoundId]);
}

/** 按需读取当前 LLM Round 正文；切换节点时取消并隔离旧请求。 */
export function useTrajectoryLlmNodeDetail(
  identity: TrajectoryLlmNodeIdentity | null,
  enabled: boolean,
) {
  const conversationId = identity?.conversationId ?? null;
  const runId = identity?.runId ?? null;
  const llmRoundId = identity?.llmRoundId ?? null;
  const activeIdentity = requestIdentity(identity, enabled);
  const latestIdentity = useRef<string | null>(activeIdentity);
  const [state, setState] = useState<LlmNodeDetailState>(IDLE_STATE);
  const [retryVersion, setRetryVersion] = useState(0);

  latestIdentity.current = activeIdentity;

  useEffect(() => {
    if (!activeIdentity || !conversationId || !runId || !llmRoundId) {
      setState(IDLE_STATE);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ identity: activeIdentity, ...LOADING_STATE });

    void getTrajectoryLlmNodeDetail(
      conversationId,
      runId,
      llmRoundId,
      controller.signal,
    ).then(
      response => {
        if (!active || latestIdentity.current !== activeIdentity) return;
        setState({ identity: activeIdentity, status: 'ready', response, error: null });
      },
      () => {
        if (!active || latestIdentity.current !== activeIdentity) return;
        setState({
          identity: activeIdentity,
          status: 'failed',
          response: null,
          error: '加载模型请求详情失败，请稍后重试',
        });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeIdentity, conversationId, llmRoundId, retryVersion, runId]);

  const retry = useCallback(() => {
    if (!activeIdentity) return;
    setState({ identity: activeIdentity, ...LOADING_STATE });
    setRetryVersion(version => version + 1);
  }, [activeIdentity]);

  const visibleState = state.identity === activeIdentity
    ? state
    : activeIdentity
      ? { identity: activeIdentity, ...LOADING_STATE }
      : IDLE_STATE;

  return {
    status: visibleState.status,
    response: visibleState.response,
    error: visibleState.error,
    retry,
  };
}
