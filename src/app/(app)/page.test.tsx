import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  routerReplaceMock,
  routerPushMock,
  sendMessageMock,
  useAppSelectorMock,
  homePageMock,
  chatInputMock,
} = vi.hoisted(() => ({
  routerReplaceMock: vi.fn(),
  routerPushMock: vi.fn(),
  sendMessageMock: vi.fn(),
  useAppSelectorMock: vi.fn(),
  homePageMock: vi.fn(),
  chatInputMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routerReplaceMock,
    push: routerPushMock,
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock('@/redux/hooks', () => ({
  useAppSelector: useAppSelectorMock,
}));

vi.mock('@/hooks/useSendMessage', () => ({
  useSendMessage: () => ({
    sendMessage: sendMessageMock,
  }),
}));

vi.mock('@/components/home/HomePage', () => ({
  default: (props: any) => {
    homePageMock(props);
    return (
      <button type="button" onClick={() => props.onSendMessage('示例问题')}>
        示例问题
      </button>
    );
  },
}));

vi.mock('@/components/chat/ChatInput', () => ({
  default: (props: any) => {
    chatInputMock(props);
    return <div data-testid="chat-input" />;
  },
}));

import Home from './page';

describe('Home page 新对话发送体验', () => {
  beforeEach(() => {
    routerReplaceMock.mockClear();
    routerPushMock.mockClear();
    sendMessageMock.mockReset();
    homePageMock.mockClear();
    chatInputMock.mockClear();
    useAppSelectorMock.mockImplementation((selector) =>
      selector({
        models: {
          models: [
            {
              id: 'model-1',
              enabled: true,
            },
          ],
        },
      })
    );
  });

  it('首页示例发送后先进入本地草稿会话，再替换成服务端会话', () => {
    sendMessageMock.mockImplementation((_content: string, options: any) => {
      options.onDraftCreated('draft-conv');
      options.onMaterialized('server-conv');
    });

    render(<Home />);

    fireEvent.click(screen.getByRole('button', { name: '示例问题' }));

    expect(sendMessageMock).toHaveBeenCalledWith(
      '示例问题',
      expect.objectContaining({
        conversationId: null,
        isDraft: true,
      }),
      undefined
    );
    expect(routerReplaceMock.mock.calls).toEqual([
      ['/chat/draft-conv'],
      ['/chat/server-conv'],
    ]);
  });
});
