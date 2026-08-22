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
const MAX_RUN_LIST_SIZE = 500;
const MAX_EVENTS_PER_RUN = 5000;
const TERMINAL_EVENT_TYPES = new Set([
  'run_completed',
  'run_failed',
  'run_interrupted',
  'run_limit_reached',
]);

export type TrajectoryActiveSurface = 'chat' | 'trajectory';
export type TrajectoryScrollMode = 'follow-live' | 'manual';
export type TrajectoryRunListStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'failed';
export type TrajectorySelectionSource = 'none' | 'auto-live' | 'auto-snapshot' | 'manual' | 'inspect';
export type TrajectoryReconciliationStatus =
  | 'idle'
  | 'loading'
  | 'reconciling'
  | 'ready'
  | 'unavailable'
  | 'failed';
export type TrajectorySnapshotRequestPurpose = 'hydrate' | 'reconcile';

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
  activeRequestId: string | null;
  activeRequestPurpose: TrajectorySnapshotRequestPurpose | null;
  durableLastSequence: number | null;
  liveTruncatedThroughSequence: number | null;
  eventsTruncated: boolean;
  conflicts: TrajectoryEventConflict[];
}

export interface TrajectorySnapshotCacheEntry {
  run: TrajectorySnapshot['run'];
  spans: TrajectorySnapshot['spans'];
  completeness: TrajectorySnapshot['completeness'];
  truncated: TrajectorySnapshot['truncated'];
  durableLastSequence: number | null;
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
  runSummariesById: Record<string, TrajectoryRunSummary>;
  provisionalRunIds: string[];
  runListStatus: TrajectoryRunListStatus;
  runListError: string | null;
  activeRunListRequestId: string | null;
  runsTruncated: boolean;
  snapshotsByRunId: Record<string, TrajectorySnapshotCacheEntry>;
  liveEventsByRunId: Record<string, NormalizedTrajectoryEvent[]>;
  reconciliationByRunId: Record<string, TrajectoryReconciliationState>;
  snapshotLru: string[];
  selectedMessageId: string | null;
  selectedRunId: string | null;
  selectedSpanId: string | null;
  selectionSource: TrajectorySelectionSource;
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
    runSummariesById: {},
    provisionalRunIds: [],
    runListStatus: 'idle',
    runListError: null,
    activeRunListRequestId: null,
    runsTruncated: false,
    snapshotsByRunId: {},
    liveEventsByRunId: {},
    reconciliationByRunId: {},
    snapshotLru: [],
    selectedMessageId: null,
    selectedRunId: null,
    selectedSpanId: null,
    selectionSource: 'none',
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
    activeRequestId: null,
    activeRequestPurpose: null,
    durableLastSequence: null,
    liveTruncatedThroughSequence: null,
    eventsTruncated: false,
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

function eventInsertionIndex(
  events: readonly NormalizedTrajectoryEvent[],
  sequence: number,
): number {
  let lower = 0;
  let upper = events.length;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (events[middle].sequence < sequence) lower = middle + 1;
    else upper = middle;
  }
  return lower;
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
  conversation.runSummariesById[run.run_id] = run;
  const serverWindowIndex = conversation.runs.findIndex(existing => existing.run_id === run.run_id);
  if (serverWindowIndex !== -1) conversation.runs[serverWindowIndex] = run;
}

function newestRunAttempt(
  runs: readonly TrajectoryRunSummary[],
): TrajectoryRunSummary | undefined {
  return runs.reduce<TrajectoryRunSummary | undefined>((newest, candidate) => {
    if (!newest) return candidate;
    const startedAtOrder = candidate.started_at.localeCompare(newest.started_at);
    if (startedAtOrder !== 0) return startedAtOrder > 0 ? candidate : newest;
    return (candidate.attempt_index ?? -1) > (newest.attempt_index ?? -1)
      ? candidate
      : newest;
  }, undefined);
}

function touchSnapshotLru(
  conversation: TrajectoryConversationState,
  runId: string,
): void {
  conversation.snapshotLru = conversation.snapshotLru.filter(existing => existing !== runId);
  conversation.snapshotLru.push(runId);
  while (conversation.snapshotLru.length > MAX_SNAPSHOT_CACHE_SIZE) {
    const evictedRunId = conversation.snapshotLru.shift();
    if (evictedRunId) {
      delete conversation.snapshotsByRunId[evictedRunId];
      const reconciliation = conversation.reconciliationByRunId[evictedRunId];
      if (reconciliation && reconciliation.durableLastSequence !== null) {
        reconciliation.eventsTruncated = true;
      }
    }
  }
}

