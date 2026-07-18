import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n';
import { LanguageToggle } from './language-toggle';

const { mountedState } = vi.hoisted(() => ({ mountedState: { value: true } }));

vi.mock('@/hooks/useHasMounted', () => ({
  useHasMounted: () => mountedState.value,
}));

describe('LanguageToggle', () => {
  beforeEach(async () => {
    mountedState.value = true;
    await i18n.changeLanguage('zh-CN');
    window.localStorage.removeItem('i18nextLng');
  });

  it('hydration 完成前渲染语言无关的稳定占位按钮', () => {
    mountedState.value = false;

    render(<LanguageToggle />);

    const button = screen.getByRole('button', { name: '语言 / Language' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveTextContent('中');
    expect(button).not.toHaveTextContent('EN');
  });

  afterEach(async () => {
    await i18n.changeLanguage('zh-CN');
    window.localStorage.removeItem('i18nextLng');
  });

  it('在中英文之间切换并持久化用户选择', async () => {
    render(<LanguageToggle />);

    const switchToEnglish = screen.getByRole('button', { name: '切换到英文' });
    expect(switchToEnglish).toHaveTextContent('中');

    fireEvent.click(switchToEnglish);

    const switchToChinese = await screen.findByRole('button', { name: 'Switch to Chinese' });
    expect(switchToChinese).toHaveTextContent('EN');
    await waitFor(() => expect(window.localStorage.getItem('i18nextLng')).toBe('en-US'));

    fireEvent.click(switchToChinese);

    expect(await screen.findByRole('button', { name: '切换到英文' })).toHaveTextContent('中');
    await waitFor(() => expect(window.localStorage.getItem('i18nextLng')).toBe('zh-CN'));
  });
});
