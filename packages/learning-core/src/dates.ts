/**
 * Timezone-safe local date helpers.
 *
 * All scheduling uses *local* calendar dates formatted as "YYYY-MM-DD".
 * We never parse an ISO date string with `new Date("YYYY-MM-DD")` for arithmetic,
 * because that interprets the value as UTC and can shift the day in negative
 * UTC offsets. Dates are built from local components only.
 */

export type IsoDate = string; // YYYY-MM-DD

const pad = (n: number): string => String(n).padStart(2, '0');

/** Today's date in the user's local timezone. */
export function todayLocal(now: Date = new Date()): IsoDate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Build a local Date at noon from an ISO date (noon avoids DST edge cases). */
export function isoToDate(iso: IsoDate): Date {
  const [y, m, d] = iso.split('-').map((p) => Number(p));
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function dateToIso(date: Date): IsoDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Add (or subtract) whole days to an ISO date. */
export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + days);
  return dateToIso(d);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  const ms = isoToDate(to).getTime() - isoToDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** True when `due` is on or before `today` (i.e. the item is due). */
export function isDue(due: IsoDate, today: IsoDate): boolean {
  return due <= today;
}

/** The last `count` ISO dates ending on `end` (inclusive), oldest first. */
export function lastNDates(end: IsoDate, count: number): IsoDate[] {
  const out: IsoDate[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

/** Human weekday label for an ISO date (stable, English). */
export function weekdayLabel(iso: IsoDate): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][isoToDate(iso).getDay()];
}

/** Human month/day label for an ISO date, e.g. "Nov 12". */
export function shortDateLabel(iso: IsoDate): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = isoToDate(iso);
  return `${months[d.getMonth()]} ${d.getDate()}`;
}
