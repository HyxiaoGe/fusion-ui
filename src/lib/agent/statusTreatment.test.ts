import { describe, it, expect } from 'vitest';
import {
  RUN_STATUS_TREATMENT,
  STEP_STATUS_TREATMENT,
} from './statusTreatment';

describe('statusTreatment', () => {
  it('RUN_STATUS_TREATMENT 覆盖所有 6 种 run 状态', () => {
    const required = ['running', 'completed', 'limit_reached', 'incomplete', 'interrupted', 'failed'] as const;
    required.forEach(s => {
      expect(RUN_STATUS_TREATMENT[s]).toBeDefined();
      expect(RUN_STATUS_TREATMENT[s].label).toBeTruthy();
    });
  });

  it('limit_reached / incomplete 都是 warn，不当作 danger 失败', () => {
    expect(RUN_STATUS_TREATMENT.limit_reached.color).toBe('warn');
    expect(RUN_STATUS_TREATMENT.incomplete.color).toBe('warn');
    expect(RUN_STATUS_TREATMENT.failed.color).toBe('danger');
  });

  it('STEP_STATUS_TREATMENT 覆盖所有 4 种 step 状态', () => {
    const required: ('running' | 'completed' | 'failed' | 'interrupted')[] =
      ['running', 'completed', 'failed', 'interrupted'];
    required.forEach(s => {
      expect(STEP_STATUS_TREATMENT[s]).toBeDefined();
    });
  });
});
