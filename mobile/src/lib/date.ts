/** Date helpers that stay in the device's local calendar day. */

export function toISODate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function formatDayLabel(iso: string): string {
  const today = toISODate();
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  if (iso === addDays(today, 1)) return 'Tomorrow';

  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Formats an ISO timestamp or date string as a short date. */
export function formatShortDate(value: string | null): string {
  if (!value) return '—';
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

export function daysSince(value: string | null): number | null {
  if (!value) return null;
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y!, m! - 1, d!).getTime();
  const now = new Date(new Date().toDateString()).getTime();
  return Math.round((now - then) / 86_400_000);
}

/** Rounds to at most `places` decimals and drops trailing zeroes. */
export function num(value: string | number | null | undefined, places = 0): string {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(parsed)) return '—';
  return String(Number(parsed.toFixed(places)));
}
