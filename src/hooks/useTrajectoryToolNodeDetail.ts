import { useCallback, useEffect, useRef, useState } from 'react';

import { getTrajectoryToolNodeDetail } from '@/lib/api/trajectory';
import type { TrajectoryNodeDetailResponse } from '@/types/trajectory';

export type TrajectoryToolNodeType = 'tool' | 'llm' | 'message' | 'run' | 'step';

/** 当前选中的轨迹节点；仅 Tool 节点具备可请求的 toolCallId。 */
export interface TrajectoryToolNodeIdentity {
  conversationId: string | null;
  runId: string | null;
  nodeType: TrajectoryToolNodeType | null;
  toolCallId: string | null;
}

export type TrajectoryToolNodeDetailRequestStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface ToolNodeDetailState {
  identity: string | null;
  status: TrajectoryToolNodeDetailRequestStatus;
  response: TrajectoryNodeDetailResponse | null;
  error: string | null;
}

const IDLE_STATE: ToolNodeDetailState = {
  identity: null,
  status: 'idle',
  response: null,
  error: null,
};

const LOADING_STATE: Omit<ToolNodeDetailState, 'identity'> = {
  status: 'loading',
  response: null,
  error: null,
};

const REQUEST_ERROR_MESSAGE = '加载工具详情失败，请稍后重试';

function requestIdentity(
  identity: TrajectoryToolNodeIdentity | null,
  enabled: boolean,
): string | null {
  if (
    !enabled
    || !identity
    || identity.nodeType !== 'tool'
    || !identity.conversationId
    || !identity.runId
    || !identity.toolCallId
  ) {
    return null;
  }
  return JSON.stringify([identity.conversationId, identity.runId, identity.toolCallId]);
}

/**
 * 按需读取当前 Tool 节点详情。identity 变化或卸载时取消旧请求，且仅保留当前 identity 的结果。
 */
export function useTrajectoryToolNodeDetail(
  identity: TrajectoryToolNodeIdentity | null,
  enabled: boolean,
) {
  const conversationId = identity?.conversationId ?? null;
  const runId = identity?.runId ?? null;
  const toolCallId = identity?.toolCallId ?? null;
  const activeIdentity = requestIdentity(identity, enabled);
  const latestIdentity = useRef<string | null>(activeIdentity);
  const [state, setState] = useState<ToolNodeDetailState>(IDLE_STATE);
  const [retryVersion, setRetryVersion] = useState(0);

  latestIdentity.current = activeIdentity;

  useEffect(() => {
    if (
      !activeIdentity
      || !conversationId
      || !runId
      || !toolCallId
    ) {
      setState(IDLE_STATE);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ identity: activeIdentity, ...LOADING_STATE });

    void getTrajectoryToolNodeDetail(
      conversationId,
      runId,
      toolCallId,
      controller.signal,
    ).then(
      response => {
        if (!active || latestIdentity.current !== activeIdentity) return;
        setState({
          identity: activeIdentity,
          status: 'ready',
          response,
          error: null,
        });
      },
      () => {
        if (!active || latestIdentity.current !== activeIdentity) return;
        setState({
          identity: activeIdentity,
          status: 'failed',
          response: null,
          error: REQUEST_ERROR_MESSAGE,
        });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeIdentity, conversationId, retryVersion, runId, toolCallId]);

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
