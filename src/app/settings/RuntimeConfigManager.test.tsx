import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  activateRuntimeConfigEntryMock,
  createRuntimeConfigEntryMock,
  fetchRuntimeConfigSnapshotMock,
  setRuntimeConfigEntryActiveMock,
  validateRuntimeConfigMock,
} = vi.hoisted(() => ({
  activateRuntimeConfigEntryMock: vi.fn(),
  createRuntimeConfigEntryMock: vi.fn(),
  fetchRuntimeConfigSnapshotMock: vi.fn(),
  setRuntimeConfigEntryActiveMock: vi.fn(),
  validateRuntimeConfigMock: vi.fn(),
}));

vi.mock('@/lib/api/runtimeConfig', () => ({
  activateRuntimeConfigEntryAPI: activateRuntimeConfigEntryMock,
  createRuntimeConfigEntryAPI: createRuntimeConfigEntryMock,
  fetchRuntimeConfigSnapshotAPI: fetchRuntimeConfigSnapshotMock,
  setRuntimeConfigEntryActiveAPI: setRuntimeConfigEntryActiveMock,
  validateRuntimeConfigAPI: validateRuntimeConfigMock,
}));

import RuntimeConfigManager from './RuntimeConfigManager';

const baseSnapshot = {
  generated_at: '2026-07-03T06:00:00Z',
  effective: [
    {
      namespace: 'prompt_template',
      key: 'generate_title',
      source: 'db',
      version: '2026-07-03.good',
      valid: true,
      issues: [],
      skipped_versions: ['2026-07-03.bad'],
      validation_warnings: {
        '2026-07-03.bad': ['template 必须是非空字符串'],
      },
      payload: { template: '有效标题 prompt' },
    },
  ],
  entries: [
    {
      id: 'row-active',
      namespace: 'prompt_template',
      key: 'generate_title',
      version: '2026-07-03.good',
      is_active: true,
      valid: true,
      issues: [],
      description: '当前版本',
      created_at: '2026-07-03T05:00:00Z',
      updated_at: '2026-07-03T05:30:00Z',
      payload: { template: '有效标题 prompt' },
    },
    {
      id: 'row-candidate',
      namespace: 'prompt_template',
      key: 'generate_title',
      version: '2026-07-03.next',
      is_active: false,
      valid: true,
      issues: [],
      description: '候选版本',
      created_at: '2026-07-03T05:40:00Z',
      updated_at: '2026-07-03T05:40:00Z',
      payload: { template: '候选标题 prompt' },
    },
    {
      id: 'row-invalid',
      namespace: 'prompt_template',
      key: 'generate_title',
      version: '2026-07-03.bad',
      is_active: false,
      valid: false,
      issues: ['template 必须是非空字符串'],
      description: '坏版本',
      created_at: '2026-07-03T05:10:00Z',
      updated_at: '2026-07-03T05:10:00Z',
      payload: { template: '' },
    },
  ],
};

function prepareSnapshot(snapshot = baseSnapshot) {
  fetchRuntimeConfigSnapshotMock.mockResolvedValue(snapshot);
}

async function renderLoaded() {
  render(<RuntimeConfigManager />);
  await screen.findByText('当前生效配置');
}

function fillCandidateForm(payload = '{"template":"新标题 prompt"}') {
  fireEvent.change(screen.getByLabelText('命名空间'), { target: { value: 'prompt_template' } });
  fireEvent.change(screen.getByLabelText('配置 Key'), { target: { value: 'generate_title' } });
  fireEvent.change(screen.getByLabelText('版本号'), { target: { value: '2026-07-03.ui' } });
  fireEvent.change(screen.getByLabelText('描述'), { target: { value: 'UI 候选版本' } });
  fireEvent.change(screen.getByLabelText('JSON Payload'), { target: { value: payload } });
}

