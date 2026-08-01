import type {
  AgentPlanItem,
  AgentPlanItemKind,
  AgentPlanItemStatus,
  AgentPlanMode,
  AgentPlanSource,
  AgentPlanState,
} from '@/types/agentRun';

export const LEGACY_PLAN_REASON = 'legacy_observed';

interface WireAgentPlanItem {
  id: string;
  title: string;
  phase_id?: string | null;
  phase_title?: string | null;
  status: AgentPlanItemStatus;
  kind: AgentPlanItemKind;
  summary?: string | null;
  tool_names?: string[] | null;
  evidence_item_ids?: string[] | null;
  depends_on?: string[] | null;
  planned_tools?: string[] | null;
}

interface WireAgentPlan {
  plan_id: string;
  revision: number;
  mode?: AgentPlanMode | null;
  source?: AgentPlanSource | null;
  reason?: string | null;
  items: WireAgentPlanItem[];
}

interface AgentPlanMetadataInput {
  mode?: AgentPlanMode | null;
  source?: AgentPlanSource | null;
  reason?: string | null;
}

export function normalizeAgentPlanMetadata(input: AgentPlanMetadataInput): {
  mode: AgentPlanMode;
  source: AgentPlanSource;
  reason: string;
} {
  const isLegacy = input.mode == null && input.source == null && input.reason == null;
  return {
    mode: isAgentPlanMode(input.mode) ? input.mode : 'auto',
    source: input.source === 'model' ? 'model' : 'observed',
    reason: isLegacy ? LEGACY_PLAN_REASON : (input.reason ?? ''),
  };
}

export function mapWireAgentPlanItem(item: WireAgentPlanItem): AgentPlanItem {
  return {
    id: item.id,
    title: item.title,
    phaseId: item.phase_id ?? undefined,
    phaseTitle: item.phase_title ?? undefined,
    status: item.status,
    kind: item.kind,
    summary: item.summary ?? undefined,
    toolNames: item.tool_names ?? [],
    evidenceItemIds: item.evidence_item_ids ?? [],
    dependsOn: item.depends_on ?? [],
    plannedTools: item.planned_tools ?? [],
  };
}

export function mapWireAgentPlan(plan: WireAgentPlan): AgentPlanState {
  return {
    planId: plan.plan_id,
    revision: plan.revision,
    ...normalizeAgentPlanMetadata(plan),
    items: plan.items.map(mapWireAgentPlanItem),
  };
}

export function normalizeAgentPlanState(plan: AgentPlanState): AgentPlanState {
  return {
    ...plan,
    ...normalizeAgentPlanMetadata(plan),
    items: plan.items.map(normalizeAgentPlanItem),
  };
}

export function normalizeAgentPlanItem(item: AgentPlanItem): AgentPlanItem {
  return {
    ...item,
    toolNames: item.toolNames ?? [],
    evidenceItemIds: item.evidenceItemIds ?? [],
    dependsOn: item.dependsOn ?? [],
    plannedTools: item.plannedTools ?? [],
  };
}

function isAgentPlanMode(value: unknown): value is AgentPlanMode {
  return value === 'auto' || value === 'on' || value === 'off';
}
