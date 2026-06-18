export function fmtNumber(n) {
  if (n === null || n === undefined) return '\u2014';
  const v = Number(n);
  if (!isFinite(v)) return '\u2014';
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

export function fmtFull(n) {
  if (n === null || n === undefined) return '\u2014';
  return Number(n).toLocaleString('en-US');
}

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

export function fmtTime(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

export function bucketLabel(row, bucket) {
  if (!row.timestamp) return `${fmtFull(row.block_start)}-${fmtFull(row.block_end)}`;
  const timestamp = Date.parse(row.timestamp);
  if (!Number.isFinite(timestamp)) return `${fmtFull(row.block_start)}-${fmtFull(row.block_end)}`;
  const day = new Date(timestamp).toISOString().slice(0, 10);
  return bucket === 'month' || bucket === 'year' ? day.slice(0, 7) : day;
}

export function shortError(message) {
  if (!message) return '';
  return message.length > 72 ? message.slice(0, 69) + '...' : message;
}

export function shortAddr(addr) {
  if (!addr) return '\u2014';
  return addr.slice(0, 8) + '\u2026' + addr.slice(-6);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

export function renderQueryValue(value) {
  if (value === null || value === undefined) return '<span class="dim-text">NULL</span>';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isInteger(value) ? fmtFull(value) : String(value);
  return escapeHtml(value);
}
