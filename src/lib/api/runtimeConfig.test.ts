import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./fetchWithAuth', () => ({
  apiRequest: apiRequestMock,
}));

import {
  activateRuntimeConfigEntryAPI,
  createRuntimeConfigEntryAPI,
  fetchRuntimeConfigSnapshotAPI,
  setRuntimeConfigEntryActiveAPI,
  validateRuntimeConfigAPI,
} from './runtimeConfig';

describe('runtime config api client', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('fetchRuntimeConfigSnapshotAPI 读取 admin runtime config 快照', async () => {
    apiRequestMock.mockResolvedValue({ effective: [], entries: [] });

    await fetchRuntimeConfigSnapshotAPI();

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/runtime-config');
  });

  it('validateRuntimeConfigAPI 提交候选 payload 且不写库', async () => {
    apiRequestMock.mockResolvedValue({ valid: true, issues: [] });

    await validateRuntimeConfigAPI({
      namespace: 'prompt_template',
      key: 'generate_title',
      payload: { template: '标题 prompt' },
    });

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/runtime-config/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace: 'prompt_template',
        key: 'generate_title',
        payload: { template: '标题 prompt' },
      }),
    });
  });

  it('createRuntimeConfigEntryAPI 创建 inactive 候选版本', async () => {
    apiRequestMock.mockResolvedValue({ id: 'row-1', is_active: false });

    await createRuntimeConfigEntryAPI({
      namespace: 'prompt_template',
      key: 'generate_title',
      version: '2026-07-03.ui-test',
      payload: { template: '标题 prompt' },
      description: 'UI 候选',
    });

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/runtime-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace: 'prompt_template',
        key: 'generate_title',
        version: '2026-07-03.ui-test',
        payload: { template: '标题 prompt' },
        description: 'UI 候选',
      }),
    });
  });

  it('activateRuntimeConfigEntryAPI 调用安全激活接口', async () => {
    apiRequestMock.mockResolvedValue({ id: 'row-1', is_active: true });

    await activateRuntimeConfigEntryAPI('row-1');

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/runtime-config/row-1/activate', {
      method: 'POST',
    });
  });

  it('setRuntimeConfigEntryActiveAPI 调用 status patch 接口', async () => {
    apiRequestMock.mockResolvedValue({ id: 'row-1', is_active: false });

    await setRuntimeConfigEntryActiveAPI('row-1', false);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/runtime-config/row-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
  });
});
