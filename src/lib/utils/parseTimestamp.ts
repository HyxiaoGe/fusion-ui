export function parseTimestamp(ts: unknown): number {
  if (typeof ts === 'number') return ts;
  if (typeof ts !== 'string' || !ts) return 0;

  if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) {
    const date = new Date(ts);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  const date = new Date(ts.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
