import type { AgentRunState } from './agentRun';

// ============================================================
// Content Blocks（对齐后端 schema）
// ============================================================

export interface TextBlock {
  type: 'text';
  id: string;
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  id: string;
  thinking: string;
}

export interface FileBlock {
  type: 'file';
  id: string;
  file_id: string;
  filename: string;
  mime_type: string;
  thumbnail_url?: string;  // 缩略图 presigned URL
  width?: number;          // 图片宽度
  height?: number;         // 图片高度
}

export interface SearchSource {
  title: string;
  url: string;
  description: string;
  content?: string;
  favicon?: string;
  requested_provider?: string | null;
  result_provider?: string | null;
  fallback_used?: boolean;
  provider_chain?: string[];
}

// 轻量版搜索来源，用于 SearchBlock 存储和 UI 展示
export interface SearchSourceSummary {
  title: string;
  url: string;
  favicon?: string;
  evidence_id?: string;
  citation_index?: number;
  kind?: 'web' | 'knowledge';
}

export type NetworkSourceStatus = 'success' | 'failed' | 'degraded' | 'interrupted';

export interface SourceReference {
  kind: 'search' | 'url_read';
  title: string;
  url: string;
  evidence_id?: string;
  citation_index?: number;
  domain?: string;
  favicon?: string;
  status?: NetworkSourceStatus;
  tool_call_log_id?: string;
  error_message?: string | null;
}

export interface SearchBlock {
  type: 'search';
  id: string;
  query: string;
  tool_call_log_id?: string;
  sources: SearchSourceSummary[];
  status?: NetworkSourceStatus;
  error_message?: string | null;
  source_count?: number;
  source_refs?: SourceReference[];
  requested_provider?: string | null;
  result_provider?: string | null;
  fallback_used?: boolean;
  provider_chain?: string[];
  requested_count?: number | null;
  actual_count?: number | null;
  context_source_count?: number | null;
  context_source_limit?: number | null;
  search_budget?: string | null;
  intent?: 'quick_fact' | 'freshness' | 'comparison' | 'deep_research' | 'official_source' | string | null;
  domains?: string[];
  recency_days?: number | null;
  budget_limited?: boolean;
}

export interface UrlBlock {
  type: 'url_read';
  id: string;
  url: string;
  title?: string;
  favicon?: string;
  tool_call_log_id?: string;
  status?: NetworkSourceStatus;
  error_message?: string | null;
  source_count?: number;
  source_refs?: SourceReference[];
  reason?: string | null;
}

export type KnowledgeEvidenceStatus = 'success' | 'empty';
export type KnowledgeSourceStatus = 'success' | 'unavailable';

export interface KnowledgeSourceReference {
  kind: 'knowledge';
  evidence_id?: string;
  citation_index?: number;
  knowledge_base_id: string;
  knowledge_base_name: string;
  document_id: string;
  index_version: string;
  chunk_id: string;
  ordinal: number;
  filename: string;
  page: number | null;
  section: string | null;
  char_start: number;
  char_end: number;
  status?: KnowledgeSourceStatus;
}

export interface KnowledgeEvidenceBlock {
  type: 'knowledge_evidence';
  id: string;
  schema_version: 1;
  query: string;
  status: KnowledgeEvidenceStatus;
  source_count: number;
  knowledge_base_ids: string[];
  source_refs: KnowledgeSourceReference[];
}

export interface ProviderPlacePhoto {
  url?: string;
  title?: string | null;
}

export interface StructuredResultAttribution {
  label: string;
}

export interface StructuredResultAction {
  kind: 'open_external';
  label: string;
  url: string;
}

export interface ProviderPlaceResult {
  provider_place_id?: string | null;
  name?: string | null;
  address?: string | null;
  district?: string | null;
  business_area?: string | null;
  category?: string | null;
  distance_m?: number | null;
  photos?: ProviderPlacePhoto[] | null;
  rating?: number | null;
  reference_cost_yuan?: number | null;
  open_hours?: string | null;
  detail_status?: 'enriched' | 'unavailable' | 'budget_limited' | 'not_requested' | null;
  actions?: StructuredResultAction[] | null;
  /** 兼容早期地点结果；运行时会转换为 actions。 */
  platform_url?: string | null;
}

export interface PlaceResultsBlock {
  type: 'place_results';
  id: string;
  schema_version: 1;
  provider?: string | null;
  attribution?: StructuredResultAttribution | null;
  query?: string | null;
  near?: string | null;
  status?: 'success' | 'degraded' | null;
  result_count?: number | null;
  places?: ProviderPlaceResult[] | null;
  limitations?: string[] | null;
  tool_call_log_id?: string | null;
}

