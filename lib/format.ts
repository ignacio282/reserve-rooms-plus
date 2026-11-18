/** Formats part/total as a whole-number percentage, e.g. 7 of 10 -> "70%". */
export function formatPercent(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = timeFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true });
    timeFormatters.set(timeZone, f);
  }
  return f;
}

/** "2:00 PM" in the library's timezone. */
export function formatTime(instant: Date, timeZone: string): string {
  return timeFormatter(timeZone).format(instant).replace(/\u202f/g, " ");
}

/** "2:00-3:00 PM", or "11:30 AM-12:30 PM" when the range crosses noon. */
export function formatTimeRange(start: Date, end: Date, timeZone: string): string {
  const a = formatTime(start, timeZone);
  const b = formatTime(end, timeZone);
  const [aTime, aPeriod] = a.split(" ");
  const [, bPeriod] = b.split(" ");
  return aPeriod === bPeriod ? `${aTime}-${b}` : `${a}-${b}`;
}

/** "Wed, Nov 18" for a `YYYY-MM-DD` date. */
export function formatDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
