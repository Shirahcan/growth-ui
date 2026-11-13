/** Month and day helpers for the Plan views, on Intl only (no date library in the package). */

export function thisMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + by, 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];

  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

/** "Nov 20, 2026" for a Y-m-d date, read as a calendar day (never shifted by a time zone). */
export function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number) as [number, number, number];

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(y, m - 1, d));
}

/** The local calendar day of a moment, as Y-m-d. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Every day the month's grid shows, Monday first, whole weeks. */
export function calendarDays(month: string): Array<{ key: string; day: number; inMonth: boolean }> {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));

  const days: Array<{ key: string; day: number; inMonth: boolean }> = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push({ key: localDay(d), day: d.getDate(), inMonth: d.getMonth() === m - 1 });
  }

  return days;
}

/** "in 5 hours" / "3 days ago", from now. */
export function fromNow(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [['day', 86400], ['hour', 3600], ['minute', 60]];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }

  return rtf.format(seconds, 'second');
}
