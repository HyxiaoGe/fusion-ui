import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/types/api';
import type { ModelAdmissionOperation, ModelManagementSnapshot } from '@/types/modelManagement';

const {
  admitModelCandidateMock,
  dispatchMock,
  fetchModelManagementSnapshotMock,
  refreshModelsMock,
  updateModelsMock,
  updateModelVisibilityMock,
  updateProvidersMock,
} = vi.hoisted(() => ({
  admitModelCandidateMock: vi.fn(),
  dispatchMock: vi.fn(),
  fetchModelManagementSnapshotMock: vi.fn(),
  refreshModelsMock: vi.fn(),
  updateModelsMock: vi.fn((payload) => ({ type: 'models/updateModels', payload })),
  updateModelVisibilityMock: vi.fn(),
  updateProvidersMock: vi.fn((payload) => ({ type: 'models/updateProviders', payload })),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
}));

vi.mock('@/redux/slices/modelsSlice', () => ({
  updateModels: updateModelsMock,
  updateProviders: updateProvidersMock,
}));

vi.mock('@/lib/config/modelConfig', () => ({
  refreshModels: refreshModelsMock,
}));

vi.mock('@/lib/api/modelManagement', () => ({
  admitModelCandidateAPI: admitModelCandidateMock,
  fetchModelManagementSnapshotAPI: fetchModelManagementSnapshotMock,
  updateModelVisibilityAPI: updateModelVisibilityMock,
}));

import ModelManagementPanel, { MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY } from './ModelManagementPanel';

const baseSnapshot: ModelManagementSnapshot = {
  generated_at: '2026-08-04T08:00:00+08:00',
  governance: {
    available: true,
    run_id: 'run-20260804-001',
  },
  capabilities: {
    admission_enabled: true,
    hard_delete_enabled: false,
  },
  models: [
    {
      model_id: 'kimi-k3',
      name: 'Kimi K3',
      provider: 'moonshot',
      provider_display: 'Moonshot',
      health: { status: 'healthy' },
      selectable: true,
      routable: true,
      state: 'active',
      revision: 7,
    },
    {
      model_id: 'legacy-model',
      name: 'Legacy Model',
      provider: 'legacy',
      provider_display: 'Legacy',
      health: { status: 'healthy' },
      selectable: false,
      routable: true,
      state: 'hidden',
      revision: 3,
      reason: '仅保留已有对话',
    },
  ],
  candidates: [
    {
      provider_key: 'moonshot',
      model_id: 'kimi-k3.1',
      state: 'admission_ready',
      reasons: ['预检与治理门禁均通过'],
      candidate_fingerprint: 'fingerprint-ready',
    },
    {
      provider_key: 'google',
      provider_display: 'Google Gemini',
      model_id: 'gemini-next',
      state: 'preflight_required',
      reasons: ['尚未完成真实调用预检'],
      candidate_fingerprint: 'fingerprint-waiting',
    },
  ],
  operations: [],
};

function prepareLoadedSnapshot(snapshot = baseSnapshot) {
  fetchModelManagementSnapshotMock.mockResolvedValue(snapshot);
}

async function renderLoaded(snapshot = baseSnapshot) {
  prepareLoadedSnapshot(snapshot);
  render(<ModelManagementPanel />);
  await screen.findByTestId('registered-model-count');
}

