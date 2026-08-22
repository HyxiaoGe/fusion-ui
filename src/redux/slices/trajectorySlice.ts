import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  normalizeTrajectoryRecord,
  type NormalizedTrajectoryEvent,
} from '@/lib/trajectory/normalizeTrajectoryEvent';
import type {
  TrajectoryRunListResponse,
  TrajectoryRunSummary,
  TrajectorySnapshot,
} from '@/types/trajectory';

const MAX_SNAPSHOT_CACHE_SIZE = 8;
const TERMINAL_EVENT_TYPES = new Set([
  'run_completed',
  'run_failed',
  'run_interrupted',
  'run_limit_reached',
]);

export type TrajectoryActiveSurface = 'chat' | 'trajectory';
export type TrajectoryScrollMode = 'follow-live' | 'manual';
export type TrajectoryRunListStatus = 'idle' | 'loading' | 'ready' | 'failed';
export type TrajectoryReconciliationStatus =
  | 'idle'
  | 'loading'
  | 'reconciling'
  | 'ready'
  | 'failed';

export interface TrajectoryEventConflict {
  kind: 'live-live' | 'snapshot-live';
  runId: string;
  sequence: number;
  retainedSource: 'existing-live' | 'snapshot';
  retainedEvent: NormalizedTrajectoryEvent;
  incomingEvent: NormalizedTrajectoryEvent;
}

export interface TrajectoryReconciliationState {
  status: TrajectoryReconciliationStatus;
  error: string | null;
  conflicts: TrajectoryEventConflict[];
}

export interface TrajectorySnapshotCacheEntry {
  run: TrajectorySnapshot['run'];
  spans: TrajectorySnapshot['spans'];
  completeness: TrajectorySnapshot['completeness'];
  truncated: TrajectorySnapshot['truncated'];
  events: NormalizedTrajectoryEvent[];
}

export interface TrajectoryInspectRequest {
  requestId: string;
  messageId: string | null;
  runId: string;
  spanId: string | null;
}

export interface TrajectoryConversationState {
  runs: TrajectoryRunSummary[];
  runListStatus: TrajectoryRunListStatus;
  runListError: string | null;
  runsTruncated: boolean;
  snapshotsByRunId: Record<string, TrajectorySnapshotCacheEntry>;
  liveEventsByRunId: Record<string, NormalizedTrajectoryEvent[]>;
  reconciliationByRunId: Record<string, TrajectoryReconciliationState>;
  snapshotLru: string[];
  selectedMessageId: string | null;
  selectedRunId: string | null;
  selectedSpanId: string | null;
  inspectRequest: TrajectoryInspectRequest | null;
  activeSurface: TrajectoryActiveSurface;
  scrollMode: TrajectoryScrollMode;
  isInspectorOpen: boolean;
}

export interface TrajectoryState {
  byConversationId: Record<string, TrajectoryConversationState>;
}

const initialState: TrajectoryState = { byConversationId: {} };

function createConversationState(): TrajectoryConversationState {
  return {
    runs: [],
    runListStatus: 'idle',
    runListError: null,
    runsTruncated: false,
    snapshotsByRunId: {},
    liveEventsByRunId: {},
    reconciliationByRunId: {},
    snapshotLru: [],
    selectedMessageId: null,
    selectedRunId: null,
    selectedSpanId: null,
    inspectRequest: null,
    activeSurface: 'chat',
    scrollMode: 'follow-live',
    isInspectorOpen: false,
  };
}

function ensureConversation(
  state: TrajectoryState,
  conversationId: string,
): TrajectoryConversationState {
  state.byConversationId[conversationId] ??= createConversationState();
  return state.byConversationId[conversationId];
}

function ensureReconciliation(
  conversation: TrajectoryConversationState,
  runId: string,
): TrajectoryReconciliationState {
  conversation.reconciliationByRunId[runId] ??= {
    status: 'idle',
    error: null,
    conflicts: [],
  };
  return conversation.reconciliationByRunId[runId];
}

