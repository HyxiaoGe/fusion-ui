/** Chat 与 Trajectory 之间只共享稳定的消息级 DOM 锚点。 */
export function getChatMessageDomId(messageId: string): string {
  return `chat-message-${messageId}`;
}