describe('ModelManagementPanel', () => {
  beforeEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    admitModelCandidateMock.mockReset();
    dispatchMock.mockReset();
    fetchModelManagementSnapshotMock.mockReset();
    refreshModelsMock.mockReset();
    updateModelsMock.mockClear();
    updateModelVisibilityMock.mockReset();
    updateProvidersMock.mockClear();
  });

  it('展示统计、已注册模型、治理候选和中文候选状态，不暴露硬删除', async () => {
    await renderLoaded();

    expect(screen.getByText('2', { selector: '[data-testid="registered-model-count"]' })).toBeInTheDocument();
    expect(screen.getByText('1', { selector: '[data-testid="selectable-model-count"]' })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: '[data-testid="candidate-count"]' })).toBeInTheDocument();
    expect(screen.getByText('Kimi K3')).toBeInTheDocument();
    expect(screen.getByText('Legacy Model')).toBeInTheDocument();
    expect(screen.getByText('可以上线')).toBeInTheDocument();
    expect(screen.getByText('等待预检')).toBeInTheDocument();
    expect(screen.getByText('尚未完成真实调用预检')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除/ })).toBeNull();
  });

  it('新对话可选择统计排除不可路由和健康异常的已注册模型', async () => {
    await renderLoaded({
      ...baseSnapshot,
      models: [
        ...baseSnapshot.models,
        {
          model_id: 'route-disabled-model',
          name: 'Route Disabled Model',
          provider: 'legacy',
          provider_display: 'Legacy',
          health: { status: 'healthy' },
          selectable: true,
          routable: false,
          state: 'registered',
          revision: 1,
        },
        {
          model_id: 'unhealthy-model',
          name: 'Unhealthy Model',
          provider: 'legacy',
          provider_display: 'Legacy',
          health: { status: 'unhealthy' },
          selectable: true,
          routable: true,
          state: 'registered',
          revision: 1,
        },
      ],
    });

    expect(screen.getByTestId('registered-model-count')).toHaveTextContent('4');
    expect(screen.getByTestId('selectable-model-count')).toHaveTextContent('1');
  });

  it('按提供商汇总数量，并同时筛选已注册模型和治理候选', async () => {
    await renderLoaded();

    const providerFilter = screen.getByRole('combobox', { name: '按提供商筛选模型' });
    expect(providerFilter).toHaveTextContent('全部提供商');
    fireEvent.click(providerFilter);

    const googleOption = screen.getByRole('option', { name: /Google Gemini/ });
    expect(googleOption).toHaveTextContent('0 已注册');
    expect(googleOption).toHaveTextContent('1 候选');
    fireEvent.click(googleOption);

    expect(providerFilter).toHaveTextContent('Google Gemini');
    expect(screen.getByText('gemini-next')).toBeInTheDocument();
    expect(screen.queryByText('kimi-k3.1')).toBeNull();
    expect(screen.queryByText('Kimi K3')).toBeNull();
    expect(screen.queryByText('Legacy Model')).toBeNull();
    expect(screen.getByText('当前提供商没有已注册模型')).toBeInTheDocument();
    expect(screen.getByTestId('visible-registered-model-count')).toHaveTextContent('0 / 2');
    expect(screen.getByTestId('visible-candidate-count')).toHaveTextContent('1 / 2');
  });

  it('统一搜索模型名称和 ID，并忽略大小写及首尾空格', async () => {
    await renderLoaded();

    const searchInput = screen.getByRole('searchbox', { name: '搜索模型' });
    fireEvent.change(searchInput, { target: { value: '  kImI  ' } });

    expect(screen.getByText('Kimi K3')).toBeInTheDocument();
    expect(screen.getByText('kimi-k3.1')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Model')).toBeNull();
    expect(screen.queryByText('gemini-next')).toBeNull();
    expect(screen.getByTestId('visible-registered-model-count')).toHaveTextContent('1 / 2');
    expect(screen.getByTestId('visible-candidate-count')).toHaveTextContent('1 / 2');
  });

  it('搜索与提供商分类叠加，支持提供商名称并可一键清空', async () => {
    await renderLoaded();

    const providerFilter = screen.getByRole('combobox', { name: '按提供商筛选模型' });
    fireEvent.click(providerFilter);
    fireEvent.click(screen.getByRole('option', { name: /Google Gemini/ }));

    const searchInput = screen.getByRole('searchbox', { name: '搜索模型' });
    fireEvent.change(searchInput, { target: { value: 'kimi' } });
    expect(screen.getByText('当前提供商没有匹配的已注册模型')).toBeInTheDocument();
    expect(screen.getByText('当前提供商没有匹配的治理候选')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: ' gemini ' } });
    expect(screen.getByText('gemini-next')).toBeInTheDocument();
    expect(screen.queryByText('kimi-k3.1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '清除模型搜索' }));
    expect(searchInput).toHaveValue('');
    expect(screen.getByText('gemini-next')).toBeInTheDocument();
    expect(providerFilter).toHaveTextContent('Google Gemini');
  });

  it('刷新后所选提供商已不存在时自动恢复全部分类', async () => {
    const moonshotOnly: ModelManagementSnapshot = {
      ...baseSnapshot,
      models: baseSnapshot.models.filter((model) => model.provider === 'moonshot'),
      candidates: baseSnapshot.candidates.filter((candidate) => candidate.provider_key === 'moonshot'),
    };
    fetchModelManagementSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce(moonshotOnly);

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    const providerFilter = screen.getByRole('combobox', { name: '按提供商筛选模型' });
    fireEvent.click(providerFilter);
    fireEvent.click(screen.getByRole('option', { name: /Google Gemini/ }));
    expect(providerFilter).toHaveTextContent('Google Gemini');

    fireEvent.click(screen.getByRole('button', { name: '刷新' }));

    await waitFor(() => expect(providerFilter).toHaveTextContent('全部提供商'));
    expect(screen.getByText('Kimi K3')).toBeInTheDocument();
    expect(screen.getByText('kimi-k3.1')).toBeInTheDocument();
    expect(screen.queryByText('gemini-next')).toBeNull();
  });

  it('兼容无 status 的旧 API 响应并保留候选上线动作', async () => {
    await renderLoaded();

    expect(screen.getByRole('button', { name: '上线 kimi-k3.1' })).toBeEnabled();
    expect(screen.queryByText('最新治理扫描部分失败')).toBeNull();
  });

  it('最新治理扫描失败时展示最近成功候选，用单一告警暂停准入', async () => {
    await renderLoaded({
      ...baseSnapshot,
      governance: {
        available: true,
        status: 'degraded',
        run_id: 'run-20260804-001',
        reason: 'latest_run_failed',
        message: '最新治理运行失败，当前展示上一次有效快照；模型准入已暂停。',
      },
      capabilities: {
        ...baseSnapshot.capabilities,
        admission_enabled: false,
      },
    });

    expect(screen.getByText('kimi-k3.1')).toBeInTheDocument();
    expect(screen.getByText('gemini-next')).toBeInTheDocument();
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('最新治理扫描部分失败');
    expect(alerts[0]).toHaveTextContent('当前展示上一次有效快照');
    expect(alerts[0]).toHaveTextContent('模型准入已暂停');
    expect(screen.queryByText(/模型上线能力当前未启用/)).toBeNull();
    expect(screen.getByRole('button', { name: '上线已暂停 kimi-k3.1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '验证并上线已暂停 gemini-next' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '上线 kimi-k3.1' })).toBeNull();
  });

  it('治理降级时已成功上线的候选不再显示暂停按钮', async () => {
    await renderLoaded({
      ...baseSnapshot,
      governance: {
        available: true,
        status: 'degraded',
        run_id: 'run-20260804-001',
        reason: 'latest_run_failed',
      },
      capabilities: {
        ...baseSnapshot.capabilities,
        admission_enabled: false,
      },
      operations: [
        {
          operation_id: 'operation-succeeded',
          candidate_fingerprint: 'fingerprint-ready',
          model_id: 'kimi-k3.1',
          status: 'succeeded',
          created_at: '2026-08-04T00:00:00Z',
          updated_at: '2026-08-04T00:01:00Z',
        },
      ],
    });

    expect(screen.getByText('上线成功')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上线已暂停 kimi-k3.1' })).toBeNull();
  });

  it('治理真正不可用时不重复告警语义且不提供候选上线动作', async () => {
    await renderLoaded({
      ...baseSnapshot,
      governance: {
        available: false,
        status: 'unavailable',
        reason: 'verified_snapshot_unavailable',
        message: '治理候选暂时不可用',
      },
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('治理候选当前不可用');
    expect(alert).toHaveTextContent('已注册模型仍可管理');
    expect(alert).not.toHaveTextContent('治理候选暂时不可用');
    expect(screen.queryByRole('button', { name: /上线 kimi-k3\.1/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /验证并上线 gemini-next/ })).toBeNull();
  });

  it('隐藏动作要求填写原因并明确只影响新选择，成功后刷新管理快照与全局模型 Redux', async () => {
    const refreshedSnapshot = {
      ...baseSnapshot,
      models: baseSnapshot.models.map((model) => (
        model.model_id === 'kimi-k3' ? { ...model, selectable: false, state: 'hidden', revision: 8 } : model
      )),
    };
    fetchModelManagementSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce(refreshedSnapshot);
    updateModelVisibilityMock.mockResolvedValue({});
    refreshModelsMock.mockResolvedValue({
      providers: [{ id: 'moonshot', name: 'Moonshot', order: 1 }],
      models: [{
        id: 'kimi-k3',
        name: 'Kimi K3',
        provider: 'moonshot',
        capabilities: {},
        temperature: 0.7,
        enabled: true,
        selectable: false,
        routable: true,
      }],
    });

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    fireEvent.click(screen.getByRole('button', { name: '隐藏 Kimi K3' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('仅从新选择中隐藏，已有对话仍可用');
    const confirmButton = within(dialog).getByRole('button', { name: '确认隐藏' });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('操作原因'), {
      target: { value: '供应商临时维护' },
    });
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(updateModelVisibilityMock).toHaveBeenCalledWith('kimi-k3', {
        selectable: false,
        reason: '供应商临时维护',
        expected_revision: 7,
      });
    });
    await waitFor(() => expect(fetchModelManagementSnapshotMock).toHaveBeenCalledTimes(2));
    expect(refreshModelsMock).toHaveBeenCalledTimes(1);
    expect(updateProvidersMock).toHaveBeenCalledWith([{ id: 'moonshot', name: 'Moonshot', order: 1 }]);
    expect(updateModelsMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'kimi-k3', selectable: false, enabled: true, routable: true }),
    ]);
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'models/updateProviders' }));
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'models/updateModels' }));
  });

  it('不可路由的隐藏模型不能恢复到新对话选择器', async () => {
    await renderLoaded({
      ...baseSnapshot,
      models: [{
        ...baseSnapshot.models[1],
        routable: false,
      }],
    });

    expect(screen.getByText('当前模型不可路由，无法恢复到新对话选择器。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '不可恢复 Legacy Model' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '恢复 Legacy Model' })).toBeNull();
  });

  it('可见性已写入但后续刷新失败时不误报写操作失败', async () => {
    prepareLoadedSnapshot();
    updateModelVisibilityMock.mockResolvedValue({});
    fetchModelManagementSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockRejectedValueOnce(new Error('管理快照刷新失败'));
    refreshModelsMock.mockResolvedValue({ models: [], providers: [] });

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    fireEvent.click(screen.getByRole('button', { name: '隐藏 Kimi K3' }));
    fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '临时维护' } });
    fireEvent.click(screen.getByRole('button', { name: '确认隐藏' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('可见性已更新，但后续页面或模型目录刷新未完成');
    expect(screen.getByRole('status')).toHaveTextContent('Kimi K3 的可见性已更新');
    expect(screen.queryByText('模型可见性更新失败')).toBeNull();
    expect(updateModelsMock).toHaveBeenCalledWith([]);
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'models/updateModels' }));
  });

  it('治理能力开启时同时提供直接上线和验证并上线动作', async () => {
    await renderLoaded();

    expect(screen.getByRole('button', { name: '上线 kimi-k3.1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '验证并上线 gemini-next' })).toBeEnabled();
  });

  it('等待预检的候选复用准入 API，弹窗明确真实调用费用与全部通过门槛', async () => {
    const pendingOperation = {
      operation_id: 'operation-preflight',
      candidate_fingerprint: 'fingerprint-waiting',
      model_id: 'gemini-next',
      status: 'pending',
    };
    fetchModelManagementSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce({ ...baseSnapshot, operations: [pendingOperation] });
    admitModelCandidateMock.mockResolvedValue(pendingOperation);

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    fireEvent.click(screen.getByRole('button', { name: '验证并上线 gemini-next' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('先执行真实兼容性预检');
    expect(dialog).toHaveTextContent('可能产生少量模型调用费用');
    expect(dialog).toHaveTextContent('全部通过后才会上线');
    fireEvent.change(within(dialog).getByLabelText('操作原因'), { target: { value: '验证新版本' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '确认验证并上线' }));

    await waitFor(() => {
      expect(admitModelCandidateMock).toHaveBeenCalledWith('fingerprint-waiting', {
        model_id: 'gemini-next',
        expected_run_id: 'run-20260804-001',
        reason: '验证新版本',
      });
    });
  });

  it('候选上线只创建排队操作，不提前刷新全局模型目录', async () => {
    const pendingOperation = {
      operation_id: 'operation-1',
      candidate_fingerprint: 'fingerprint-ready',
      model_id: 'kimi-k3.1',
      status: 'pending',
    };
    fetchModelManagementSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce({ ...baseSnapshot, operations: [pendingOperation] });
    admitModelCandidateMock.mockResolvedValue(pendingOperation);
    refreshModelsMock.mockResolvedValue({ models: [], providers: [] });

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    fireEvent.click(screen.getByRole('button', { name: '上线 kimi-k3.1' }));
    fireEvent.change(screen.getByLabelText('操作原因'), {
      target: { value: '治理门禁已经通过' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认上线' }));

    await waitFor(() => {
      expect(admitModelCandidateMock).toHaveBeenCalledWith('fingerprint-ready', {
        model_id: 'kimi-k3.1',
        expected_run_id: 'run-20260804-001',
        reason: '治理门禁已经通过',
      });
    });
    expect(await screen.findByRole('button', { name: '上线任务已排队 kimi-k3.1' })).toBeDisabled();
    expect(refreshModelsMock).not.toHaveBeenCalled();
    expect(updateModelsMock).not.toHaveBeenCalled();
  });

  it('轮询到上线成功后才刷新全局模型 Redux', async () => {
    const pendingOperation = {
      operation_id: 'operation-2',
      candidate_fingerprint: 'fingerprint-ready',
      model_id: 'kimi-k3.1',
      status: 'pending',
    };
    const succeededOperation = { ...pendingOperation, status: 'succeeded' };
    fetchModelManagementSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce({ ...baseSnapshot, operations: [pendingOperation] })
      .mockResolvedValueOnce({ ...baseSnapshot, operations: [succeededOperation] })
      .mockResolvedValue({ ...baseSnapshot, operations: [succeededOperation] });
    admitModelCandidateMock.mockResolvedValue(pendingOperation);
    refreshModelsMock.mockResolvedValue({
      providers: [{ id: 'moonshot', name: 'Moonshot', order: 1 }],
      models: [{
        id: 'kimi-k3.1',
        name: 'Kimi K3.1',
        provider: 'moonshot',
        capabilities: {},
        temperature: 0.7,
        enabled: true,
        selectable: true,
        routable: true,
      }],
    });

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '上线 kimi-k3.1' }));
    fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '允许上线' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认上线' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshModelsMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshModelsMock).toHaveBeenCalledTimes(1);
    expect(updateModelsMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'kimi-k3.1', selectable: true, routable: true }),
    ]);
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'models/updateModels' }));
  });

  it('上线后管理快照刷新失败时不误报完整成功', async () => {
    const pendingOperation = {
      operation_id: 'operation-snapshot-refresh-failed',
      candidate_fingerprint: 'fingerprint-ready',
      model_id: 'kimi-k3.1',
      status: 'pending',
    };
    const succeededOperation = { ...pendingOperation, status: 'succeeded' };
    fetchModelManagementSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce({ ...baseSnapshot, operations: [pendingOperation] })
      .mockResolvedValueOnce({ ...baseSnapshot, operations: [succeededOperation] })
      .mockRejectedValueOnce(new Error('管理快照网络中断'));
    admitModelCandidateMock.mockResolvedValue(pendingOperation);
    refreshModelsMock.mockResolvedValue({ models: [], providers: [] });

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '上线 kimi-k3.1' }));
    fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '允许上线' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认上线' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshModelsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('模型已上线，但目录刷新失败');
    expect(screen.queryByText('kimi-k3.1 已上线，模型选择器已同步刷新')).toBeNull();
  });

  it('活动任务轮询瞬时失败后会继续轮询直到终态', async () => {
    const pendingOperation = {
      operation_id: 'operation-retry-poll',
      candidate_fingerprint: 'fingerprint-ready',
      model_id: 'kimi-k3.1',
      status: 'pending',
    };
    const succeededOperation = { ...pendingOperation, status: 'succeeded' };
    fetchModelManagementSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce({ ...baseSnapshot, operations: [pendingOperation] })
      .mockRejectedValueOnce(new Error('网络瞬时中断'))
      .mockResolvedValueOnce({ ...baseSnapshot, operations: [succeededOperation] })
      .mockResolvedValue({ ...baseSnapshot, operations: [succeededOperation] });
    admitModelCandidateMock.mockResolvedValue(pendingOperation);
    refreshModelsMock.mockResolvedValue({ models: [], providers: [] });

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '上线 kimi-k3.1' }));
    fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '允许上线' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认上线' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refreshModelsMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refreshModelsMock).toHaveBeenCalledTimes(1);
  });

  it('同一候选有 running 操作时禁用重复上线', async () => {
    await renderLoaded({
      ...baseSnapshot,
      operations: [{
        operation_id: 'operation-running',
        candidate_fingerprint: 'fingerprint-ready',
        model_id: 'kimi-k3.1',
        status: 'running',
      }],
    });

    expect(screen.getByRole('button', { name: '正在上线 kimi-k3.1' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '上线 kimi-k3.1' })).toBeNull();
  });

  it('刷新页面看到历史成功任务时只展示状态，不触发新的目录同步或成功提示', async () => {
    const succeededOperation: ModelAdmissionOperation = {
      operation_id: 'operation-succeeded-before-mount',
      candidate_fingerprint: 'fingerprint-ready',
      model_id: 'kimi-k3.1',
      status: 'succeeded',
    };
    prepareLoadedSnapshot({ ...baseSnapshot, operations: [succeededOperation] });
    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');

    expect(screen.getByText('上线成功')).toBeInTheDocument();
    expect(refreshModelsMock).not.toHaveBeenCalled();
    expect(updateModelsMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Kimi K3\.1 已上线/)).toBeNull();
    expect(screen.queryByRole('button', { name: '上线 kimi-k3.1' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => expect(fetchModelManagementSnapshotMock).toHaveBeenCalledTimes(2));
    expect(refreshModelsMock).not.toHaveBeenCalled();
  });

  it('组件重挂后仍会同步本页发起且已完成的上线任务', async () => {
    const succeededOperation: ModelAdmissionOperation = {
      operation_id: 'operation-succeeded-after-remount',
      candidate_fingerprint: 'fingerprint-ready',
      model_id: 'kimi-k3.1',
      status: 'succeeded',
    };
    sessionStorage.setItem(
      MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY,
      JSON.stringify([succeededOperation.operation_id]),
    );
    prepareLoadedSnapshot({ ...baseSnapshot, operations: [succeededOperation] });
    refreshModelsMock.mockResolvedValue({ models: [], providers: [] });

    render(<ModelManagementPanel />);

    await waitFor(() => expect(refreshModelsMock).toHaveBeenCalledTimes(1));
    expect(updateModelsMock).toHaveBeenCalledWith([]);
    expect(sessionStorage.getItem(MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY)).toBeNull();
  });

  it('同轮询批次同时出现失败与成功任务时会全部消费并同步成功目录', async () => {
    const failedOperation: ModelAdmissionOperation = {
      operation_id: 'operation-failed-concurrent',
      candidate_fingerprint: 'fingerprint-ready',
      model_id: 'kimi-k3.1',
      status: 'failed',
      error_code: 'authorization_failed',
    };
    const succeededOperation: ModelAdmissionOperation = {
      operation_id: 'operation-succeeded-concurrent',
      candidate_fingerprint: 'fingerprint-waiting',
      model_id: 'gemini-next',
      status: 'succeeded',
    };
    sessionStorage.setItem(
      MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY,
      JSON.stringify([failedOperation.operation_id, succeededOperation.operation_id]),
    );
    prepareLoadedSnapshot({ ...baseSnapshot, operations: [failedOperation, succeededOperation] });
    refreshModelsMock.mockResolvedValue({ models: [], providers: [] });

    render(<ModelManagementPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('供应商授权校验失败');
    await waitFor(() => expect(refreshModelsMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('gemini-next 已上线');
    expect(sessionStorage.getItem(MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY)).toBeNull();
  });

  it('分批完成的并发上线任务会串行刷新目录并保持操作锁', async () => {
    const operationA: ModelAdmissionOperation = {
      operation_id: 'operation-staggered-a',
      candidate_fingerprint: 'fingerprint-ready',
      model_id: 'kimi-k3.1',
      status: 'pending',
    };
    const operationB: ModelAdmissionOperation = {
      operation_id: 'operation-staggered-b',
      candidate_fingerprint: 'fingerprint-waiting',
      model_id: 'gemini-next',
      status: 'pending',
    };
    const operationASucceeded = { ...operationA, status: 'succeeded' as const };
    const operationBSucceeded = { ...operationB, status: 'succeeded' as const };
    const pendingSnapshot = { ...baseSnapshot, operations: [operationA, operationB] };
    const firstCompletedSnapshot = {
      ...baseSnapshot,
      operations: [operationASucceeded, operationB],
    };
    const allCompletedSnapshot = {
      ...baseSnapshot,
      operations: [operationASucceeded, operationBSucceeded],
    };
    sessionStorage.setItem(
      MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY,
      JSON.stringify([operationA.operation_id, operationB.operation_id]),
    );
    let resolveInitialSnapshot!: (snapshot: ModelManagementSnapshot) => void;
    const initialSnapshot = new Promise<ModelManagementSnapshot>((resolve) => {
      resolveInitialSnapshot = resolve;
    });
    fetchModelManagementSnapshotMock
      .mockReturnValueOnce(initialSnapshot)
      .mockResolvedValueOnce(firstCompletedSnapshot)
      .mockResolvedValue(allCompletedSnapshot);

    let resolveFirstCatalog!: (catalog: { models: never[]; providers: never[] }) => void;
    const firstCatalog = new Promise<{ models: never[]; providers: never[] }>((resolve) => {
      resolveFirstCatalog = resolve;
    });
    refreshModelsMock
      .mockReturnValueOnce(firstCatalog)
      .mockResolvedValue({ models: [], providers: [] });

    render(<ModelManagementPanel />);
    vi.useFakeTimers();
    await act(async () => {
      resolveInitialSnapshot(pendingSnapshot);
      await initialSnapshot;
    });
    expect(screen.getByTestId('registered-model-count')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(refreshModelsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(refreshModelsMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '刷新' })).toBeDisabled();

    await act(async () => {
      resolveFirstCatalog({ models: [], providers: [] });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshModelsMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/目录刷新失败/)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('gemini-next 已上线');
    expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled();
    expect(sessionStorage.getItem(MODEL_MANAGEMENT_OWNED_OPERATIONS_STORAGE_KEY)).toBeNull();
  });

  it('并发刷新复用同一请求，写操作后的新快照不会被旧响应覆盖', async () => {
    let resolveOldRefresh!: (snapshot: ModelManagementSnapshot) => void;
    const oldRefresh = new Promise<ModelManagementSnapshot>((resolve) => {
      resolveOldRefresh = resolve;
    });
    const refreshedSnapshot: ModelManagementSnapshot = {
      ...baseSnapshot,
      models: baseSnapshot.models.map((model) => (
        model.model_id === 'kimi-k3' ? { ...model, selectable: false, state: 'hidden', revision: 8 } : model
      )),
    };
    fetchModelManagementSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockReturnValueOnce(oldRefresh)
      .mockResolvedValueOnce(refreshedSnapshot);
    updateModelVisibilityMock.mockResolvedValue({});
    refreshModelsMock.mockResolvedValue({ models: [], providers: [] });

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(fetchModelManagementSnapshotMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: '隐藏 Kimi K3' }));
    fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '临时维护' } });
    fireEvent.click(screen.getByRole('button', { name: '确认隐藏' }));

    expect(await screen.findByRole('button', { name: '恢复 Kimi K3' })).toBeInTheDocument();
    resolveOldRefresh(baseSnapshot);
    await act(async () => {
      await oldRefresh;
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: '恢复 Kimi K3' })).toBeInTheDocument();
    expect(fetchModelManagementSnapshotMock).toHaveBeenCalledTimes(3);
  });

  it('刷新页面看到历史失败任务时仅在候选列表展示，不弹出主动错误', async () => {
    await renderLoaded({
      ...baseSnapshot,
      operations: [{
        operation_id: 'operation-failed-before-mount',
        candidate_fingerprint: 'fingerprint-ready',
        model_id: 'kimi-k3.1',
        status: 'failed',
        error_code: 'authorization_failed',
      }],
    });

    expect(screen.getByText('供应商授权校验失败，请确认服务配置后重试')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(refreshModelsMock).not.toHaveBeenCalled();
  });

  it('需要人工清理的失败任务展示处置提示且禁止普通重试', async () => {
    await renderLoaded({
      ...baseSnapshot,
      operations: [{
        operation_id: 'operation-manual-cleanup',
        candidate_fingerprint: 'fingerprint-ready',
        model_id: 'kimi-k3.1',
        status: 'failed',
        error_code: 'rollback_key_failed',
        writes_performed: true,
        compensation: {
          attempted: true,
          key_restored: false,
          model_deleted: true,
          catalog_invalidated: true,
          model_ownership_unverified: false,
          manual_cleanup_required: true,
          errors: ['rollback_key_failed'],
        },
      }],
    });

    expect(screen.getByText(/需要人工清理/)).toHaveTextContent('rollback_key_failed');
    expect(screen.queryByRole('button', { name: '上线 kimi-k3.1' })).toBeNull();
  });

  it('轮询到上线失败后展示安全错误且允许重试', async () => {
    const pendingOperation = {
      operation_id: 'operation-3',
      candidate_fingerprint: 'fingerprint-ready',
      model_id: 'kimi-k3.1',
      status: 'pending',
    };
    const failedOperation = {
      ...pendingOperation,
      status: 'failed',
      error_code: 'authorization_failed',
    };
    fetchModelManagementSnapshotMock
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce({ ...baseSnapshot, operations: [pendingOperation] })
      .mockResolvedValue({ ...baseSnapshot, operations: [failedOperation] });
    admitModelCandidateMock.mockResolvedValue(pendingOperation);

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '上线 kimi-k3.1' }));
    fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '允许上线' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认上线' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getAllByText('供应商授权校验失败，请确认服务配置后重试').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '上线 kimi-k3.1' })).toBeEnabled();
    expect(refreshModelsMock).not.toHaveBeenCalled();
  });

  it('操作失败时保留可见错误', async () => {
    prepareLoadedSnapshot();
    updateModelVisibilityMock.mockRejectedValue(new Error('revision 已变化'));

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    fireEvent.click(screen.getByRole('button', { name: '隐藏 Kimi K3' }));
    fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '临时隐藏' } });
    fireEvent.click(screen.getByRole('button', { name: '确认隐藏' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('revision 已变化');
  });

  it('403 时安全降级，不泄露管理数据', async () => {
    fetchModelManagementSnapshotMock.mockRejectedValue(
      new ApiError('FORBIDDEN', '只有管理员可以访问', 'request-1'),
    );

    render(<ModelManagementPanel />);

    expect(await screen.findByText('当前账号无权访问模型管理')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('当前账号无权访问模型管理');
    expect(screen.queryByText('已注册模型')).toBeNull();
    expect(screen.queryByRole('button', { name: /上线|隐藏|恢复/ })).toBeNull();
  });

  it('鉴权刷新瞬时失败时保留重试入口，不误判为永久无权限', async () => {
    fetchModelManagementSnapshotMock.mockRejectedValue(
      new ApiError('AUTH_REFRESH_UNAVAILABLE', '登录状态刷新暂时失败，请稍后重试', ''),
    );

    render(<ModelManagementPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('登录状态刷新暂时失败');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(screen.queryByText('当前账号无权访问模型管理')).toBeNull();
  });

  it('操作请求进行中时禁用确认与其他管理动作', async () => {
    let resolveAction!: () => void;
    const pendingAction = new Promise<void>((resolve) => {
      resolveAction = resolve;
    });
    prepareLoadedSnapshot();
    updateModelVisibilityMock.mockReturnValue(pendingAction);
    refreshModelsMock.mockResolvedValue({ models: [], providers: [] });

    render(<ModelManagementPanel />);
    await screen.findByTestId('registered-model-count');
    fireEvent.click(screen.getByRole('button', { name: '隐藏 Kimi K3' }));
    fireEvent.change(screen.getByLabelText('操作原因'), { target: { value: '维护' } });
    fireEvent.click(screen.getByRole('button', { name: '确认隐藏' }));

    expect(screen.getByRole('button', { name: '处理中' })).toBeDisabled();
    resolveAction();
    fireEvent.click(document.body);
  });
});
