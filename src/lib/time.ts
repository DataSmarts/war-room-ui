const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "2h ago" — coarse on purpose. A top bar wants the order of magnitude; the exact instant
 * belongs in a title attribute, where it can be read without being read wrong.
 */
export function relativeTime(at: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - at.getTime()) / 1000);
  // The database's clock and this process's clock are not the same clock. A few seconds of
  // skew should read as "just now", never as a timestamp from the future.
  if (seconds < MINUTE) return "just now";
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m ago`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h ago`;
  return `${Math.floor(seconds / DAY)}d ago`;
}

/**
 * "2h" — the same coarse answer, in the words a 47px rail has room for.
 *
 * Deliberately not derived from `relativeTime`, and not the other way round: "just now" and
 * "now" do not compose, and a `.replace(" ago", "")` would hide a rendering decision inside a
 * string. What keeps the two from drifting is `time.test.ts`, which asserts they pick the same
 * unit at every boundary — the same mechanism `schema:check` uses on the SQL and TS predicates.
 */
export function compactRelativeTime(at: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - at.getTime()) / 1000);
  if (seconds < MINUTE) return "now";
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`;
  return `${Math.floor(seconds / DAY)}d`;
}

/**
 * The unambiguous form, for a title attribute. Every timestamp in this schema is
 * `timestamptz`, so ISO-8601 in UTC is the honest rendering — a localised string would
 * silently reinterpret the instant depending on who is looking.
 */
export function absoluteTime(at: Date): string {
  return at.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}
