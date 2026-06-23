"use client";

import React, { useEffect, useRef, useState } from "react";

type PerfProbeRenderEvent = {
  label: string;
  time: number;
};

type PerfProbeData = {
  enabledAt: string;
  url: string;
  longtasks: Array<{ name: string; startTime: number; duration: number }>;
  layoutShifts: Array<{ startTime: number; value: number; hadRecentInput: boolean }>;
  resources: Array<{
    name: string;
    initiatorType: string;
    startTime: number;
    duration: number;
    transferSize: number;
  }>;
  mutations: Array<{ time: number; count: number; added: number; removed: number }>;
  renders: PerfProbeRenderEvent[];
};

const STORAGE_KEY = "fusion:perf-probe";
const DATA_ELEMENT_ID = "fusion-perf-probe-data";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function getProbeEnabledFromLocation(): boolean {
  if (!isBrowser()) return false;

  const params = new URLSearchParams(window.location.search);
  const explicitValue = params.get("perfProbe");
  if (explicitValue === "1") {
    window.localStorage.setItem(STORAGE_KEY, "1");
    return true;
  }
  if (explicitValue === "0") {
    window.localStorage.removeItem(STORAGE_KEY);
    return false;
  }

  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function createInitialData(): PerfProbeData {
  return {
    enabledAt: new Date().toISOString(),
    url: window.location.href,
    longtasks: [],
    layoutShifts: [],
    resources: [],
    mutations: [],
    renders: [],
  };
}

function summarize(data: PerfProbeData) {
  const layoutShiftTotal = data.layoutShifts
    .filter((entry) => !entry.hadRecentInput)
    .reduce((sum, entry) => sum + entry.value, 0);
  const renderCounts = data.renders.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.label] = (acc[entry.label] ?? 0) + 1;
    return acc;
  }, {});
  const mutationSummary = data.mutations.reduce(
    (acc, entry) => ({
      batches: acc.batches + 1,
      events: acc.events + entry.count,
      added: acc.added + entry.added,
      removed: acc.removed + entry.removed,
    }),
    { batches: 0, events: 0, added: 0, removed: 0 }
  );
  const longtaskDurations = data.longtasks.map((entry) => entry.duration);
  const slowResources = data.resources
    .filter((entry) => entry.duration >= 500)
    .slice(-20)
    .map((entry) => ({
      ...entry,
      name: entry.name.replace(/^https?:\/\/[^/]+/, ""),
    }));

  return {
    enabledAt: data.enabledAt,
    url: window.location.href,
    capturedAt: new Date().toISOString(),
    longtaskCount: data.longtasks.length,
    longtaskTotalMs: longtaskDurations.reduce((sum, duration) => sum + duration, 0),
    longtaskMaxMs: longtaskDurations.length ? Math.max(...longtaskDurations) : 0,
    layoutShiftCount: data.layoutShifts.length,
    layoutShiftTotal,
    resourceCount: data.resources.length,
    slowResources,
    mutationSummary,
    renderCounts,
    recentRenders: data.renders.slice(-50),
    recentLongtasks: data.longtasks.slice(-20),
    recentLayoutShifts: data.layoutShifts.slice(-20),
  };
}

export function useRenderProbe(label: string): void {
  useEffect(() => {
    if (!isBrowser()) return;
    if (document.documentElement.dataset.fusionPerfProbeEnabled !== "true") return;

    window.dispatchEvent(
      new CustomEvent<PerfProbeRenderEvent>("fusion:perf-render", {
        detail: {
          label,
          time: getNow(),
        },
      })
    );
  });
}

export function PerfProbe() {
  const [enabled, setEnabled] = useState(false);
  const [summary, setSummary] = useState<string>("");
  const dataRef = useRef<PerfProbeData | null>(null);

  useEffect(() => {
    const shouldEnable = getProbeEnabledFromLocation();
    setEnabled(shouldEnable);
    document.documentElement.dataset.fusionPerfProbeEnabled = shouldEnable ? "true" : "false";

    if (!shouldEnable) {
      return;
    }

    const data = createInitialData();
    dataRef.current = data;
    const cleanupFns: Array<() => void> = [];

    const observePerformance = (
      type: string,
      handler: (entries: PerformanceEntry[]) => void
    ) => {
      try {
        if (typeof PerformanceObserver === "undefined") return;
        const observer = new PerformanceObserver((list) => {
          handler(list.getEntries());
        });
        observer.observe({ type, buffered: true });
        cleanupFns.push(() => observer.disconnect());
      } catch {
        // 某些浏览器不支持 longtask/layout-shift；探针保持静默降级。
      }
    };

    observePerformance("longtask", (entries) => {
      entries.forEach((entry) => {
        data.longtasks.push({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration,
        });
      });
    });

    observePerformance("layout-shift", (entries) => {
      entries.forEach((entry) => {
        const layoutShift = entry as PerformanceEntry & {
          value?: number;
          hadRecentInput?: boolean;
        };
        data.layoutShifts.push({
          startTime: entry.startTime,
          value: layoutShift.value ?? 0,
          hadRecentInput: Boolean(layoutShift.hadRecentInput),
        });
      });
    });

    observePerformance("resource", (entries) => {
      entries.forEach((entry) => {
        const resource = entry as PerformanceResourceTiming;
        data.resources.push({
          name: resource.name,
          initiatorType: resource.initiatorType,
          startTime: resource.startTime,
          duration: resource.duration,
          transferSize: resource.transferSize ?? 0,
        });
      });
    });

    const mutationObserver = new MutationObserver((mutations) => {
      data.mutations.push({
        time: getNow(),
        count: mutations.length,
        added: mutations.reduce((sum, mutation) => sum + mutation.addedNodes.length, 0),
        removed: mutations.reduce((sum, mutation) => sum + mutation.removedNodes.length, 0),
      });
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    cleanupFns.push(() => mutationObserver.disconnect());

    const handleRender = (event: Event) => {
      const detail = (event as CustomEvent<PerfProbeRenderEvent>).detail;
      if (!detail?.label) return;
      data.renders.push(detail);
    };
    window.addEventListener("fusion:perf-render", handleRender);
    cleanupFns.push(() => window.removeEventListener("fusion:perf-render", handleRender));

    const timer = window.setInterval(() => {
      setSummary(JSON.stringify(summarize(data), null, 2));
    }, 500);
    cleanupFns.push(() => window.clearInterval(timer));

    setSummary(JSON.stringify(summarize(data), null, 2));

    return () => {
      cleanupFns.forEach((cleanup) => cleanup());
      document.documentElement.dataset.fusionPerfProbeEnabled = "false";
    };
  }, []);

  if (!enabled) return null;

  return (
    <script
      id={DATA_ELEMENT_ID}
      type="application/json"
      data-testid={DATA_ELEMENT_ID}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: summary }}
    />
  );
}

