import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkState,
  isUuid,
  PLACES_TEXT_SEARCH_CAP,
  resultCount,
  RUN_STATE_VALUES,
  runStateOf,
  SWEEP_STANDING_VALUES,
  sweepStanding,
  webPresence,
  type CheckState,
  type ResultCount,
  type RunState,
  type SweepStanding,
  type WebPresence,
} from "./derive.ts";

/**
 * Table-driven, because every one of these functions is a small decision with a wrong answer
 * that looks right. A table makes the wrong answers visible beside the right ones — including
 * the ones nothing in the live database can currently produce.
 *
 * Runs on `node --test` with nothing but type stripping: no database, no bundler, no renderer.
 * The explicit `./derive.ts` extension is Node's ESM resolver, not a style choice — application
 * code stays extensionless.
 */

// --- runStateOf ------------------------------------------------------------------------------

const RUN_STATE_CASES: ReadonlyArray<{
  input: string | null | undefined;
  expected: RunState | null;
  why: string;
}> = [
  // The five the view emits. Only `completed` has rows in the database today, which is exactly
  // why the other four are asserted here rather than left to a live check to stumble across.
  { input: "completed", expected: "completed", why: "finished — even when error is set" },
  { input: "aborted", expected: "aborted", why: "the sweep stopped here and said why" },
  { input: "errored", expected: "errored", why: "this query failed; the sweep carried on" },
  { input: "running", expected: "running", why: "a page landed inside the window" },
  { input: "stalled", expected: "stalled", why: "no ending, no reason, nothing moved" },

  // Drift, in every shape it can arrive. All null: an unrecognised word is not a sixth state,
  // and repairing it here would hide the drift the schema chip exists to show.
  { input: "partial", expected: null, why: "007 removed this value; seeing it means drift" },
  { input: "Completed", expected: null, why: "the view emits lower case, exactly" },
  { input: "stalled ", expected: null, why: "no trimming — a stray byte is still drift" },
  { input: "", expected: null, why: "empty is not a state" },
  { input: null, expected: null, why: "a left join with no matching run_state row" },
  { input: undefined, expected: null, why: "a column that was not selected" },
];

test("runStateOf narrows the view's word, and refuses everything else", () => {
  for (const { input, expected, why } of RUN_STATE_CASES) {
    assert.equal(runStateOf(input), expected, `${JSON.stringify(input)} — ${why}`);
  }
});

test("every value the view can emit has a case above", () => {
  const covered = new Set(
    RUN_STATE_CASES.filter((c) => c.expected !== null).map((c) => c.expected),
  );
  assert.deepEqual([...covered].sort(), [...RUN_STATE_VALUES].sort());
});

// --- sweepStanding ---------------------------------------------------------------------------

/** Only the states a case cares about; the rest are nought. */
function runs(states: Partial<Record<RunState, number>>): Record<RunState, number> {
  return { completed: 0, aborted: 0, errored: 0, running: 0, stalled: 0, ...states };
}

const SWEEP_STANDING_CASES: ReadonlyArray<{
  states: Partial<Record<RunState, number>>;
  queries: number;
  expected: SweepStanding;
  why: string;
}> = [
  {
    states: { completed: 3 },
    queries: 3,
    expected: "settled",
    why: "every query completed — the only case that earns the word",
  },
  {
    states: { completed: 11, aborted: 1 },
    queries: 12,
    expected: "stopped",
    why: "an abort is terminal; the areas after it left no rows at all",
  },
  {
    states: { completed: 11, aborted: 1, running: 1 },
    queries: 13,
    expected: "stopped",
    why: "terminal outranks in-flight — the sweep stopped and said why",
  },
  {
    states: { completed: 11, running: 1 },
    queries: 12,
    expected: "in-flight",
    why: "a page landed inside the window, so no conclusion is final yet",
  },
  {
    states: { completed: 11, running: 1, errored: 1, stalled: 1 },
    queries: 14,
    expected: "in-flight",
    why: "still moving beats both a scar and a silence",
  },
  {
    states: { completed: 11, stalled: 1 },
    queries: 12,
    expected: "unknown",
    why: "no ending, no reason, nothing moved — we do not know whether it is over",
  },
  {
    states: { completed: 10, stalled: 1, errored: 1 },
    queries: 12,
    expected: "unknown",
    why: "absent knowledge outranks a query that failed and was carried past",
  },
  {
    states: { completed: 11, errored: 1 },
    queries: 12,
    expected: "degraded",
    why: "every query ended, one failed, the sweep carried on",
  },
  {
    states: { completed: 11 },
    queries: 12,
    expected: "unknown",
    why: "one run's state is a word we do not recognise — drift, not a twelfth completion",
  },
  {
    states: {},
    queries: 0,
    expected: "unknown",
    why: "cannot happen — and 'every query completed' over no queries is a claim about nothing",
  },
];

test("sweepStanding ranks five numbers into one word, and says so", () => {
  for (const { states, queries, expected, why } of SWEEP_STANDING_CASES) {
    assert.equal(
      sweepStanding(runs(states), queries),
      expected,
      `${JSON.stringify(states)} of ${queries} — ${why}`,
    );
  }
});

