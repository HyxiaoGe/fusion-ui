import { useCallback, useEffect, useRef, useState } from 'react';

import { getTrajectorySkillsNodeDetail } from '@/lib/api/trajectory';
import i18n from '@/lib/i18n';
import type { TrajectoryNodeDetailResponse } from '@/types/trajectory';

interface SkillsNodeIdentity {
  conversationId: string | null;
  runId: string | null;
}

interface SkillsNodeDetailState {
  identity: string | null;
  status: 'idle' | 'loading' | 'ready' | 'failed';
  response: TrajectoryNodeDetailResponse | null;
  error: string | null;
}

const IDLE_STATE: SkillsNodeDetailState = {
  identity: null,
  status: 'idle',
  response: null,
  error: null,
};

const LOADING_STATE: Omit<SkillsNodeDetailState, 'identity'> = {
  status: 'loading',
  response: null,
  error: null,
};

/** Skills 正文只存在当前节点组件；身份变化时清空、取消并隔离迟到响应。 */
export function useTrajectorySkillsNodeDetail(
  identity: SkillsNodeIdentity | null,
  enabled: boolean,
) {
  const conversationId = identity?.conversationId ?? null;
  const runId = identity?.runId ?? null;
  const activeIdentity = enabled && conversationId && runId
    ? JSON.stringify([conversationId, runId])
    : null;
  const latestIdentity = useRef<string | null>(activeIdentity);
  const [state, setState] = useState<SkillsNodeDetailState>(IDLE_STATE);
  const [retryVersion, setRetryVersion] = useState(0);

  latestIdentity.current = activeIdentity;

  useEffect(() => {
    if (!activeIdentity || !conversationId || !runId) {
      setState(IDLE_STATE);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ identity: activeIdentity, ...LOADING_STATE });

    void getTrajectorySkillsNodeDetail(conversationId, runId, controller.signal).then(
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
          error: i18n.t('trajectory.skills.loadFailed'),
        });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeIdentity, conversationId, retryVersion, runId]);

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
