import assert from "node:assert/strict";
import { test } from "node:test";

import { absoluteTime, compactRelativeTime, relativeTime } from "./time.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const NOW = new Date("2026-09-03T12:00:00.000Z");

/** `at` is always expressed as "this long ago", which is how every caller reads it. */
function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

test("relativeTime is coarse, and its boundaries are where the unit changes", () => {
  assert.equal(relativeTime(ago(0), NOW), "just now");
  assert.equal(relativeTime(ago(MINUTE - 1000), NOW), "just now");
  assert.equal(relativeTime(ago(MINUTE), NOW), "1m ago");
  assert.equal(relativeTime(ago(HOUR - 1000), NOW), "59m ago");
  assert.equal(relativeTime(ago(HOUR), NOW), "1h ago");
  assert.equal(relativeTime(ago(DAY - 1000), NOW), "23h ago");
  assert.equal(relativeTime(ago(DAY), NOW), "1d ago");
  assert.equal(relativeTime(ago(9 * DAY), NOW), "9d ago");
});

test("compactRelativeTime says the same thing in the words a collapsed rail has room for", () => {
  assert.equal(compactRelativeTime(ago(0), NOW), "now");
  assert.equal(compactRelativeTime(ago(MINUTE - 1000), NOW), "now");
  assert.equal(compactRelativeTime(ago(MINUTE), NOW), "1m");
  assert.equal(compactRelativeTime(ago(HOUR - 1000), NOW), "59m");
  assert.equal(compactRelativeTime(ago(HOUR), NOW), "1h");
  assert.equal(compactRelativeTime(ago(DAY - 1000), NOW), "23h");
  assert.equal(compactRelativeTime(ago(DAY), NOW), "1d");
  assert.equal(compactRelativeTime(ago(9 * DAY), NOW), "9d");
});

/**
 * The rail renders one of these at 13rem and the other at 4.5rem, so a reader who resizes the
 * window must not see the answer change. This is the assertion that stops the two drifting.
 */
test("the two forms never disagree about the answer", () => {
  const offsets = [
    0,
    1000,
    MINUTE - 1,
    MINUTE,
    90 * 1000,
    HOUR - 1,
    HOUR,
    5 * HOUR,
    DAY - 1,
    DAY,
    3 * DAY,
    400 * DAY,
  ];
  for (const offset of offsets) {
    const at = ago(offset);
    const long = relativeTime(at, NOW);
    const short = compactRelativeTime(at, NOW);
    if (short === "now") {
      assert.equal(long, "just now", `at ${offset}ms`);
    } else {
      assert.equal(long, `${short} ago`, `at ${offset}ms`);
    }
  }
});

/**
 * The database's clock and this process's clock are not the same clock. A few seconds of skew
 * reads as the present, never as a timestamp from the future — in both renderings.
 */
test("clock skew reads as the present, not the future", () => {
  const ahead = new Date(NOW.getTime() + 5000);
  assert.equal(relativeTime(ahead, NOW), "just now");
  assert.equal(compactRelativeTime(ahead, NOW), "now");
});

test("absoluteTime is UTC, to the second, and says so", () => {
  assert.equal(absoluteTime(new Date("2026-09-03T12:34:56.789Z")), "2026-09-03 12:34:56Z");
  assert.equal(absoluteTime(new Date("2026-01-01T00:00:00.000Z")), "2026-01-01 00:00:00Z");
});
