import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHECK_STATE_VALUES,
  checkState,
  containsSecret,
  httpHref,
  isUuid,
  PLACES_TEXT_SEARCH_CAP,
  RATING_CONFIDENCE_MIN,
  ratingReading,
  readScar,
  redactSecrets,
  resultCount,
  RUN_STATE_VALUES,
  runStateOf,
  SCAR_DISPLAY_MAX,
  SWEEP_STANDING_VALUES,
  sweepStanding,
  WEB_PRESENCE_VALUES,
  webPresence,
  type CheckState,
  type RatingReading,
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

// Both vocabularies are filtered in SQL as well as rendered, so a value with no case here is a
// value nothing has checked the filter against. `schema:check` closes the other half of that
// loop against live rows; this half needs no database.

test("every web presence the columns can express has a case above", () => {
  const covered = new Set(WEB_PRESENCE_CASES.map((c) => c.expected));
  assert.deepEqual([...covered].sort(), [...WEB_PRESENCE_VALUES].sort());
});

test("every check state has a case above", () => {
  const covered = new Set(CHECK_STATE_CASES.map((c) => c.expected));
  assert.deepEqual([...covered].sort(), [...CHECK_STATE_VALUES].sort());
});

// --- contacts, through checkState since 008 ---------------------------------------------------

/**
 * What stood here was a tripwire: contactsCheck must NEVER agree with `checkState(checkedAt,
 * false)`, because claiming "none confirmed" meant claiming nobody was found, and the role could
 * not see whether anyone was. Migration 008 granted `business_contact_counts` — a count per
 * business, never a row — so the claim is one this half can now back, and contacts is read by the
 * same function as socials.
 *
 * The shape of the old argument still has to hold, and this is what replaces the tripwire: **the
 * count alone is not the answer.** A contacts run that met nothing but provider errors never
 * stamps `contacts_checked_at`, so zero contacts *without* a timestamp is "never got an answer"
 * and zero contacts *with* one is "looked, found nobody". Deriving contacts from either column on
 * its own collapses two facts into one, which is the failure the two-state version was avoiding.
 */
const CONTACTS_CASES: ReadonlyArray<{
  checkedAt: Date | null;
  found: number;
  expected: CheckState;
  why: string;
}> = [
  {
    checkedAt: CHECKED_AT,
    found: 2,
    expected: "found",
    why: "the enrichment ran and the count says how many — 590 live businesses",
  },
  {
    checkedAt: CHECKED_AT,
    found: 0,
    expected: "none-confirmed",
    why: "looked, found nobody — 296 live businesses, and the state 008 exists to make sayable",
  },
  {
    checkedAt: null,
    found: 0,
    expected: "never-looked",
    why: "no answer ever came back. A count of zero cannot say this; the null timestamp does",
  },
];

test("contacts reads the count and the timestamp, and neither one alone", () => {
  for (const { checkedAt, found, expected, why } of CONTACTS_CASES) {
    assert.equal(checkState(checkedAt, found > 0), expected, `${checkedAt} / ${found} — ${why}`);
  }

  // Both inputs are load-bearing, and dropping either one gets a different case wrong.
  assert.notEqual(
    checkState(CHECKED_AT, false),
    checkState(null, false),
    "the timestamp is what separates 'found nobody' from 'never got an answer'",
  );
  assert.notEqual(
    checkState(CHECKED_AT, true),
    checkState(CHECKED_AT, false),
    "the count is what separates 'found somebody' from 'found nobody'",
  );
});

test("every contacts state has a case above", () => {
  const covered = new Set(CONTACTS_CASES.map((c) => c.expected));
  assert.deepEqual([...covered].sort(), [...CHECK_STATE_VALUES].sort());
});

// --- ratingReading ---------------------------------------------------------------------------

