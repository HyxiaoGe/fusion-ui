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

import ModelManagementPanel from './ModelManagementPanel';

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

  it('治理不可用时清晰降级且不提供候选上线动作', async () => {
    await renderLoaded({
      ...baseSnapshot,
      governance: {
        available: false,
        message: '治理产物暂不可读取',
      },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('治理产物暂不可读取');
    expect(screen.queryByRole('button', { name: /上线 kimi-k3\.1/ })).toBeNull();
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

  it('只有治理能力开启的 admission_ready 候选提供可用上线动作', async () => {
    await renderLoaded();

    expect(screen.getByRole('button', { name: '上线 kimi-k3.1' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '上线 gemini-next' })).toBeNull();
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

  it('刷新页面后首次看到已成功的上线任务时同步一次全局模型目录', async () => {
    const succeededOperation: ModelAdmissionOperation = {
      operation_id: 'operation-succeeded-before-mount',
      candidate_fingerprint: 'fingerprint-ready',
      model_id: 'kimi-k3.1',
      status: 'succeeded',
    };
    prepareLoadedSnapshot({ ...baseSnapshot, operations: [succeededOperation] });
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

    await waitFor(() => expect(refreshModelsMock).toHaveBeenCalledTimes(1));
    expect(updateModelsMock).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'kimi-k3.1', selectable: true, routable: true }),
    ]);
    expect(screen.queryByRole('button', { name: '上线 kimi-k3.1' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => expect(fetchModelManagementSnapshotMock).toHaveBeenCalledTimes(3));
    expect(refreshModelsMock).toHaveBeenCalledTimes(1);
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

    expect(await screen.findByRole('status')).toHaveTextContent('当前账号无权访问模型管理');
    expect(screen.queryByText('已注册模型')).toBeNull();
    expect(screen.queryByRole('button', { name: /上线|隐藏|恢复/ })).toBeNull();
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
