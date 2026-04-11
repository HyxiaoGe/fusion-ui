/** 用户记忆条目 */
export interface Memory {
  id: string;
  content: string;
  source: 'auto' | 'manual';
  conversation_id: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}