const RATING_CASES: ReadonlyArray<{
  rating: number | null;
  reviews: number | null;
  expected: RatingReading;
  why: string;
}> = [
  {
    rating: 5,
    reviews: 4,
    expected: { kind: "thin", rating: 5, reviews: 4 },
    why: "the case the issue names: a 5.0 from four reviews is a sample, not a score",
  },
  {
    rating: 4.8,
    reviews: 214,
    expected: { kind: "rated", rating: 4.8, reviews: 214 },
    why: "enough behind it to read as a rating",
  },
  {
    rating: 3.1,
    reviews: RATING_CONFIDENCE_MIN,
    expected: { kind: "rated", rating: 3.1, reviews: RATING_CONFIDENCE_MIN },
    why: "the boundary is inclusive — at the floor is rated",
  },
  {
    rating: 3.1,
    reviews: RATING_CONFIDENCE_MIN - 1,
    expected: { kind: "thin", rating: 3.1, reviews: RATING_CONFIDENCE_MIN - 1 },
    why: "one below the floor is thin",
  },
  { rating: null, reviews: null, expected: { kind: "unrated" }, why: "never rated" },
  {
    rating: 5,
    reviews: null,
    expected: { kind: "unrated" },
    why: "a rating with no sample size behind it is not a thin rating, it is not a rating",
  },
  {
    rating: null,
    reviews: 30,
    expected: { kind: "unrated" },
    why: "reviews without a score say nothing about quality",
  },
  {
    rating: 5,
    reviews: 0,
    expected: { kind: "unrated" },
    why: "zero reviews would render as '0 reviews' beside a 5.0 — a claim about nothing",
  },
];

test("ratingReading never lets a number stand without its sample size", () => {
  for (const { rating, reviews, expected, why } of RATING_CASES) {
    assert.deepEqual(ratingReading(rating, reviews), expected, `${rating} / ${reviews} — ${why}`);
  }
});

test("every rating reading has a case above", () => {
  const covered = new Set(RATING_CASES.map((c) => c.expected.kind));
  assert.deepEqual([...covered].sort(), ["rated", "thin", "unrated"]);
});

// --- httpHref --------------------------------------------------------------------------------

const HREF_CASES: ReadonlyArray<{
  uri: string | null;
  expected: string | null;
  why: string;
}> = [
  {
    uri: "https://thereinerlaw.com/",
    expected: "https://thereinerlaw.com/",
    why: "the ordinary case",
  },
  { uri: "http://example.com", expected: "http://example.com", why: "plain http is allowed" },
  {
    uri: "HTTPS://EXAMPLE.COM",
    expected: "HTTPS://EXAMPLE.COM",
    why: "schemes are case-insensitive to a browser, so they are here",
  },
  {
    uri: "  https://example.com  ",
    expected: "https://example.com",
    why: "surrounding whitespace is not a scheme change",
  },
  { uri: "javascript:alert(1)", expected: null, why: "the one that was paid for" },
  {
    uri: "  JavaScript:alert(1)",
    expected: null,
    why: "leading space and mixed case do not smuggle it past an allowlist",
  },
  {
    uri: "java\tscript:alert(1)",
    expected: null,
    why: "a browser strips the tab and runs it — which is exactly why this is an allowlist",
  },
  { uri: "data:text/html,<script>", expected: null, why: "not http(s)" },
  { uri: "//evil.example/x", expected: null, why: "protocol-relative inherits the page's" },
  { uri: "https:/example.com", expected: null, why: "one slash is not the scheme" },
  { uri: "mailto:someone@example.com", expected: null, why: "not http(s)" },
  { uri: "example.com", expected: null, why: "no scheme at all" },
  { uri: null, expected: null, why: "nothing to link" },
  { uri: "   ", expected: null, why: "whitespace is not a URL" },
];

test("httpHref admits http(s) and nothing else", () => {
  for (const { uri, expected, why } of HREF_CASES) {
    assert.equal(httpHref(uri), expected, `${JSON.stringify(uri)} — ${why}`);
  }
});

// --- redactSecrets / readScar ------------------------------------------------------------------

