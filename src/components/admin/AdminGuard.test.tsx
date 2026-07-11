import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const useHasMountedMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/redux/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ auth: authState.current }),
}));

vi.mock('@/hooks/useHasMounted', () => ({
  useHasMounted: useHasMountedMock,
}));

import AdminGuard from './AdminGuard';

function setAuth(auth: Record<string, unknown>) {
  authState.current = auth;
}

describe('AdminGuard', () => {
  beforeEach(() => {
    authState.current = {};
    useHasMountedMock.mockReturnValue(true);
  });

  it('hydration 首帧即使客户端已预载管理员也只显示权限确认占位', () => {
    useHasMountedMock.mockReturnValue(false);
    setAuth({
      isAuthenticated: true,
      sessionResolved: true,
      status: 'succeeded',
      user: { is_superuser: true },
    });

    render(<AdminGuard><div>敏感内容</div></AdminGuard>);

    expect(screen.getByRole('status')).toHaveTextContent('正在确认管理员权限');
    expect(screen.queryByText('敏感内容')).toBeNull();
  });

  it('会话尚未定论时不泄露管理员内容或未登录终态', () => {
    setAuth({ isAuthenticated: false, sessionResolved: false, status: 'idle', user: null });
    render(<AdminGuard><div>敏感内容</div></AdminGuard>);

    expect(screen.getByRole('status')).toHaveTextContent('正在确认管理员权限');
    expect(screen.queryByText('敏感内容')).toBeNull();
    expect(screen.queryByText('请先登录')).toBeNull();
  });

  it('已定论未登录时显示登录提示', () => {
    setAuth({ isAuthenticated: false, sessionResolved: true, status: 'idle', user: null });
    render(<AdminGuard><div>敏感内容</div></AdminGuard>);

    expect(screen.getByText('请先登录后访问管理中心')).toBeInTheDocument();
  });

  it('profile 仍在加载时保持中性加载态', () => {
    setAuth({ isAuthenticated: true, sessionResolved: true, status: 'loading', user: { is_superuser: false } });
    render(<AdminGuard><div>敏感内容</div></AdminGuard>);

    expect(screen.getByRole('status')).toHaveTextContent('正在确认管理员权限');
    expect(screen.queryByText('无权访问')).toBeNull();
  });

  it('普通用户不能看到子内容', () => {
    setAuth({ isAuthenticated: true, sessionResolved: true, status: 'succeeded', user: { is_superuser: false } });
    render(<AdminGuard><div>敏感内容</div></AdminGuard>);

    expect(screen.getByText('无权访问管理中心')).toBeInTheDocument();
    expect(screen.queryByText('敏感内容')).toBeNull();
  });

  it('已确认管理员可以看到子内容', () => {
    setAuth({ isAuthenticated: true, sessionResolved: true, status: 'succeeded', user: { is_superuser: true } });
    render(<AdminGuard><div>敏感内容</div></AdminGuard>);

    expect(screen.getByText('敏感内容')).toBeInTheDocument();
  });
});
