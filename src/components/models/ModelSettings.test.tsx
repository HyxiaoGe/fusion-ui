import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  currentState,
  dispatchMock,
  useAppDispatchMock,
  useAppSelectorMock,
  fetchWithAuthMock,
  refreshModelsMock,
  toastMock,
  triggerLoginDialogMock,
  setModelEnabledMock,
  updateModelsStateMock,
} = vi.hoisted(() => {
  const action = (type: string) => vi.fn((payload?: unknown) => ({ type, payload }));

  return {
    currentState: {
      models: {
        providers: [{ id: 'qwen', name: '通义千问', order: 1 }],
      },
      auth: {
        isAuthenticated: false,
      },
    } as any,
    dispatchMock: vi.fn(),
    useAppDispatchMock: vi.fn(),
    useAppSelectorMock: vi.fn(),
    fetchWithAuthMock: vi.fn(),
    refreshModelsMock: vi.fn(),
    toastMock: vi.fn(),
    triggerLoginDialogMock: vi.fn(),
    setModelEnabledMock: action('models/setModelEnabled'),
    updateModelsStateMock: action('models/updateModels'),
  };
});

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: useAppDispatchMock,
  useAppSelector: useAppSelectorMock,
}));

vi.mock('@/redux/slices/modelsSlice', () => ({
  setModelEnabled: setModelEnabledMock,
  updateModels: updateModelsStateMock,
}));

vi.mock('@/lib/api/fetchWithAuth', () => ({
  default: fetchWithAuthMock,
}));

vi.mock('@/lib/config/modelConfig', () => ({
  refreshModels: refreshModelsMock,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock('@/components/auth/LoginDialog', () => ({
  LoginDialog: ({ open }: { open: boolean }) =>
    React.createElement('div', {
      'data-testid': 'login-dialog',
      'data-open': open ? 'true' : 'false',
    }),
}));

import ModelSettings from './ModelSettings';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function mockModelFetches() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      jsonResponse({
        models: [
          {
            name: 'Qwen Max',
            modelId: 'qwen-max',
            provider: 'qwen',
            enabled: true,
            capabilities: {
              deepThinking: true,
            },
            description: 'desc',
          },
        ],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        name: 'Qwen Max',
        modelId: 'qwen-max',
        provider: 'qwen',
        knowledgeCutoff: '2026-01',
        capabilities: {
          deepThinking: true,
        },
        priority: 1,
        enabled: true,
        description: 'desc',
        auth_config: {
          auth_type: 'api_key',
          fields: [
            {
              name: 'api_key',
              display_name: 'API Key',
              type: 'password',
              required: true,
            },
          ],
        },
        model_configuration: {
          params: [],
        },
      })
    );
}

describe('ModelSettings', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    useAppDispatchMock.mockReturnValue(dispatchMock);
    useAppSelectorMock.mockImplementation(selector => selector(currentState));
    fetchWithAuthMock.mockReset();
    refreshModelsMock.mockReset();
    refreshModelsMock.mockResolvedValue([]);
    toastMock.mockReset();
    triggerLoginDialogMock.mockReset();
    setModelEnabledMock.mockClear();
    updateModelsStateMock.mockClear();
    currentState.models.providers = [{ id: 'qwen', name: '通义千问', order: 1 }];
    currentState.auth.isAuthenticated = false;
    vi.restoreAllMocks();
    vi.stubGlobal('triggerLoginDialog', triggerLoginDialogMock);
  });

  it('warns and triggers global login dialog when add-model modal is requested while logged out', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        models: [],
      })
    );

    render(<ModelSettings initialAddModelOpen />);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '请先登录后再添加自定义模型',
          type: 'warning',
        })
      );
      expect(triggerLoginDialogMock).toHaveBeenCalledTimes(1);
    });
  });

  it('updates model enabled status and dispatches store sync after toggle', async () => {
    currentState.auth.isAuthenticated = true;

    const fetchMock = mockModelFetches();

    fetchWithAuthMock
      .mockResolvedValueOnce(
        jsonResponse({
          credentials: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          name: 'Qwen Max',
          modelId: 'qwen-max',
          provider: 'qwen',
          knowledgeCutoff: '2026-01',
          capabilities: {
            deepThinking: true,
          },
          priority: 1,
          enabled: false,
          description: 'desc',
          auth_config: {
            auth_type: 'api_key',
            fields: [],
          },
          model_configuration: {
            params: [],
          },
        })
      );

    render(<ModelSettings modelId="qwen-max" />);

    const toggle = (await screen.findAllByRole('switch'))[0];
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/models/qwen-max'),
        expect.objectContaining({
          method: 'PUT',
        })
      );
      expect(setModelEnabledMock).toHaveBeenCalledWith({
        modelId: 'qwen-max',
        enabled: false,
      });
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'models/setModelEnabled',
        payload: {
          modelId: 'qwen-max',
          enabled: false,
        },
      });
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Qwen Max已停用',
          type: 'success',
        })
      );
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('tests credentials with the current form payload', async () => {
    currentState.auth.isAuthenticated = true;
    mockModelFetches();

    fetchWithAuthMock
      .mockResolvedValueOnce(
        jsonResponse({
          credentials: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          message: 'ok',
        })
      );

    render(<ModelSettings modelId="qwen-max" />);

    const apiKeyInput = await screen.findByPlaceholderText('请输入API Key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-test-1' } });
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/models/credentials/test'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            model_id: 'qwen-max',
            credentials: {
              api_key: 'sk-test-1',
            },
          }),
        })
      );
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '连接测试成功: ok',
          type: 'success',
        })
      );
    });
  });

  it('saves credentials and refreshes the credential list', async () => {
    currentState.auth.isAuthenticated = true;
    mockModelFetches();

    fetchWithAuthMock
      .mockResolvedValueOnce(
        jsonResponse({
          credentials: [],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 9,
          model_id: 'qwen-max',
          name: '默认',
          is_default: true,
          credentials: {
            api_key: 'sk-save-1',
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          credentials: [
            {
              id: 9,
              model_id: 'qwen-max',
              name: '默认',
              is_default: true,
              credentials: {
                api_key: 'sk-save-1',
              },
              created_at: '2026-03-13T00:00:00Z',
              updated_at: '2026-03-13T00:00:00Z',
            },
          ],
        })
      );

    render(<ModelSettings modelId="qwen-max" />);

    const apiKeyInput = await screen.findByPlaceholderText('请输入API Key');
    fireEvent.change(apiKeyInput, { target: { value: 'sk-save-1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存凭证' }));

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/api/models/qwen-max/credentials'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            model_id: 'qwen-max',
            name: '默认',
            is_default: true,
            credentials: {
              api_key: 'sk-save-1',
            },
          }),
        })
      );
      expect(fetchWithAuthMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('/api/models/qwen-max/credentials'),
        expect.objectContaining({
          method: 'GET',
        })
      );
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Qwen Max的凭证已保存',
          type: 'success',
        })
      );
    });
  });
});
