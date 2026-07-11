import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/admin/AdminGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="admin-guard">{children}</div>,
}));

vi.mock('@/components/admin/AdminAuditCenter', () => ({
  default: () => <div>审计中心内容</div>,
}));

import AdminPage from './page';

describe('/admin', () => {
  it('使用独立管理员 guard 与页面，不装配普通聊天侧栏', () => {
    render(<AdminPage />);
    expect(screen.getByTestId('admin-guard')).toBeInTheDocument();
    expect(screen.getByText('审计中心内容')).toBeInTheDocument();
  });
});
