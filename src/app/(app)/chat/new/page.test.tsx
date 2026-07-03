import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  appState,
  dispatchMock,
  pathnameMock,
  routerPushMock,
  routerReplaceMock,
  searchParamsGetMock,
  sendMessageMock,
} = vi.hoisted(() => ({
  appState: {
    models: {
      models: [
        { id: 'model-1', enabled: true },
        { id: 'model-2', enabled: false },
      ],
      selectedModelId: null,
    },
  },
  dispatchMock: vi.fn(),
  pathnameMock: vi.fn(),
  routerPushMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  searchParamsGetMock: vi.fn(),
  sendMessageMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
  }),
  useSearchParams: () => ({
    get: searchParamsGetMock,
  }),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock('@/hooks/useSendMessage', () => ({
  useSendMessage: () => ({
    sendMessage: sendMessageMock,
  }),
}));

vi.mock('@/components/home/HomePage', () => ({
  default: function MockHomePage({
    onNewChat,
    onSendMessage,
  }: {
    onNewChat: () => void;
    onSendMessage: (content: string) => void;
  }) {
    return (
      <div>
        <button type="button" onClick={() => onSendMessage('示例问题')}>
          示例问题
        </button>
        <button type="button" onClick={onNewChat}>
          新建对话
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/chat/ChatInput', () => ({
  default: function MockChatInput({
    onSendMessage,
  }: {
    onSendMessage: (content: string, attachments?: unknown[], pendingConversationId?: string) => void;
  }) {
    return (
      <div>
        <button type="button" onClick={() => onSendMessage('输入框消息')}>
          输入框发送
        </button>
        <button
          type="button"
          onClick={() =>
            onSendMessage(
              '带文件的输入框消息',
              [
                {
                  fileId: 'file-1',
                  filename: 'clipboard.png',
                  mimeType: 'image/png',
                  previewUrl: 'blob:preview',
                },
              ],
              'pending-upload-conv'
            )
          }
        >
          输入框带文件发送
        </button>
      </div>
    );
  },
}));

import NewChatPage from './page';

describe('NewChatPage', () => {
  beforeEach(() => {
    dispatchMock.mockClear();
    pathnameMock.mockReturnValue('/chat/new');
    routerPushMock.mockClear();
    routerReplaceMock.mockClear();
    searchParamsGetMock.mockReset();
    searchParamsGetMock.mockReturnValue(null);
    sendMessageMock.mockReset();
    sendMessageMock.mockResolvedValue(undefined);
  });

  it('点击首页示例问题时发送草稿并只在 materialized 后跳转服务端会话', async () => {
    sendMessageMock.mockImplementation((_content, options) => {
      options.onDraftCreated('draft-conv');
      options.onMaterialized('server-conv');
      return Promise.resolve();
    });

    render(<NewChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '示例问题' }));

    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(1));
    expect(sendMessageMock).toHaveBeenCalledWith(
      '示例问题',
      expect.objectContaining({
        conversationId: null,
        isDraft: true,
      }),
      undefined
    );
    expect(routerReplaceMock).toHaveBeenCalledTimes(1);
    expect(routerReplaceMock).toHaveBeenCalledWith('/chat/server-conv');
  });

  it('新建页带文件发送时复用上传使用的 pending 会话 ID', async () => {
    sendMessageMock.mockImplementation((_content, options) => {
      options.onMaterialized('pending-upload-conv');
      return Promise.resolve();
    });

    render(<NewChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '输入框带文件发送' }));

    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(1));
    expect(sendMessageMock).toHaveBeenCalledWith(
      '带文件的输入框消息',
      expect.objectContaining({
        conversationId: 'pending-upload-conv',
        isDraft: true,
      }),
      [
        expect.objectContaining({
          fileId: 'file-1',
          filename: 'clipboard.png',
          mimeType: 'image/png',
        }),
      ]
    );
    expect(routerReplaceMock).toHaveBeenCalledWith('/chat/pending-upload-conv');
  });

  it('把有效 model query 作为初始模型 hint 派发一次', async () => {
    searchParamsGetMock.mockImplementation((key: string) => (key === 'model' ? 'model-1' : null));

    render(<NewChatPage />);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'models/setSelectedModel',
        payload: 'model-1',
      });
    });
  });

  it('忽略 legacy new query，不读取 searchParams.new', () => {
    searchParamsGetMock.mockImplementation((key: string) => (key === 'new' ? 'true' : null));

    render(<NewChatPage />);

    expect(searchParamsGetMock).not.toHaveBeenCalledWith('new');
  });
});