describe('RuntimeConfigManager', () => {
  beforeEach(() => {
    fetchRuntimeConfigSnapshotMock.mockReset();
    validateRuntimeConfigMock.mockReset();
    createRuntimeConfigEntryMock.mockReset();
    activateRuntimeConfigEntryMock.mockReset();
    setRuntimeConfigEntryActiveMock.mockReset();
  });

  it('加载后展示当前 effective 配置和数据库版本列表', async () => {
    prepareSnapshot();

    await renderLoaded();

    expect(screen.getAllByText('prompt_template / generate_title').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-07-03.good')).toBeInTheDocument();
    expect(screen.getByText('跳过 1 个坏版本')).toBeInTheDocument();
    expect(screen.getAllByText('候选版本').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-07-03.next')).toBeInTheDocument();
    expect(screen.getByText('template 必须是非空字符串')).toBeInTheDocument();
  });

  it('payload 不是 JSON object 时不调用后端校验', async () => {
    prepareSnapshot();
    await renderLoaded();

    fillCandidateForm('[]');
    fireEvent.click(screen.getByRole('button', { name: '校验' }));

    expect(await screen.findByText('payload 必须是 JSON 对象')).toBeInTheDocument();
    expect(validateRuntimeConfigMock).not.toHaveBeenCalled();
  });

  it('点击校验后展示后端 issues', async () => {
    prepareSnapshot();
    validateRuntimeConfigMock.mockResolvedValue({
      namespace: 'prompt_template',
      key: 'generate_title',
      valid: false,
      issues: ['template 必须是非空字符串'],
    });
    await renderLoaded();

    fillCandidateForm('{"template":""}');
    fireEvent.click(screen.getByRole('button', { name: '校验' }));

    expect(await screen.findByText('校验未通过')).toBeInTheDocument();
    expect(screen.getAllByText('template 必须是非空字符串').length).toBeGreaterThan(0);
  });

  it('创建候选版本前先 validate，通过后 create 并刷新 snapshot', async () => {
    prepareSnapshot();
    validateRuntimeConfigMock.mockResolvedValue({
      namespace: 'prompt_template',
      key: 'generate_title',
      valid: true,
      issues: [],
    });
    createRuntimeConfigEntryMock.mockResolvedValue({
      id: 'row-new',
      namespace: 'prompt_template',
      key: 'generate_title',
      version: '2026-07-03.ui',
      is_active: false,
      valid: true,
      issues: [],
      payload: { template: '新标题 prompt' },
    });
    await renderLoaded();

    fillCandidateForm();
    fireEvent.click(screen.getByRole('button', { name: '创建候选' }));

    await waitFor(() => expect(createRuntimeConfigEntryMock).toHaveBeenCalledTimes(1));
    expect(validateRuntimeConfigMock.mock.invocationCallOrder[0]).toBeLessThan(
      createRuntimeConfigEntryMock.mock.invocationCallOrder[0],
    );
    expect(createRuntimeConfigEntryMock).toHaveBeenCalledWith({
      namespace: 'prompt_template',
      key: 'generate_title',
      version: '2026-07-03.ui',
      description: 'UI 候选版本',
      payload: { template: '新标题 prompt' },
    });
    expect(fetchRuntimeConfigSnapshotMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('候选版本已创建，尚未生效')).toBeInTheDocument();
  });

  it('激活候选版本需要确认，确认后调用 activate 并刷新 snapshot', async () => {
    prepareSnapshot();
    activateRuntimeConfigEntryMock.mockResolvedValue({ id: 'row-candidate', is_active: true });
    await renderLoaded();

    const row = screen.getByTestId('runtime-config-entry-row-candidate');
    fireEvent.click(within(row).getByRole('button', { name: '激活' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认激活' }));

    await waitFor(() => expect(activateRuntimeConfigEntryMock).toHaveBeenCalledWith('row-candidate'));
    expect(fetchRuntimeConfigSnapshotMock).toHaveBeenCalledTimes(2);
  });

  it('禁用 active 版本需要确认，确认后调用 status=false 并刷新 snapshot', async () => {
    prepareSnapshot();
    setRuntimeConfigEntryActiveMock.mockResolvedValue({ id: 'row-active', is_active: false });
    await renderLoaded();

    const row = screen.getByTestId('runtime-config-entry-row-active');
    fireEvent.click(within(row).getByRole('button', { name: '禁用' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认禁用' }));

    await waitFor(() => expect(setRuntimeConfigEntryActiveMock).toHaveBeenCalledWith('row-active', false));
    expect(fetchRuntimeConfigSnapshotMock).toHaveBeenCalledTimes(2);
  });
});
