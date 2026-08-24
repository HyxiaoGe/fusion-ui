'use client';

import { AlertTriangle, History, RefreshCw, Scissors, ShieldAlert } from 'lucide-react';

export interface TrajectoryIntegrityBannerProps {
  truncated?: boolean;
  runsTruncated?: boolean;
  trajectoryStatus?: string | null;
  reconciliationStatus?: string | null;
  conflictCount?: number;
}

interface IntegrityNotice {
  kind: 'truncated' | 'degraded' | 'legacy' | 'reconciling' | 'conflict';
  text: string;
  icon: typeof AlertTriangle;
}

export function TrajectoryIntegrityBanner({
  truncated = false,
  runsTruncated = false,
  trajectoryStatus = null,
  reconciliationStatus = null,
  conflictCount = 0,
}: TrajectoryIntegrityBannerProps) {
  const notices: IntegrityNotice[] = [];

  if (truncated || runsTruncated || trajectoryStatus === 'truncated') {
    notices.push({
      kind: 'truncated',
      text: '当前仅展示有界轨迹，部分记录已截断',
      icon: Scissors,
    });
  }
  if (trajectoryStatus === 'degraded') {
    notices.push({
      kind: 'degraded',
      text: '部分轨迹记录不可用，以下内容可能不完整',
      icon: AlertTriangle,
    });
  }
  if (trajectoryStatus === 'legacy') {
    notices.push({
      kind: 'legacy',
      text: '该历史运行未记录详细轨迹',
      icon: History,
    });
  }
  if (reconciliationStatus === 'reconciling') {
    notices.push({
      kind: 'reconciling',
      text: '正在与持久化记录对账',
      icon: RefreshCw,
    });
  }
  const normalizedConflictCount = Math.max(0, Math.floor(conflictCount));
  if (normalizedConflictCount > 0 || reconciliationStatus === 'conflict') {
    notices.push({
      kind: 'conflict',
      text: normalizedConflictCount > 0
        ? `检测到 ${normalizedConflictCount} 处实时与持久化记录冲突，已采用持久化版本`
        : '检测到实时与持久化记录冲突，已采用持久化版本',
      icon: ShieldAlert,
    });
  }

  if (notices.length === 0) return null;

  return (
    <div
      role="status"
      aria-label="轨迹完整性状态"
      aria-live="polite"
      className="sticky top-0 z-20 border-b border-warn/30 bg-background/95 px-3 py-2 shadow-sm backdrop-blur"
    >
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {notices.map(notice => {
          const Icon = notice.icon;
          return (
            <li key={notice.kind} className="flex items-center gap-1.5 text-xs text-foreground">
              <Icon
                data-testid={`integrity-icon-${notice.kind}`}
                className="h-4 w-4 shrink-0 text-warn"
                aria-hidden="true"
              />
              <span>{notice.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
