import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatLoadingSurface from './ChatLoadingSurface';

describe('ChatLoadingSurface', () => {
  it('renders a blank chat placeholder without fake content or generic loading copy', () => {
    render(<ChatLoadingSurface />);

    expect(screen.getByTestId('chat-loading-surface')).toBeTruthy();
    expect(screen.queryByTestId('chat-loading-user-bubble')).toBeNull();
    expect(screen.queryByTestId('chat-loading-assistant-card')).toBeNull();
    expect(screen.queryByText('初始化中...')).toBeNull();
    expect(screen.queryByText('加载中...')).toBeNull();
    expect(screen.queryByText('正在恢复这段对话')).toBeNull();
  });

  it('renders a blank app placeholder without fake conversation rows', () => {
    render(<ChatLoadingSurface variant="app-shell" />);

    expect(screen.getByTestId('chat-loading-app-shell')).toBeTruthy();
    expect(screen.queryByTestId('chat-loading-sidebar-row')).toBeNull();
  });
});
