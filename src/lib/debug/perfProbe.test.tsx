import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerfProbe, useRenderProbe } from './perfProbe';

function RenderProbeHarness() {
  useRenderProbe('Harness');
  return <div>content</div>;
}

describe('PerfProbe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    document.documentElement.dataset.fusionPerfProbeEnabled = 'false';
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    document.documentElement.dataset.fusionPerfProbeEnabled = 'false';
  });

  it('does not render by default', () => {
    render(<PerfProbe />);

    expect(screen.queryByTestId('fusion-perf-probe-data')).toBeNull();
    expect(document.documentElement.dataset.fusionPerfProbeEnabled).toBe('false');
  });

  it('renders hidden JSON data when enabled by query param', () => {
    window.history.replaceState({}, '', '/?perfProbe=1');

    render(<PerfProbe />);

    const data = screen.getByTestId('fusion-perf-probe-data');
    expect(data.getAttribute('type')).toBe('application/json');
    expect(document.documentElement.dataset.fusionPerfProbeEnabled).toBe('true');
    expect(JSON.parse(data.textContent || '{}')).toEqual(
      expect.objectContaining({
        longtaskCount: 0,
        layoutShiftCount: 0,
        renderCounts: {},
      })
    );
  });

  it('records component render events while enabled', async () => {
    window.history.replaceState({}, '', '/?perfProbe=1');

    render(
      <>
        <PerfProbe />
        <RenderProbeHarness />
      </>
    );

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    const data = screen.getByTestId('fusion-perf-probe-data');
    expect(JSON.parse(data.textContent || '{}')).toEqual(
      expect.objectContaining({
        renderCounts: expect.objectContaining({
          Harness: 1,
        }),
      })
    );
  });
});

