import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatLoadingSurface from './ChatLoadingSurface';

describe('ChatLoadingSurface', () => {
  it('renders a chat-shaped skeleton without generic loading copy', () => {
    render(<ChatLoadingSurface />);

    expect(screen.getByTestId('chat-loading-surface')).toBeTruthy();
    expect(screen.getByTestId('chat-loading-user-bubble')).toBeTruthy();
    expect(screen.getByTestId('chat-loading-assistant-card')).toBeTruthy();
    expect(screen.queryByText('初始化中...')).toBeNull();
    expect(screen.queryByText('加载中...')).toBeNull();
    expect(screen.queryByText('正在恢复这段对话')).toBeNull();
  });

  it('can include an app shell for cold startup', () => {
    render(<ChatLoadingSurface variant="app-shell" />);

    expect(screen.getByTestId('chat-loading-app-shell')).toBeTruthy();
    expect(screen.getAllByTestId('chat-loading-sidebar-row')).toHaveLength(5);
  });
});