test("every standing a row can carry has a case above", () => {
  const covered = new Set(SWEEP_STANDING_CASES.map((c) => c.expected));
  assert.deepEqual([...covered].sort(), [...SWEEP_STANDING_VALUES].sort());
});

// --- resultCount -----------------------------------------------------------------------------

const RESULT_COUNT_CASES: ReadonlyArray<{
  input: number;
  expected: ResultCount;
  why: string;
}> = [
  {
    input: 60,
    expected: { kind: "saturated", atLeast: 60 },
    why: "the cap — the area holds MORE than this, never exactly this",
  },
  {
    input: 61,
    expected: { kind: "saturated", atLeast: 61 },
    why: "a floor that is somehow exceeded is still a floor",
  },
  { input: 59, expected: { kind: "counted", n: 59 }, why: "one short of the cap is a real count" },
  { input: 3, expected: { kind: "counted", n: 3 }, why: "just above thin" },
  { input: 2, expected: { kind: "thin", n: 2 }, why: "check the query wording, not the area" },
  { input: 0, expected: { kind: "thin", n: 0 }, why: "nothing came back at all" },
];

test("resultCount reads a full page as a ceiling, never a total", () => {
  for (const { input, expected, why } of RESULT_COUNT_CASES) {
    assert.deepEqual(resultCount(input), expected, `${input} — ${why}`);
  }
});

test("the cap is Google's, and the boundary sits on it", () => {
  assert.equal(PLACES_TEXT_SEARCH_CAP, 60);
  assert.equal(resultCount(PLACES_TEXT_SEARCH_CAP).kind, "saturated");
  assert.equal(resultCount(PLACES_TEXT_SEARCH_CAP - 1).kind, "counted");
});

// --- webPresence -----------------------------------------------------------------------------

const WEB_PRESENCE_CASES: ReadonlyArray<{
  uri: string | null;
  domain: string | null;
  expected: WebPresence;
  why: string;
}> = [
  {
    uri: "https://thereinerlaw.com/",
    domain: "thereinerlaw.com",
    expected: "site",
    why: "a site of its own",
  },
  {
    uri: "https://linktr.ee/somefirm",
    domain: null,
    expected: "off-platform",
    why: "a page on someone else's platform is NOT 'no website'",
  },
  {
    uri: "https://www.facebook.com/somefirm",
    domain: null,
    expected: "off-platform",
    why: "the writing tool nulls the domain for shared-platform hosts",
  },
  { uri: null, domain: null, expected: "none", why: "no web presence at all" },
  {
    uri: null,
    domain: "orphan.example",
    expected: "none",
    why: "cannot happen — and if it did, there is still nothing to link to",
  },
];

test("webPresence keeps the third state the schema went to trouble to record", () => {
  for (const { uri, domain, expected, why } of WEB_PRESENCE_CASES) {
    assert.equal(webPresence(uri, domain), expected, `${uri} / ${domain} — ${why}`);
  }
});

// --- checkState ------------------------------------------------------------------------------

const CHECKED_AT = new Date("2026-08-30T23:19:07.003Z");

const CHECK_STATE_CASES: ReadonlyArray<{
  checkedAt: Date | null;
  found: boolean;
  expected: CheckState;
  why: string;
}> = [
  { checkedAt: CHECKED_AT, found: true, expected: "found", why: "looked, and found something" },
  {
    checkedAt: CHECKED_AT,
    found: false,
    expected: "none-confirmed",
    why: "looked and found nobody — a fact about the business, rendered 'none confirmed'",
  },
  {
    checkedAt: null,
    found: false,
    expected: "never-looked",
    why: "the check has not run; this is not 'none'",
  },
  {
    checkedAt: null,
    found: true,
    expected: "found",
    why: "evidence outranks the timestamp — never claim we did not look while holding a URL",
  },
];

test("checkState keeps 'never looked' and 'looked, found nobody' apart", () => {
  for (const { checkedAt, found, expected, why } of CHECK_STATE_CASES) {
    assert.equal(checkState(checkedAt, found), expected, `${checkedAt} / ${found} — ${why}`);
  }
});

// --- isUuid ----------------------------------------------------------------------------------

const UUID_CASES: ReadonlyArray<{ input: string; expected: boolean; why: string }> = [
  {
    input: "77590c57-a621-4884-89c2-ee9023d51ca4",
    expected: true,
    why: "a real batch_id out of the database",
  },
  {
    input: "77590C57-A621-4884-89C2-EE9023D51CA4",
    expected: true,
    why: "Postgres accepts either case",
  },
  { input: "", expected: false, why: "an empty query param" },
  { input: "77590c57", expected: false, why: "a truncated link" },
  {
    input: "77590c57-a621-4884-89c2-ee9023d51ca4x",
    expected: false,
    why: "anchored at both ends — a trailing byte is not a uuid",
  },
  {
    input: "77590c57-a621-4884-89c2-ee9023d51cag",
    expected: false,
    why: "g is not hex",
  },
  {
    input: "'; select 1 --",
    expected: false,
    why: "never reaches SQL either way; this keeps it a not-found rather than an unknown",
  },
];

test("isUuid turns a stale link into a not-found instead of an unknown", () => {
  for (const { input, expected, why } of UUID_CASES) {
    assert.equal(isUuid(input), expected, `${JSON.stringify(input)} — ${why}`);
  }
});
