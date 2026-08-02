import type { Message, SuggestedQuestionsStatus } from '@/types/conversation';

export function hasFormalTextContent(blocks: Message['content']): boolean {
  return blocks.some(
    (block) => block.type === 'text' && block.text.trim().length > 0,
  );
}

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

export function mergeSuggestedQuestionsState(
  currentMessage: Message,
  freshMessage: Message,
): Pick<
  Message,
  'suggestedQuestions' | 'suggestedQuestionsStatus' | 'suggestedQuestionsRevision'
> {
  if (!shouldApplySuggestedQuestionsSnapshot(currentMessage, freshMessage)) {
    return {
      suggestedQuestions: currentMessage.suggestedQuestions,
      suggestedQuestionsStatus: currentMessage.suggestedQuestionsStatus,
      suggestedQuestionsRevision: currentMessage.suggestedQuestionsRevision,
    };
  }

  return {
    // 刷新期间 pending / failed 允许保留上一批问题，直到同 revision 新结果 ready。
    suggestedQuestions: freshMessage.suggestedQuestions ?? currentMessage.suggestedQuestions,
    suggestedQuestionsStatus: freshMessage.suggestedQuestionsStatus,
    suggestedQuestionsRevision: freshMessage.suggestedQuestionsRevision,
  };
}
