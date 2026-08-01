import type { Message, SuggestedQuestionsStatus } from '@/types/conversation';

export function resolveSuggestedQuestionsStatus(
  message: Message,
): SuggestedQuestionsStatus | undefined {
  if (message.suggestedQuestionsStatus) {
    return message.suggestedQuestionsStatus;
  }
  // 旧消息没有状态字段；已有持久化推荐时等价于 ready，没有推荐时保持未知。
  return (message.suggestedQuestions?.length ?? 0) > 0 ? 'ready' : undefined;
}

function getSuggestedQuestionsRevision(message: Message): number {
  return typeof message.suggestedQuestionsRevision === 'number'
    ? message.suggestedQuestionsRevision
    : 0;
}

export function shouldApplySuggestedQuestionsSnapshot(
  currentMessage: Message | undefined,
  freshMessage: Message,
): boolean {
  if (!currentMessage) {
    return true;
  }
  const freshRevision = getSuggestedQuestionsRevision(freshMessage);
  const currentRevision = getSuggestedQuestionsRevision(currentMessage);
  if (freshRevision < currentRevision) {
    return false;
  }
  const currentStatus = resolveSuggestedQuestionsStatus(currentMessage);
  const freshStatus = resolveSuggestedQuestionsStatus(freshMessage);
  return !(
    freshRevision === currentRevision
    && (currentStatus === 'ready' || currentStatus === 'failed')
    && freshStatus === 'pending'
  );
}
