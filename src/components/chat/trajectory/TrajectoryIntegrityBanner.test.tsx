import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrajectoryIntegrityBanner } from './TrajectoryIntegrityBanner';

describe('TrajectoryIntegrityBanner', () => {
  it.each([
    [{ truncated: true }, '当前仅展示有界轨迹，部分记录已截断', 'truncated'],
    [{ trajectoryStatus: 'degraded' }, '部分轨迹记录不可用，以下内容可能不完整', 'degraded'],
    [{ trajectoryStatus: 'legacy' }, '该历史运行未记录详细轨迹', 'legacy'],
    [{ reconciliationStatus: 'reconciling' }, '正在与持久化记录对账', 'reconciling'],
    [{ conflictCount: 2 }, '检测到 2 处实时与持久化记录冲突，已采用持久化版本', 'conflict'],
  ] as const)('用文字和图标明示 %s', (props, expectedText, expectedKind) => {
    render(<TrajectoryIntegrityBanner {...props} />);

    const banner = screen.getByRole('status', { name: '轨迹完整性状态' });
    expect(within(banner).getByText(expectedText)).toBeInTheDocument();
    expect(within(banner).getByTestId(`integrity-icon-${expectedKind}`)).toBeInTheDocument();
    expect(banner).toHaveClass('sticky', 'top-0');
  });

  it('同时保留截断、降级、对账与冲突，不让次要异常被颜色覆盖', () => {
    render(
      <TrajectoryIntegrityBanner
        truncated
        trajectoryStatus="degraded"
        reconciliationStatus="reconciling"
        conflictCount={1}
      />,
    );

    const banner = screen.getByRole('status', { name: '轨迹完整性状态' });
    expect(within(banner).getAllByRole('listitem')).toHaveLength(4);
    expect(within(banner).getByText(/已截断/)).toBeInTheDocument();
    expect(within(banner).getByText(/可能不完整/)).toBeInTheDocument();
    expect(within(banner).getByText(/正在.*对账/)).toBeInTheDocument();
    expect(within(banner).getByText(/1 处.*冲突/)).toBeInTheDocument();
  });

  it('完整且已对账时不占据粘性横幅层', () => {
    const { container } = render(
      <TrajectoryIntegrityBanner
        truncated={false}
        trajectoryStatus="complete"
        reconciliationStatus="ready"
        conflictCount={0}
      />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
