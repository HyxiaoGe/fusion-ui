import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const clientNavigationMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: clientNavigationMock }),
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} data-next-client-link="true">{children}</a>
  ),
}));

import AdminShell from './AdminShell';

describe('AdminShell', () => {
  it('通过普通链接硬导航返回聊天，使 document CSP 重新加载', () => {
    render(<AdminShell><div>审计内容</div></AdminShell>);

    const link = screen.getByRole('link', { name: '返回聊天' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/chat/new');
    expect(link).not.toHaveAttribute('data-next-client-link');
    expect(clientNavigationMock).not.toHaveBeenCalled();
  });
});