function eventsEqual(
  left: NormalizedTrajectoryEvent,
  right: NormalizedTrajectoryEvent,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function recordConflict(
  reconciliation: TrajectoryReconciliationState,
  conflict: TrajectoryEventConflict,
): void {
  const duplicate = reconciliation.conflicts.some(existing => (
    existing.kind === conflict.kind
    && existing.runId === conflict.runId
    && existing.sequence === conflict.sequence
    && eventsEqual(existing.retainedEvent, conflict.retainedEvent)
    && eventsEqual(existing.incomingEvent, conflict.incomingEvent)
  ));
  if (!duplicate) reconciliation.conflicts.push(conflict);
}

function upsertRunSummary(
  conversation: TrajectoryConversationState,
  run: TrajectoryRunSummary,
): void {
  const index = conversation.runs.findIndex(existing => existing.run_id === run.run_id);
  if (index === -1) conversation.runs.push(run);
  else conversation.runs[index] = run;
}

function touchSnapshotLru(
  conversation: TrajectoryConversationState,
  runId: string,
): void {
  conversation.snapshotLru = conversation.snapshotLru.filter(existing => existing !== runId);
  conversation.snapshotLru.push(runId);
  while (conversation.snapshotLru.length > MAX_SNAPSHOT_CACHE_SIZE) {
    const evictedRunId = conversation.snapshotLru.shift();
    if (evictedRunId) delete conversation.snapshotsByRunId[evictedRunId];
  }
}

function normalizedSnapshotEvents(snapshot: TrajectorySnapshot): NormalizedTrajectoryEvent[] {
  return snapshot.records
    .map(record => normalizeTrajectoryRecord(snapshot.run.run_id, record))
    .filter((event): event is NormalizedTrajectoryEvent => event !== null)
    .sort((left, right) => left.sequence - right.sequence);
}

function provisionalRun(event: NormalizedTrajectoryEvent): TrajectoryRunSummary {
  const messageId = typeof event.payload.message_id === 'string'
    ? event.payload.message_id
    : null;
  return {
    run_id: event.runId,
    message_id: messageId,
    turn_message_id: null,
    attempt_index: null,
    status: 'running',
    trajectory_status: 'recording',
    total_steps: 0,
    total_tool_calls: 0,
    duration_ms: null,
    started_at: event.timestamp,
    ended_at: null,
  };
}

const trajectorySlice = createSlice({
  name: 'trajectory',
  initialState,
  reducers: {
    trajectoryRunListRequested(state, action: PayloadAction<{ conversationId: string }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      conversation.runListStatus = 'loading';
      conversation.runListError = null;
    },
    trajectoryRunListReceived(state, action: PayloadAction<{
      conversationId: string;
      response: TrajectoryRunListResponse;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const durableRunIds = new Set(action.payload.response.items.map(run => run.run_id));
      conversation.runs = [
        ...action.payload.response.items,
        ...conversation.runs.filter(run => !durableRunIds.has(run.run_id)),
      ];
      conversation.runListStatus = 'ready';
      conversation.runListError = null;
      conversation.runsTruncated = action.payload.response.truncated;
    },
    trajectoryRunListFailed(state, action: PayloadAction<{
      conversationId: string;
      error: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      conversation.runListStatus = 'failed';
      conversation.runListError = action.payload.error;
    },
    trajectorySnapshotRequested(state, action: PayloadAction<{
      conversationId: string;
      runId: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const reconciliation = ensureReconciliation(conversation, action.payload.runId);
      if (reconciliation.status !== 'reconciling') reconciliation.status = 'loading';
      reconciliation.error = null;
    },
    trajectorySnapshotReceived(state, action: PayloadAction<{
      conversationId: string;
      snapshot: TrajectorySnapshot;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const { snapshot } = action.payload;
      const runId = snapshot.run.run_id;
      const events = normalizedSnapshotEvents(snapshot);
      const reconciliation = ensureReconciliation(conversation, runId);
      const liveEvents = conversation.liveEventsByRunId[runId] ?? [];
      const snapshotBySequence = new Map(events.map(event => [event.sequence, event]));
      const maximumDurableSequence = events.at(-1)?.sequence ?? -1;

      for (const liveEvent of liveEvents) {
        const durableEvent = snapshotBySequence.get(liveEvent.sequence);
        if (durableEvent && !eventsEqual(durableEvent, liveEvent)) {
          recordConflict(reconciliation, {
            kind: 'snapshot-live',
            runId,
            sequence: liveEvent.sequence,
            retainedSource: 'snapshot',
            retainedEvent: durableEvent,
            incomingEvent: liveEvent,
          });
        }
      }

      conversation.liveEventsByRunId[runId] = liveEvents
        .filter(event => event.sequence > maximumDurableSequence);
      conversation.snapshotsByRunId[runId] = {
        run: snapshot.run,
        spans: snapshot.spans,
        completeness: snapshot.completeness,
        truncated: snapshot.truncated,
        events,
      };
      upsertRunSummary(conversation, snapshot.run);
      touchSnapshotLru(conversation, runId);
      reconciliation.status = 'ready';
      reconciliation.error = null;
    },
    trajectorySnapshotFailed(state, action: PayloadAction<{
      conversationId: string;
      runId: string;
      error: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const reconciliation = ensureReconciliation(conversation, action.payload.runId);
      reconciliation.status = 'failed';
      reconciliation.error = action.payload.error;
    },
    touchTrajectorySnapshot(state, action: PayloadAction<{
      conversationId: string;
      runId: string;
    }>) {
      const conversation = state.byConversationId[action.payload.conversationId];
      if (conversation?.snapshotsByRunId[action.payload.runId]) {
        touchSnapshotLru(conversation, action.payload.runId);
      }
    },
    mergeLiveTrajectoryEvent(state, action: PayloadAction<{
      conversationId: string;
      event: NormalizedTrajectoryEvent;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const { event } = action.payload;
      const reconciliation = ensureReconciliation(conversation, event.runId);
      const durableEvent = conversation.snapshotsByRunId[event.runId]?.events
        .find(existing => existing.sequence === event.sequence);
      let retainedEvent = event;

      if (durableEvent) {
        retainedEvent = durableEvent;
        if (!eventsEqual(durableEvent, event)) {
          recordConflict(reconciliation, {
            kind: 'snapshot-live',
            runId: event.runId,
            sequence: event.sequence,
            retainedSource: 'snapshot',
            retainedEvent: durableEvent,
            incomingEvent: event,
          });
        }
      } else {
        const liveEvents = conversation.liveEventsByRunId[event.runId] ?? [];
        const existing = liveEvents.find(candidate => candidate.sequence === event.sequence);
        if (!existing) {
          liveEvents.push(event);
          liveEvents.sort((left, right) => left.sequence - right.sequence);
          conversation.liveEventsByRunId[event.runId] = liveEvents;
        } else {
          retainedEvent = existing;
          if (!eventsEqual(existing, event)) {
            recordConflict(reconciliation, {
              kind: 'live-live',
              runId: event.runId,
              sequence: event.sequence,
              retainedSource: 'existing-live',
              retainedEvent: existing,
              incomingEvent: event,
            });
          }
        }
      }

      if (retainedEvent.eventType === 'run_started') {
        if (!conversation.runs.some(run => run.run_id === retainedEvent.runId)) {
          conversation.runs.push(provisionalRun(retainedEvent));
        }
        conversation.selectedMessageId = typeof retainedEvent.payload.message_id === 'string'
          ? retainedEvent.payload.message_id
          : null;
        conversation.selectedRunId = retainedEvent.runId;
        conversation.selectedSpanId = null;
      }
      if (TERMINAL_EVENT_TYPES.has(retainedEvent.eventType)) {
        reconciliation.status = 'reconciling';
        reconciliation.error = null;
      }
    },
    markTrajectoryRunReconciliation(state, action: PayloadAction<{
      conversationId: string;
      runId: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const reconciliation = ensureReconciliation(conversation, action.payload.runId);
      reconciliation.status = 'reconciling';
      reconciliation.error = null;
    },
    setTrajectoryActiveSurface(state, action: PayloadAction<{
      conversationId: string;
      surface: TrajectoryActiveSurface;
    }>) {
      ensureConversation(state, action.payload.conversationId).activeSurface = action.payload.surface;
    },
    selectTrajectoryTarget(state, action: PayloadAction<{
      conversationId: string;
      messageId: string | null;
      runId: string | null;
      spanId: string | null;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      conversation.selectedMessageId = action.payload.messageId;
      conversation.selectedRunId = action.payload.runId;
      conversation.selectedSpanId = action.payload.spanId;
    },
    requestTrajectoryInspect(state, action: PayloadAction<{
      conversationId: string;
      requestId: string;
      messageId: string | null;
      runId: string;
      spanId: string | null;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      conversation.inspectRequest = {
        requestId: action.payload.requestId,
        messageId: action.payload.messageId,
        runId: action.payload.runId,
        spanId: action.payload.spanId,
      };
      conversation.selectedMessageId = action.payload.messageId;
      conversation.selectedRunId = action.payload.runId;
      conversation.selectedSpanId = action.payload.spanId;
      conversation.activeSurface = 'trajectory';
      conversation.isInspectorOpen = true;
    },
    consumeTrajectoryInspectRequest(state, action: PayloadAction<{
      conversationId: string;
      requestId: string;
    }>) {
      const conversation = state.byConversationId[action.payload.conversationId];
      if (conversation?.inspectRequest?.requestId === action.payload.requestId) {
        conversation.inspectRequest = null;
      }
    },
    setTrajectoryScrollMode(state, action: PayloadAction<{
      conversationId: string;
      mode: TrajectoryScrollMode;
    }>) {
      ensureConversation(state, action.payload.conversationId).scrollMode = action.payload.mode;
    },
    setTrajectoryInspectorOpen(state, action: PayloadAction<{
      conversationId: string;
      isOpen: boolean;
    }>) {
      ensureConversation(state, action.payload.conversationId).isInspectorOpen = action.payload.isOpen;
    },
  },
});

type TrajectoryRootState = { trajectory: TrajectoryState };

export function selectTrajectoryConversation(
  state: TrajectoryRootState,
  conversationId: string,
): TrajectoryConversationState | undefined {
  return state.trajectory.byConversationId[conversationId];
}

export function selectTrajectoryRuns(
  state: TrajectoryRootState,
  conversationId: string,
): TrajectoryRunSummary[] {
  return selectTrajectoryConversation(state, conversationId)?.runs ?? [];
}

export function selectTrajectoryRunListRequest(
  state: TrajectoryRootState,
  conversationId: string,
): Pick<TrajectoryConversationState, 'runListStatus' | 'runListError' | 'runsTruncated'> | undefined {
  const conversation = selectTrajectoryConversation(state, conversationId);
  if (!conversation) return undefined;
  return {
    runListStatus: conversation.runListStatus,
    runListError: conversation.runListError,
    runsTruncated: conversation.runsTruncated,
  };
}

export function selectTrajectorySnapshot(
  state: TrajectoryRootState,
  conversationId: string,
  runId: string,
): TrajectorySnapshotCacheEntry | undefined {
  return selectTrajectoryConversation(state, conversationId)?.snapshotsByRunId[runId];
}

export function selectTrajectoryReconciliation(
  state: TrajectoryRootState,
  conversationId: string,
  runId: string,
): TrajectoryReconciliationState | undefined {
  return selectTrajectoryConversation(state, conversationId)?.reconciliationByRunId[runId];
}

export function selectTrajectorySelection(
  state: TrajectoryRootState,
  conversationId: string,
): Pick<
  TrajectoryConversationState,
  'selectedMessageId' | 'selectedRunId' | 'selectedSpanId'
> | undefined {
  const conversation = selectTrajectoryConversation(state, conversationId);
  if (!conversation) return undefined;
  return {
    selectedMessageId: conversation.selectedMessageId,
    selectedRunId: conversation.selectedRunId,
    selectedSpanId: conversation.selectedSpanId,
  };
}

export function selectTrajectoryViewState(
  state: TrajectoryRootState,
  conversationId: string,
): Pick<
  TrajectoryConversationState,
  'activeSurface' | 'scrollMode' | 'isInspectorOpen' | 'inspectRequest'
> | undefined {
  const conversation = selectTrajectoryConversation(state, conversationId);
  if (!conversation) return undefined;
  return {
    activeSurface: conversation.activeSurface,
    scrollMode: conversation.scrollMode,
    isInspectorOpen: conversation.isInspectorOpen,
    inspectRequest: conversation.inspectRequest,
  };
}

export function selectMergedTrajectoryEvents(
  state: TrajectoryRootState,
  conversationId: string,
  runId: string,
): NormalizedTrajectoryEvent[] {
  const conversation = selectTrajectoryConversation(state, conversationId);
  const durableEvents = conversation?.snapshotsByRunId[runId]?.events ?? [];
  const liveEvents = conversation?.liveEventsByRunId[runId] ?? [];
  return [...durableEvents, ...liveEvents].sort((left, right) => left.sequence - right.sequence);
}

export const {
  consumeTrajectoryInspectRequest,
  markTrajectoryRunReconciliation,
  mergeLiveTrajectoryEvent,
  requestTrajectoryInspect,
  selectTrajectoryTarget,
  setTrajectoryActiveSurface,
  setTrajectoryInspectorOpen,
  setTrajectoryScrollMode,
  touchTrajectorySnapshot,
  trajectoryRunListFailed,
  trajectoryRunListReceived,
  trajectoryRunListRequested,
  trajectorySnapshotFailed,
  trajectorySnapshotReceived,
  trajectorySnapshotRequested,
} = trajectorySlice.actions;

export default trajectorySlice.reducer;
