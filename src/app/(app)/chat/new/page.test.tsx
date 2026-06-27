import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/home/HomeChatSurface', () => ({
  default: () => <div data-testid="home-chat-surface" />,
}));

import NewChatPage from './page';

describe('NewChatPage', () => {
  it('渲染新建对话首页装配面', () => {
    render(<NewChatPage />);

    expect(screen.getByTestId('home-chat-surface')).toBeInTheDocument();
  });
});
