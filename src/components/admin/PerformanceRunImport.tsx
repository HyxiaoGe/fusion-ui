'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { importAdminPerformanceRun } from '@/lib/api/adminAudit';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { PerformanceRunImportPayload } from '@/types/adminAudit';
import { isAdminAccessError } from '@/lib/admin/adminAccess';
import { parsePerformanceRunImport, PerformanceRunImportError } from '@/lib/admin/performanceRunImport';

export default function PerformanceRunImport({ onImported, onForbidden }: { onImported: () => void; onForbidden: () => void }) {
  const [raw, setRaw] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleImport = async () => {
    let candidate: PerformanceRunImportPayload;
    try {
      candidate = parsePerformanceRunImport(raw);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof PerformanceRunImportError ? error.message : '压测结果无法解析');
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const result = await importAdminPerformanceRun(candidate);
      setStatus('success');
      setMessage(result.created ? '压测结果已导入' : '压测记录已存在');
      setRaw('');
      onImported();
    } catch (error) {
      if (isAdminAccessError(error)) {
        onForbidden();
        return;
      }
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '压测结果导入失败');
    }
  };

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <h3 className="flex items-center gap-2 font-medium">
        <Upload className="h-4 w-4" aria-hidden="true" />
        导入压测安全汇总
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">只接受不含账号、令牌、正文和 conversation ID 清单的 JSON 汇总。</p>
      <label className="mt-3 block text-sm font-medium" htmlFor="performance-run-json">压测结果 JSON</label>
      <Textarea
        id="performance-run-json"
        value={raw}
        onChange={event => setRaw(event.target.value)}
        className="mt-2 min-h-40 font-mono text-xs"
        placeholder='支持 runner 原始 JSON，或 {"schema_version":1,"run_id":"...","environment":"prod","safe_summary":{}}'
      />
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={() => void handleImport()} disabled={!raw.trim() || status === 'loading'}>
          {status === 'loading' ? '正在导入…' : '导入压测结果'}
        </Button>
        {message ? (
          <span className={status === 'error' ? 'text-sm text-danger' : 'text-sm text-success'} role="status">
            {message}
          </span>
        ) : null}
      </div>
    </section>
  );
}
