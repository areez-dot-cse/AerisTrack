// Display helpers shared by views, exports and the explanation text.

// '2026-11-14' -> '14 Nov' (year added only when it differs from today's year).
export function formatDate(dateStr, { today, months }) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  const text = `${day} ${months[month - 1]}`;
  const currentYear = Number((today ?? '').slice(0, 4));
  return year === currentYear ? text : `${text} ${year}`;
}

export function formatDateTime(value, opts) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  const iso = local.toISOString().slice(0, 10);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(iso, opts)} ${hh}:${mm}`;
}

export function formatQty(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('en-GB');
}

// ISO week label such as '2026-W47' for the ship-week filter and the export filename.
export function isoWeek(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const day = date.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  date.setUTCDate(date.getUTCDate() + 4 - day); // Thursday of this week decides the year
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function percent(done, target) {
  if (!target) return 0;
  return Math.min(100, Math.round((done / target) * 100));
}
