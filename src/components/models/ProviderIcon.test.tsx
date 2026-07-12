import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ProviderIcon from './ProviderIcon';

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    onError,
  }: {
    alt: string;
    src: string;
    onError?: (event: { currentTarget: { style: { display: string } } }) => void;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      src={src}
      data-testid="provider-image"
      onError={() => onError?.({ currentTarget: { style: { display: '' } } })}
    />
  ),
}));

describe('ProviderIcon', () => {
  it('将常见 provider 别名映射到已有 svg 文件', () => {
    render(<ProviderIcon providerId="gemini" size={18} />);

    const image = screen.getByTestId('provider-image');
    expect(image).toHaveAttribute('src', '/assets/providers/google.svg');
    expect(image.parentElement).toHaveClass('inline-flex', 'items-center', 'justify-center');
    expect(image.parentElement).toHaveStyle({ width: '18px', height: '18px' });
  });

  it('未知 provider 显示可见兜底，不让图标区域空白', () => {
    render(<ProviderIcon providerId="openrouter" />);

    expect(screen.getByText('O')).toBeInTheDocument();
  });
});
