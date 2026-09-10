// 数字与时间格式化

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** 1.2K / 3.4M 这种紧凑格式 */
export function formatNumber(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '∞';
  if (n === 0) return '0';
  if (n < 0) return '-' + formatNumber(-n, decimals);
  if (n < 1000) {
    return Number.isInteger(n) ? String(n) : n.toFixed(decimals);
  }

  const magnitude = Math.floor(Math.log10(n));
  const idx = Math.floor(magnitude / 3);
  if (idx >= SUFFIXES.length) return n.toExponential(decimals);

  const scaled = n / Math.pow(1000, idx);
  return `${scaled.toFixed(decimals)}${SUFFIXES[idx]}`;
}

/** 每秒速率，带正负号 */
export function formatRate(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '∞';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}`;
}

/** 秒 → 1m 23s */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** 百分比 */
export function formatPercent(n: number, decimals = 0): string {
  return `${(n * 100).toFixed(decimals)}%`;
}
