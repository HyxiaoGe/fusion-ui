import { describe, expect, it } from 'vitest';
import { getRunStatusFromFinishReason } from './finishReason';

describe('getRunStatusFromFinishReason', () => {
  it('把后端 run_completed.finish_reason 映射为前端 run 状态', () => {
    expect(getRunStatusFromFinishReason('stop')).toBe('completed');
    expect(getRunStatusFromFinishReason('limit_reached')).toBe('limit_reached');
    expect(getRunStatusFromFinishReason('incomplete')).toBe('incomplete');
    expect(getRunStatusFromFinishReason('unknown')).toBe('completed');
  });
});
