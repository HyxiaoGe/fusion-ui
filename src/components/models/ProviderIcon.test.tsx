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
    render(<ProviderIcon providerId="gemini" />);

    expect(screen.getByTestId('provider-image')).toHaveAttribute('src', '/assets/providers/google.svg');
  });

  it('未知 provider 显示可见兜底，不让图标区域空白', () => {
    render(<ProviderIcon providerId="openrouter" />);

    expect(screen.getByText('O')).toBeInTheDocument();
  });
});
