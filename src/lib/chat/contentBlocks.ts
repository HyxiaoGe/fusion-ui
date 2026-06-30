import type { ContentBlock } from '@/types/conversation';

export function recoverReasoningOnlyFinalBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const hasVisibleText = blocks.some(block => block.type === 'text' && block.text.trim().length > 0);
  if (hasVisibleText) {
    return blocks;
  }

  const thinkingText = blocks
    .filter((block): block is Extract<ContentBlock, { type: 'thinking' }> => block.type === 'thinking')
    .map(block => block.thinking)
    .filter(text => text.trim().length > 0)
    .join('\n\n')
    .trim();

  if (!thinkingText) {
    return blocks;
  }

  const firstThinking = blocks.find((block): block is Extract<ContentBlock, { type: 'thinking' }> => (
    block.type === 'thinking' && block.thinking.trim().length > 0
  ));

  return [
    ...blocks.filter(block => block.type !== 'thinking'),
    {
      type: 'text',
      id: `recovered-${firstThinking?.id ?? 'thinking'}`,
      text: thinkingText,
    },
  ];
}

export function shouldRecoverReasoningOnlyFinalBlocks(options: {
  runStatus?: string | null;
  messageMatches?: boolean;
}): boolean {
  return options.messageMatches !== false && options.runStatus === 'completed';
}
