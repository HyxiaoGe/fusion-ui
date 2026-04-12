import type {
  Conversation, Message, ContentBlock,
  TextBlock, ThinkingBlock, FileBlock, SearchBlock, SearchSourceSummary, UrlBlock,
} from '@/types/conversation';
import { parseTimestamp } from '@/lib/utils/parseTimestamp';

// 服务端返回的原始类型（对齐后端 schema）
interface ServerBlock {
  type: 'text' | 'thinking' | 'file' | 'search' | 'url_read';
  id: string;
  text?: string;
  thinking?: string;
  file_id?: string;
  filename?: string;
  mime_type?: string;
  query?: string;
  tool_call_log_id?: string;
  sources?: SearchSourceSummary[];
  url?: string;
  title?: string;
  favicon?: string;
}

interface ServerUsage {
  input_tokens: number;
  output_tokens: number;
}

interface ServerMessage {
  id: string;
  role: 'user' | 'assistant';
  content: ServerBlock[];
  model_id?: string | null;
  usage?: ServerUsage | null;
  created_at?: string | number | null;
  suggested_questions?: string[] | null;
}

interface ServerConversation {
  id: string;
  title: string;
  model_id: string;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  messages: ServerMessage[];
}

export const parseServerTimestamp = parseTimestamp;

function buildContentBlocks(serverBlocks: ServerBlock[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const b of serverBlocks) {
    if (b.type === 'text' && b.text != null) {
      blocks.push({ type: 'text', id: b.id, text: b.text } satisfies TextBlock);
    } else if (b.type === 'thinking' && b.thinking != null) {
      blocks.push({ type: 'thinking', id: b.id, thinking: b.thinking } satisfies ThinkingBlock);
    } else if (b.type === 'file' && b.file_id) {
      blocks.push({
        type: 'file',
        id: b.id,
        file_id: b.file_id,
        filename: b.filename ?? '',
        mime_type: b.mime_type ?? '',
      } satisfies FileBlock);
    } else if (b.type === 'search' && b.query != null) {
      blocks.push({
        type: 'search',
        id: b.id,
        query: b.query,
        tool_call_log_id: b.tool_call_log_id,
        sources: b.sources ?? [],
      } satisfies SearchBlock);
    } else if (b.type === 'url_read' && b.url) {
      blocks.push({
        type: 'url_read',
        id: b.id,
        url: b.url,
        title: b.title,
        favicon: b.favicon,
        tool_call_log_id: b.tool_call_log_id,
      } satisfies UrlBlock);
    }
  }
  return blocks;
}

function buildMessage(serverMessage: ServerMessage, conversationId: string): Message {
  const hasThinking = serverMessage.content.some(b => b.type === 'thinking');
  return {
    id: serverMessage.id,
    role: serverMessage.role,
    content: buildContentBlocks(serverMessage.content),
    chatId: conversationId,
    model_id: serverMessage.model_id ?? null,
    usage: serverMessage.usage ?? null,
    timestamp: parseServerTimestamp(serverMessage.created_at),
    isReasoningVisible: hasThinking ? false : undefined,
    suggestedQuestions: serverMessage.suggested_questions ?? undefined,
  };
}

export function buildChatFromServerConversation(
  serverConversation: ServerConversation
): Conversation {
  const messages = serverConversation.messages
    .map(msg => buildMessage(msg, serverConversation.id))
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  return {
    id: serverConversation.id,
    title: serverConversation.title,
    model_id: serverConversation.model_id,
    messages,
    createdAt: parseServerTimestamp(serverConversation.created_at),
    updatedAt: parseServerTimestamp(serverConversation.updated_at),
  };
}

export function shouldHydrateConversation(
  chat: Pick<Conversation, 'messages'> | null | undefined
): boolean {
  return !chat || chat.messages.length === 0;
}

export function getConversationHydrationView(options: {
  chatId?: string | null;
  chat: Pick<Conversation, 'messages'> | null | undefined;
  isLoadingServerChat: boolean;
  serverError?: string | null;
}): 'loading' | 'error' | 'ready' {
  const { chatId, chat, isLoadingServerChat, serverError } = options;
  if (!chatId) return 'ready';
  const needsHydration = shouldHydrateConversation(chat);
  if (!needsHydration) return 'ready';
  if (serverError) return 'error';
  if (isLoadingServerChat || needsHydration) return 'loading';
  return 'ready';
}