export interface ProviderRouteEndpoint {
  label?: string | null;
  city?: string | null;
}

export type ProviderTransitType = 'subway' | 'bus' | 'mixed' | 'public_transit';

export type ProviderTransitLegKind = 'walking' | 'subway' | 'bus' | 'other';

export interface ProviderTransitLeg {
  kind?: ProviderTransitLegKind | null;
  line_name?: string | null;
  departure_stop?: string | null;
  arrival_stop?: string | null;
  via_stop_count?: number | null;
  distance_m?: number | null;
  duration_s?: number | null;
  entrance?: string | null;
  exit?: string | null;
}

export interface ProviderTransitAlternative {
  transit_type?: ProviderTransitType | null;
  distance_m?: number | null;
  duration_s?: number | null;
  walking_distance_m?: number | null;
  transfers?: number | null;
  summary?: string | null;
  legs?: ProviderTransitLeg[] | null;
}

export interface ProviderRouteResult {
  mode?: string | null;
  transit_type?: ProviderTransitType | null;
  distance_m?: number | null;
  duration_s?: number | null;
  walking_distance_m?: number | null;
  summary?: string | null;
  toll_yuan?: number | null;
  transfers?: number | null;
  legs?: ProviderTransitLeg[] | null;
  alternatives?: ProviderTransitAlternative[] | null;
}

export interface RouteResultsBlock {
  type: 'route_results';
  id: string;
  schema_version: 1;
  provider?: string | null;
  attribution?: StructuredResultAttribution | null;
  origin?: ProviderRouteEndpoint | null;
  destination?: ProviderRouteEndpoint | null;
  routes?: ProviderRouteResult[] | null;
  unavailable_modes?: string[] | null;
  limitations?: string[] | null;
  status?: 'success' | 'degraded' | null;
  tool_call_log_id?: string | null;
}

export interface TravelEndpoint {
  city?: string | null;
  station_name?: string | null;
  station_code?: string | null;
  terminal?: string | null;
  scheduled_at?: string | null;
}

export interface TravelMoney {
  currency: 'CNY';
  amount_minor: number;
}

export interface ProviderFlightResult {
  option_id?: string | null;
  airline_name?: string | null;
  flight_no?: string | null;
  departure?: TravelEndpoint | null;
  arrival?: TravelEndpoint | null;
  duration_s?: number | null;
  cabin_class?: string | null;
  stops?: 0 | null;
  price?: TravelMoney | null;
  actions?: StructuredResultAction[] | null;
}

export interface FlightResultsBlock {
  type: 'flight_results';
  id: string;
  schema_version: 1;
  provider?: string | null;
  attribution?: StructuredResultAttribution | null;
  status?: 'success' | 'degraded' | null;
  origin?: string | null;
  destination?: string | null;
  departure_date?: string | null;
  observed_at?: string | null;
  result_count?: number | null;
  flights?: ProviderFlightResult[] | null;
  limitations?: string[] | null;
  tool_call_log_id?: string | null;
}

export interface ProviderTrainResult {
  option_id?: string | null;
  train_no?: string | null;
  train_type?: string | null;
  departure?: TravelEndpoint | null;
  arrival?: TravelEndpoint | null;
  duration_s?: number | null;
  seat_class?: string | null;
  stops?: 0 | null;
  price?: TravelMoney | null;
  actions?: StructuredResultAction[] | null;
}

export interface TrainResultsBlock {
  type: 'train_results';
  id: string;
  schema_version: 1;
  provider?: string | null;
  attribution?: StructuredResultAttribution | null;
  status?: 'success' | 'degraded' | null;
  origin?: string | null;
  destination?: string | null;
  departure_date?: string | null;
  observed_at?: string | null;
  result_count?: number | null;
  trains?: ProviderTrainResult[] | null;
  limitations?: string[] | null;
  tool_call_log_id?: string | null;
}

export interface ForecastDay {
  date: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  day_weather: string;
  night_weather: string;
  high_c: number;
  low_c: number;
  day_wind_direction?: string | null;
  night_wind_direction?: string | null;
  day_wind_power?: string | null;
  night_wind_power?: string | null;
}

export interface WeatherResultsBlock {
  type: 'weather_results';
  id: string;
  schema_version: 1;
  provider: 'amap';
  attribution?: StructuredResultAttribution | null;
  status: 'success' | 'degraded';
  query: string;
  resolved_location: string;
  day_count: 1 | 2 | 3 | 4;
  forecast_days: ForecastDay[];
  fetched_at: string;
  limitations?: string[] | null;
  tool_call_log_id?: string | null;
}