function normalizedSnapshotEvents(snapshot: TrajectorySnapshot): NormalizedTrajectoryEvent[] {
  return snapshot.records
    .map(record => normalizeTrajectoryRecord(snapshot.run.run_id, record))
    .filter((event): event is NormalizedTrajectoryEvent => event !== null)
    .sort((left, right) => left.sequence - right.sequence);
}

function trimLiveEvents(
  conversation: TrajectoryConversationState,
  runId: string,
): void {
  const liveEvents = conversation.liveEventsByRunId[runId] ?? [];
  if (liveEvents.length <= MAX_EVENTS_PER_RUN) return;
  const removed = liveEvents.splice(0, liveEvents.length - MAX_EVENTS_PER_RUN);
  const reconciliation = ensureReconciliation(conversation, runId);
  const removedThrough = removed.at(-1)?.sequence ?? null;
  if (removedThrough !== null) {
    reconciliation.liveTruncatedThroughSequence = Math.max(
      reconciliation.liveTruncatedThroughSequence ?? -1,
      removedThrough,
    );
  }
  reconciliation.eventsTruncated = true;
}

function trimMergedEventWindow(
  conversation: TrajectoryConversationState,
  runId: string,
): void {
  const snapshot = conversation.snapshotsByRunId[runId];
  if (!snapshot) return;
  const liveCount = conversation.liveEventsByRunId[runId]?.length ?? 0;
  const overflow = snapshot.events.length + liveCount - MAX_EVENTS_PER_RUN;
  if (overflow <= 0) return;
  snapshot.events.splice(0, Math.min(overflow, snapshot.events.length));
  snapshot.truncated = true;
  ensureReconciliation(conversation, runId).eventsTruncated = true;
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
    trajectoryRunListRequested(state, action: PayloadAction<{
      conversationId: string;
      requestId: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      conversation.runListStatus = 'loading';
      conversation.runListError = null;
      conversation.activeRunListRequestId = action.payload.requestId;
    },
    trajectoryRunListReceived(state, action: PayloadAction<{
      conversationId: string;
      requestId: string;
      response: TrajectoryRunListResponse;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      if (conversation.activeRunListRequestId !== action.payload.requestId) return;
      conversation.runs = action.payload.response.items.slice(0, MAX_RUN_LIST_SIZE);
      for (const run of conversation.runs) upsertRunSummary(conversation, run);
      const durableRunIds = new Set(conversation.runs.map(run => run.run_id));
      conversation.provisionalRunIds = conversation.provisionalRunIds
        .filter(runId => !durableRunIds.has(runId));
      conversation.runListStatus = 'ready';
      conversation.runListError = null;
      conversation.activeRunListRequestId = null;
      conversation.runsTruncated = action.payload.response.truncated
        || action.payload.response.items.length > MAX_RUN_LIST_SIZE;
      if (conversation.selectedRunId === null) {
        const defaultRun = newestRunAttempt(conversation.runs);
        if (defaultRun) {
          conversation.selectedMessageId = defaultRun.message_id;
          conversation.selectedRunId = defaultRun.run_id;
          conversation.selectedSpanId = null;
          conversation.selectionSource = 'auto-snapshot';
        }
      }
    },
    trajectoryRunListFailed(state, action: PayloadAction<{
      conversationId: string;
      requestId: string;
      error: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      if (conversation.activeRunListRequestId !== action.payload.requestId) return;
      conversation.runListStatus = 'failed';
      conversation.runListError = action.payload.error;
      conversation.activeRunListRequestId = null;
    },
    trajectoryRunListCancelled(state, action: PayloadAction<{
      conversationId: string;
      requestId: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      if (conversation.activeRunListRequestId !== action.payload.requestId) return;
      conversation.runListStatus = 'idle';
      conversation.runListError = null;
      conversation.activeRunListRequestId = null;
    },
    trajectoryRunListUnavailable(state, action: PayloadAction<{
      conversationId: string;
      requestId: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      if (conversation.activeRunListRequestId !== action.payload.requestId) return;
      state.byConversationId[action.payload.conversationId] = {
        ...createConversationState(),
        runListStatus: 'unavailable',
      };
    },
    trajectorySnapshotRequested(state, action: PayloadAction<{
      conversationId: string;
      runId: string;
      requestId: string;
      purpose?: TrajectorySnapshotRequestPurpose;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const reconciliation = ensureReconciliation(conversation, action.payload.runId);
      const purpose = action.payload.purpose
        ?? (reconciliation.status === 'reconciling' ? 'reconcile' : 'hydrate');
      if (purpose !== 'reconcile') reconciliation.status = 'loading';
      reconciliation.error = null;
      reconciliation.activeRequestId = action.payload.requestId;
      reconciliation.activeRequestPurpose = purpose;
    },
    trajectorySnapshotReceived(state, action: PayloadAction<{
      conversationId: string;
      requestId: string;
      snapshot: TrajectorySnapshot;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const { snapshot } = action.payload;
      const runId = snapshot.run.run_id;
      const reconciliation = ensureReconciliation(conversation, runId);
      if (reconciliation.activeRequestId !== action.payload.requestId) return;
      const requestPurpose = reconciliation.activeRequestPurpose;
      const terminalArrivedDuringHydration = requestPurpose === 'hydrate'
        && reconciliation.status === 'reconciling';
      const allEvents = normalizedSnapshotEvents(snapshot);
      const durableLastSequence = allEvents.at(-1)?.sequence ?? null;
      const events = allEvents.slice(-MAX_EVENTS_PER_RUN);
      const liveEvents = conversation.liveEventsByRunId[runId] ?? [];
      const snapshotBySequence = new Map(allEvents.map(event => [event.sequence, event]));
      const maximumDurableSequence = durableLastSequence ?? -1;

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
        truncated: snapshot.truncated || allEvents.length > MAX_EVENTS_PER_RUN,
        durableLastSequence,
        events,
      };
      upsertRunSummary(conversation, snapshot.run);
      conversation.provisionalRunIds = conversation.provisionalRunIds
        .filter(existingRunId => existingRunId !== runId);
      const durableRunStarted = allEvents.find(event => event.eventType === 'run_started');
      if (conversation.selectedRunId === runId
        && conversation.selectionSource === 'auto-live'
        && durableRunStarted) {
        conversation.selectedMessageId = typeof durableRunStarted.payload.message_id === 'string'
          ? durableRunStarted.payload.message_id
          : snapshot.run.message_id;
        conversation.selectionSource = 'auto-snapshot';
      }
      touchSnapshotLru(conversation, runId);
      reconciliation.activeRequestId = null;
      reconciliation.activeRequestPurpose = null;
      reconciliation.durableLastSequence = durableLastSequence;
      reconciliation.liveTruncatedThroughSequence = null;
      reconciliation.eventsTruncated = snapshot.truncated || allEvents.length > MAX_EVENTS_PER_RUN;
      trimMergedEventWindow(conversation, runId);
      reconciliation.status = terminalArrivedDuringHydration ? 'reconciling' : 'ready';
      reconciliation.error = null;
    },
    trajectorySnapshotFailed(state, action: PayloadAction<{
      conversationId: string;
      runId: string;
      requestId: string;
      error: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const reconciliation = ensureReconciliation(conversation, action.payload.runId);
      if (reconciliation.activeRequestId !== action.payload.requestId) return;
      reconciliation.status = 'failed';
      reconciliation.error = action.payload.error;
      reconciliation.activeRequestId = null;
      reconciliation.activeRequestPurpose = null;
    },
    trajectorySnapshotUnavailable(state, action: PayloadAction<{
      conversationId: string;
      runId: string;
      requestId: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const reconciliation = ensureReconciliation(conversation, action.payload.runId);
      if (reconciliation.activeRequestId !== action.payload.requestId) return;
      delete conversation.snapshotsByRunId[action.payload.runId];
      conversation.snapshotLru = conversation.snapshotLru
        .filter(runId => runId !== action.payload.runId);
      reconciliation.status = 'unavailable';
      reconciliation.error = null;
      reconciliation.activeRequestId = null;
      reconciliation.activeRequestPurpose = null;
    },
    trajectorySnapshotCancelled(state, action: PayloadAction<{
      conversationId: string;
      runId: string;
      requestId: string;
    }>) {
      const conversation = ensureConversation(state, action.payload.conversationId);
      const reconciliation = ensureReconciliation(conversation, action.payload.runId);
      if (reconciliation.activeRequestId !== action.payload.requestId) return;
      const wasReconciling = reconciliation.status === 'reconciling'
        || reconciliation.activeRequestPurpose === 'reconcile';
      reconciliation.status = wasReconciling
        ? 'reconciling'
        : (conversation.snapshotsByRunId[action.payload.runId] ? 'ready' : 'idle');
      reconciliation.error = null;
      reconciliation.activeRequestId = null;
      reconciliation.activeRequestPurpose = null;
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
      const isCoveredByDurable = reconciliation.durableLastSequence !== null
        && event.sequence <= reconciliation.durableLastSequence;
      const isCoveredByTrimmedLive = reconciliation.liveTruncatedThroughSequence !== null
        && event.sequence <= reconciliation.liveTruncatedThroughSequence;
      let acceptedLive = false;

      if (isCoveredByDurable) {
        if (durableEvent && !eventsEqual(durableEvent, event)) {
          recordConflict(reconciliation, {
            kind: 'snapshot-live',
            runId: event.runId,
            sequence: event.sequence,
            retainedSource: 'snapshot',
            retainedEvent: durableEvent,
            incomingEvent: event,
          });
        }
      } else if (!isCoveredByTrimmedLive) {
        const liveEvents = conversation.liveEventsByRunId[event.runId] ?? [];
        const insertionIndex = eventInsertionIndex(liveEvents, event.sequence);
        const existing = liveEvents[insertionIndex]?.sequence === event.sequence
          ? liveEvents[insertionIndex]
          : undefined;
        if (!existing) {
          if (insertionIndex === liveEvents.length) liveEvents.push(event);
          else liveEvents.splice(insertionIndex, 0, event);
          conversation.liveEventsByRunId[event.runId] = liveEvents;
          trimLiveEvents(conversation, event.runId);
          trimMergedEventWindow(conversation, event.runId);
          acceptedLive = true;
        } else {
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

      if (acceptedLive && event.eventType === 'run_started') {
        if (!conversation.runSummariesById[event.runId]) {
          upsertRunSummary(conversation, provisionalRun(event));
          conversation.provisionalRunIds.push(event.runId);
        }
        conversation.selectedMessageId = typeof event.payload.message_id === 'string'
          ? event.payload.message_id
          : null;
        conversation.selectedRunId = event.runId;
        conversation.selectedSpanId = null;
        conversation.selectionSource = 'auto-live';
      }
      if (acceptedLive && TERMINAL_EVENT_TYPES.has(event.eventType)) {
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
      conversation.selectionSource = 'manual';
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
      conversation.selectionSource = 'inspect';
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
  const conversation = selectTrajectoryConversation(state, conversationId);
  if (!conversation) return [];
  const extraRunIds = [
    conversation.selectedRunId,
    ...conversation.provisionalRunIds,
  ].filter((runId): runId is string => (
    runId !== null && !conversation.runs.some(run => run.run_id === runId)
  ));
  const uniqueExtraRunIds = [...new Set(extraRunIds)];
  return [
    ...uniqueExtraRunIds
      .map(runId => conversation.runSummariesById[runId])
      .filter((run): run is TrajectoryRunSummary => run !== undefined),
    ...conversation.runs,
  ].slice(0, MAX_RUN_LIST_SIZE);
}

export function selectTrajectoryRunSummary(
  state: TrajectoryRootState,
  conversationId: string,
  runId: string,
): TrajectoryRunSummary | undefined {
  return selectTrajectoryConversation(state, conversationId)?.runSummariesById[runId];
}

export function selectTrajectoryRunListRequest(
  state: TrajectoryRootState,
  conversationId: string,
): Pick<
  TrajectoryConversationState,
  'runListStatus' | 'runListError' | 'runsTruncated' | 'activeRunListRequestId'
> | undefined {
  const conversation = selectTrajectoryConversation(state, conversationId);
  if (!conversation) return undefined;
  return {
    runListStatus: conversation.runListStatus,
    runListError: conversation.runListError,
    runsTruncated: conversation.runsTruncated,
    activeRunListRequestId: conversation.activeRunListRequestId,
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
  'selectedMessageId' | 'selectedRunId' | 'selectedSpanId' | 'selectionSource'
> | undefined {
  const conversation = selectTrajectoryConversation(state, conversationId);
  if (!conversation) return undefined;
  return {
    selectedMessageId: conversation.selectedMessageId,
    selectedRunId: conversation.selectedRunId,
    selectedSpanId: conversation.selectedSpanId,
    selectionSource: conversation.selectionSource,
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
  return [...durableEvents, ...liveEvents]
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-MAX_EVENTS_PER_RUN);
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
  trajectoryRunListCancelled,
  trajectoryRunListFailed,
  trajectoryRunListReceived,
  trajectoryRunListRequested,
  trajectoryRunListUnavailable,
  trajectorySnapshotCancelled,
  trajectorySnapshotFailed,
  trajectorySnapshotReceived,
  trajectorySnapshotRequested,
  trajectorySnapshotUnavailable,
} = trajectorySlice.actions;

export default trajectorySlice.reducer;
