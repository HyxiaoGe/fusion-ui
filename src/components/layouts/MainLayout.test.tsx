import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MainLayout from './MainLayout';

const { useAppSelectorMock, usePathnameMock } = vi.hoisted(() => ({
  useAppSelectorMock: vi.fn(),
  usePathnameMock: vi.fn(),
}));

vi.mock('@/redux/hooks', () => ({
  useAppSelector: useAppSelectorMock,
  useAppDispatch: () => vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
}));

vi.mock('./Header', () => ({
  default: ({ title }: { title?: string }) => <div>{title || 'Header'}</div>,
}));

vi.mock('../ui/error-toast', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/auth/LoginDialog', () => ({
  LoginDialog: () => null,
}));

describe('MainLayout', () => {
  beforeEach(() => {
    useAppSelectorMock.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        theme: { mode: 'light' },
        settings: {},
        auth: { isAuthenticated: false, user: null },
      }),
    );
    usePathnameMock.mockReturnValue('/chat/test');
    document.documentElement.className = '';
  });

  const renderLayout = () =>
    render(
      <MainLayout sidebar={<div>Sidebar Content</div>} title="Header Title">
        <div>Main Content</div>
      </MainLayout>,
    );

  it('shows the sidebar behind a drawer toggle on narrow viewports', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });

    renderLayout();

    expect(screen.getByRole('button', { name: '打开对话侧栏' })).toBeTruthy();
    expect(screen.queryByText('Sidebar Content')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '打开对话侧栏' }));

    expect(screen.getByText('Sidebar Content')).toBeTruthy();
    expect(screen.getByRole('button', { name: '收起对话侧栏' })).toBeTruthy();
  });

  it('renders the sidebar inline on desktop viewports', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });

    renderLayout();

    expect(screen.queryByRole('button', { name: '打开对话侧栏' })).toBeNull();
    expect(screen.getByText('Sidebar Content')).toBeTruthy();
  });
});
