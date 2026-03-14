import { describe, expect, it } from 'vitest';

import { shouldAutoFetchSuggestedQuestions } from './suggestedQuestionTiming';

describe('shouldAutoFetchSuggestedQuestions', () => {
  it('returns true for a fresh assistant reply', () => {
    expect(
      shouldAutoFetchSuggestedQuestions(
        [
          { id: 'assistant-1', role: 'assistant', content: 'fresh', timestamp: 1_000 },
        ],
        50_000,
      ),
    ).toBe(true);
  });

  it('returns false for historical replies', () => {
    expect(
      shouldAutoFetchSuggestedQuestions(
        [
          { id: 'assistant-1', role: 'assistant', content: 'old', timestamp: 1_000 },
        ],
        200_000,
      ),
    ).toBe(false);
  });

  it('returns false when there is no assistant content yet', () => {
    expect(
      shouldAutoFetchSuggestedQuestions([
        { id: 'user-1', role: 'user', content: 'hello', timestamp: 1_000 },
      ]),
    ).toBe(false);
  });
});
