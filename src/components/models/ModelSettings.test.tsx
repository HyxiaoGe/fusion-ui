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

    const fetchMock = vi
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
            fields: [],
          },
          model_configuration: {
            params: [],
          },
        })
      );

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
});