/**
 * Every key below is visibly fake and none has ever been a credential. They are here because a
 * redaction with no unsafe input to chew on proves nothing — and because this repo is public,
 * which is the whole reason the function exists.
 */
const FAKE_KEY = "AIzaSyFAKE0000000000000000000000000000";

const REDACTION_CASES: ReadonlyArray<{
  input: string;
  expected: string;
  why: string;
}> = [
  {
    // The case the issue names.
    input: `HTTP 400: {"error":{"message":"Bad request","url":"https://places.googleapis.com/v1/places:searchText?key=${FAKE_KEY}&fields=id"}}`,
    expected:
      'HTTP 400: {"error":{"message":"Bad request","url":"https://places.googleapis.com/v1/places:searchText?key=[redacted]&fields=id"}}',
    why: "a body echoing the request URL — the leak §5.12 is about",
  },
  {
    input: `Denied for ${FAKE_KEY}`,
    expected: "Denied for [redacted]",
    why: "a bare Google key with nothing around it to name it",
  },
  {
    input: "HTTP 401: {\"detail\":\"Authorization: Bearer sk-abcdef0123456789 rejected\"}",
    expected: 'HTTP 401: {"detail":"Authorization: Bearer [redacted] rejected"}',
    why: "an auth header quoted back inside a body",
  },
  {
    input: "GET /v1/x?api_key=abc123&access_token=def456&page=2",
    expected: "GET /v1/x?api_key=[redacted]&access_token=[redacted]&page=2",
    why: "every credential parameter, and `page` is not one",
  },
  {
    // The one scar actually in the database, in shape.
    input: 'HTTP 503: {\n  "error": {\n    "code": 503,\n    "message": "The service is unavailable."\n  }\n}',
    expected: 'HTTP 503: {\n  "error": {\n    "code": 503,\n    "message": "The service is unavailable."\n  }\n}',
    why: "nothing sensitive — an untouched body stays readable, which is the point of redacting rather than hiding",
  },
  {
    input: "key=[redacted] already",
    expected: "key=[redacted] already",
    why: "idempotent — a second pass must not eat its own placeholder",
  },
];

test("redactSecrets strips the credential and keeps the error", () => {
  for (const { input, expected, why } of REDACTION_CASES) {
    assert.equal(redactSecrets(input), expected, why);
  }
});

test("nothing that looks like a secret survives a redaction", () => {
  // The canary. If the writing tool ever learns a pattern this file does not, the leak shows up
  // here as a failing test rather than on a public deploy.
  for (const { input, why } of REDACTION_CASES) {
    assert.equal(containsSecret(redactSecrets(input)), false, why);
  }
  assert.equal(containsSecret(`?key=${FAKE_KEY}`), true, "the canary can still see an unstripped key");
});

test("readScar redacts before it truncates, and says what it cut", () => {
  const short = readScar("HTTP 503: the service is unavailable");
  assert.equal(short.truncated, false);
  assert.equal(short.ofChars, 36);

  // The key sits astride the cut. Truncating first would sever it and leave the front half on
  // screen; redacting first removes it whole and the truncation lands on safe text.
  const padded = `${"x".repeat(SCAR_DISPLAY_MAX - 10)}?key=${FAKE_KEY}&page=2${"y".repeat(500)}`;
  const long = readScar(padded);
  assert.equal(long.truncated, true);
  assert.ok(long.text.length <= SCAR_DISPLAY_MAX, "never longer than the cap");
  assert.ok(long.ofChars > SCAR_DISPLAY_MAX, "the original length is reported, not the cut one");
  assert.equal(containsSecret(long.text), false, "no half-key survives the cut");
  assert.ok(!long.text.includes("AIzaSy"), "not even the beginning of one");
  assert.ok(
    !/\[r(e(d(a(c(t(e(d)?)?)?)?)?)?)?$/.test(long.text),
    "and no half-placeholder either — the cut drops the fragment it made",
  );
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
