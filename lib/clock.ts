/** The shared library clock: real time shifted by the library's clock offset. */
export function libraryNow(realNowMs: number, clockOffsetSeconds: number): Date {
  return new Date(realNowMs + clockOffsetSeconds * 1000);
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day);
  // Two passes settle the offset when midnight sits near a DST change.
  let utc = guess - offsetMs(new Date(guess), timeZone);
  utc = guess - offsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/** Local midnight to the next local midnight, as UTC instants, for the day containing `instant`. */
export function libraryDayBounds(instant: Date, timeZone: string): { start: Date; end: Date } {
  const { year, month, day } = zonedParts(instant, timeZone);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: localMidnightUtc(year, month, day, timeZone),
    end: localMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The library-local calendar date of an instant, as `YYYY-MM-DD`. */
export function libraryDateString(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The library-local wall time of an instant, as `HH:MM` (24-hour). */
export function libraryTimeString(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Converts a library-local date and time to a UTC instant. A time skipped by a
 * spring-forward change moves forward (02:30 becomes 03:30); a repeated time in
 * a fall-back change resolves to its first occurrence.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const halfDay = 12 * 3_600_000;
  const before = guess - offsetMs(new Date(guess - halfDay), timeZone);
  const after = guess - offsetMs(new Date(guess + halfDay), timeZone);
  const matches = (utc: number) => libraryTimeString(new Date(utc), timeZone) === `${pad(hh)}:${pad(mm)}`;
  if (matches(before)) return new Date(before);
  if (matches(after)) return new Date(after);
  return new Date(before);
}
