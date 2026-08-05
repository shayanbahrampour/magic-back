// Streaks and the activity calendar are measured in the user's local day, which
// for this app is Iran (Asia/Tehran). Iran abolished daylight saving in 2022, so
// the offset is a constant UTC+3:30 and we can compute day boundaries with plain
// arithmetic instead of pulling in a timezone library.

const TEHRAN_OFFSET_MINUTES = 210; // UTC+3:30
const DAY_MS = 24 * 60 * 60 * 1000;
const OFFSET_MS = TEHRAN_OFFSET_MINUTES * 60 * 1000;

// A monotonically increasing integer identifying the Tehran calendar day that a
// given instant falls on. Two instants on the same Tehran day share an index;
// consecutive days differ by exactly 1.
export function tehranDayIndex(date: Date = new Date()): number {
  return Math.floor((date.getTime() + OFFSET_MS) / DAY_MS);
}

// The UTC instant of Tehran-midnight for the given day index.
export function dayIndexToDate(index: number): Date {
  return new Date(index * DAY_MS - OFFSET_MS);
}

// The UTC instant of Tehran-midnight for the day the given instant falls on.
// This is the canonical value we store for "activity day" columns.
export function tehranDayStart(date: Date = new Date()): Date {
  return dayIndexToDate(tehranDayIndex(date));
}

// `YYYY-MM-DD` for the Tehran calendar day the given instant falls on. Note that
// a stored day-start is Tehran-midnight expressed in UTC, which always lands on
// the *previous* UTC date — so slicing its ISO string directly would be a day
// early. Shift by the offset first.
export function tehranDayKey(date: Date): string {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export { DAY_MS };