export type ItineraryStrategy =
  | 'lowest_reference_price'
  | 'shortest_scheduled_duration';

export type ItinerarySectionKind =
  | 'outbound_transport'
  | 'return_transport'
  | 'destination_weather'
  | 'local_route';

export interface ItineraryResultRef {
  block_id: string;
  item_ids: string[];
}

export interface ItinerarySection {
  id: string;
  kind: ItinerarySectionKind;
  status: 'complete' | 'partial' | 'unavailable';
  title: string;
  coverage: 'full' | 'partial' | 'outside_range' | null;
  result_refs: ItineraryResultRef[];
}

export interface ItineraryPlan {
  id: string;
  title: string;
  status: 'complete' | 'partial';
  strategy: ItineraryStrategy;
  tags: ItineraryStrategy[];
  known_cost: TravelMoney | null;
  known_duration_s: number | null;
  sections: ItinerarySection[];
}

export interface ItineraryAvailability {
  journey: 'outbound' | 'return' | 'destination_weather' | 'local_route';
  mode: 'flight' | 'train' | 'weather' | 'route';
  status: 'available' | 'unavailable';
}

export interface ItineraryResultsBlock {
  type: 'itinerary_results';
  id: string;
  schema_version: 1;
  provider: 'fusion';
  status: 'success' | 'degraded';
  trip_type: 'one_way' | 'round_trip';
  origin: string;
  destination: string;
  start_date: string;
  end_date: string | null;
  recommended_plan_id: null;
  plans: ItineraryPlan[];
  availability: ItineraryAvailability[];
  limitations: string[];
}

export interface UnsupportedResultBlock {
  type: 'unsupported_result';
  id: string;
  source_type: string;
  source_schema_version?: number;
  reason: 'unsupported_type' | 'unsupported_version' | 'invalid_payload';
}

export type StructuredToolResultBlock =
  | PlaceResultsBlock
  | RouteResultsBlock
  | FlightResultsBlock
  | TrainResultsBlock
  | WeatherResultsBlock
  | ItineraryResultsBlock
  | UnsupportedResultBlock;

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | FileBlock
  | SearchBlock
  | UrlBlock
  | KnowledgeEvidenceBlock
  | StructuredToolResultBlock;

// ============================================================
// Usage
// ============================================================

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  context?: ContextUsage | null;
}

/** 单次有效模型请求的上下文快照；不与 usage.input_tokens 的 Agent 累计口径混用。 */
export interface ContextUsage {
  status: string;
  window_tokens: number | null;
  estimated_tokens_before: number | null;
  estimated_tokens_after: number | null;
  actual_prompt_tokens: number | null;
  removed_turns: number;
  removed_messages: number;
  removed_tool_transactions: number;
  round_index: number | null;
}

export type SuggestedQuestionsStatus = 'idle' | 'pending' | 'ready' | 'failed';

// ============================================================
// Message
// ============================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  /** 服务端分配的会话内稳定顺序；本地 optimistic 消息在服务端确认前可以没有该值。 */
  sequence?: number;
  model_id?: string | null;
  usage?: Usage | null;
  timestamp?: number;
  chatId?: string;
  status?: 'pending' | 'failed' | null;
  isReasoningVisible?: boolean;
  shouldSyncToDb?: boolean;
  agent_run?: AgentRunState | null;
  // 持久化推荐问题，刷新后随消息恢复
  suggestedQuestions?: string[];
  suggestedQuestionsStatus?: SuggestedQuestionsStatus;
  suggestedQuestionsRevision?: number;
}

// ============================================================
// Conversation
// ============================================================

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model_id: string;
  /** 当前会话默认知识库范围；旧服务端快照可能暂未提供。 */
  knowledge_base_ids?: string[];
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// 其他
// ============================================================

export interface Pagination {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export type HydrationStatus = 'idle' | 'loading' | 'done' | 'error';

// ============================================================
// 工具函数：从 content blocks 中提取纯文本
// ============================================================

export function extractTextFromBlocks(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

export function extractThinkingFromBlocks(content: ContentBlock[]): string {
  return content
    .filter((b): b is ThinkingBlock => b.type === 'thinking')
    .map(b => b.thinking)
    .join('');
}

export function extractSearchBlock(content: ContentBlock[]): SearchBlock | null {
  return (content.find((b): b is SearchBlock => b.type === 'search') ?? null);
}

export function extractUrlBlock(content: ContentBlock[]): UrlBlock | undefined {
  return content.find((b): b is UrlBlock => b.type === 'url_read');
}
