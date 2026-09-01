/**
 * The readings the database does not make for us.
 *
 * Three of the four rules here are traps in the discovery data: a number that is a ceiling
 * rather than a count, and two pairs of columns where "we never looked" and "we looked and found
 * nothing" are different facts the schema keeps apart on purpose. Each one has a way of being
 * rendered that is plausible and wrong, and each is decided once, here, so six views cannot each
 * arrive at their own answer.
 *
 * The fourth is the one reading the database *does* make. `run_state` (007) concludes a run's
 * state from facts; this file only recognises what it said. There is no second opinion about the
 * predicates in this repo and there is not meant to be one.
 *
 * The fifth is one rung up: a sweep is a *grouping* of runs, so rolling their states into a
 * single word for one row of the sweep index is a ranking, and a ranking is an opinion. Held
 * here, once, for the same reason as the rest — and not to be confused with re-deriving a run's
 * state, which nothing in this repo does.
 *
 * **No imports, deliberately.** `node --test` runs this file with nothing but type stripping — no
 * bundler, no renderer, no database — which is what makes the table beside it possible.
 */

/**
 * The five values `run_state.state` can hold, listed in the view's own evaluation order (007).
 *
 * The vocabulary lives here rather than beside its rendering because it is a fact about the
 * database — it is what the view emits, and the read layer is what has to recognise it. Pairing
 * each word with a severity is a different job and stays in `status-pill.tsx`.
 */
export const RUN_STATE_VALUES = [
  "completed",
  "aborted",
  "errored",
  "running",
  "stalled",
] as const;

/** The five values, and no sixth. */
export type RunState = (typeof RUN_STATE_VALUES)[number];

/**
 * The view's `state` column, narrowed — never re-derived.
 *
 * An unrecognised word is schema drift, not a sixth state, and it comes back null so a view can
 * render it without colour: we do not know what a word we have never seen means, and absence of
 * colour is absence of knowledge.
 *
 * Deliberately not lenient — no trimming, no case folding. The view emits exact literals, so
 * anything else has already stopped being the thing this read-model was typed against, and
 * quietly repairing it would hide the drift that the schema chip and `schema:check` exist to
 * make visible.
 */
export function runStateOf(value: string | null | undefined): RunState | null {
  return typeof value === "string" &&
    (RUN_STATE_VALUES as readonly string[]).includes(value)
    ? (value as RunState)
    : null;
}

/**
 * What a whole sweep amounts to, in one word.
 *
 * A sweep is a `batch_id` grouping some number of runs, each with its own state — so a row in the
 * sweep index holds five numbers and needs one word. Concluding that word is a **rendering**
 * decision, not a database fact: `sql.ts` returns the five counts precisely because ranking
 * `aborted` above `errored` is an opinion, and the read layer does not get to hold it. This is
 * where the opinion is held, once, so no view arrives at its own.
 *
 * The words are deliberately not the run vocabulary's. A run is `aborted`; the sweep that
 * contains it is `stopped`. Nothing here can be confused with a `RunState` at a glance or in a
 * `switch`, which is the point — they are different questions about different units.
 */
export const SWEEP_STANDING_VALUES = [
  "stopped",
  "in-flight",
  "degraded",
  "settled",
  "unknown",
] as const;

export type SweepStanding = (typeof SWEEP_STANDING_VALUES)[number];

/**
 * The five counts, ranked — and the ranking is the argument.
 *
 * In order, each rank earning its place over the one below it:
 *
 * 1. **The counts must add up.** `sql.ts` counts each state by name, so a run whose `state` is a
 *    word we do not recognise is counted in none of them and the five sum short of `queries`.
 *    That is schema drift, and a row must not conclude anything about runs it cannot read —
 *    `unknown`, and the schema chip says why.
 * 2. **`stopped` beats everything.** An abort is terminal: the sweep stopped there, said why, and
 *    the areas after it left no rows at all (§5.6). Nothing further is coming.
 * 3. **`in-flight` beats every ending**, because it is not one. A page landed inside the window,
 *    so no conclusion about this sweep is final yet.
 * 4. **`unknown` beats `degraded`.** A stalled run has no ending and no reason and nothing has
 *    moved — we do not know whether the sweep is over. Absent knowledge outranks a query that
 *    failed and was carried past, because the second is a fact and the first is the lack of one.
 * 5. **`degraded`** — every query ended, at least one failed, the sweep carried on.
 * 6. **`settled`** — every query completed.
 *
 * `queries` is passed rather than summed so rank 1 can exist at all: it is the count of rows the
 * group actually holds, and comparing it against the five is the only way to see a state we
 * cannot read. A group with no rows cannot happen, and if it did, "every query completed" would
 * be a claim about nothing — so it is `unknown` too.
 */
export function sweepStanding(
  states: Record<RunState, number>,
  queries: number,
): SweepStanding {
  const counted = RUN_STATE_VALUES.reduce((sum, state) => sum + states[state], 0);
  if (queries < 1 || counted !== queries) return "unknown";

  if (states.aborted > 0) return "stopped";
  if (states.running > 0) return "in-flight";
  if (states.stalled > 0) return "unknown";
  if (states.errored > 0) return "degraded";
  return "settled";
}

/**
 * Google's hard ceiling on a single text search: three pages of twenty, ever. Not a tuning knob
 * — the API's own limit, and the reason `results_returned` is not a count.
 */
export const PLACES_TEXT_SEARCH_CAP = 60;

/** At or below this, suspect the query wording before the area. */
const THIN_RESULT_MAX = 2;

/**
 * What `runs.results_returned` actually says.
 *
 * `saturated` means the area holds **more** than this many and we got the ones Google ranked
 * highest. `atLeast` is the number to render, and it is a floor: "60+", never "60".
 */
export type ResultCount =
  | { kind: "saturated"; atLeast: number }
  | { kind: "thin"; n: number }
  | { kind: "counted"; n: number };

/**
 * Trap §5.1 — a full page is a ceiling, not a total.
 *
 * An area returning exactly the cap holds more than the cap. Reading it as a count is the
 * mistake this function exists to make impossible: never chart it, never sum it, never call it a
 * total. At the other end, nought to two means the niche is not there *or* the wording is off,
 * and the query text is the thing to check before blaming the area.
 *
 * `>=` rather than `===` because a floor that is somehow exceeded is still a floor.
 */
export function resultCount(resultsReturned: number): ResultCount {
  if (resultsReturned >= PLACES_TEXT_SEARCH_CAP) {
    return { kind: "saturated", atLeast: resultsReturned };
  }
  if (resultsReturned <= THIN_RESULT_MAX) {
    return { kind: "thin", n: resultsReturned };
  }
  return { kind: "counted", n: resultsReturned };
}

/**
 * Trap §5.3 — web presence is three states, not two.
 *
 * `off-platform` is a page on someone else's platform: a linktr.ee, a Facebook page, a Yelp
 * listing. The writing tool returns a null `website_domain` for those hosts on purpose, so the
 * pair of columns carries a distinction a single boolean would flatten. It is a real presence
 * and it is unusable downstream in a different way than having no site at all.
 */
export type WebPresence = "site" | "off-platform" | "none";

export function webPresence(
  websiteUri: string | null,
  websiteDomain: string | null,
): WebPresence {
  // The domain is computed from the URI, so a domain without a URI cannot happen — and if it
  // ever does, there is still nothing to link to, which is what `none` says.
  if (!websiteUri) return "none";
  return websiteDomain ? "site" : "off-platform";
}

/**
 * Trap §5.4 — an enrichment check is three states, not two.
 *
 * `socials_checked_at` and `contacts_checked_at` are set even when the check comes back with
 * nothing, precisely so "never looked" stays distinguishable from "looked, found nobody". The
 * second renders **"none confirmed"**: it is a fact about the business, not a gap in our data.
 */
export type CheckState = "never-looked" | "none-confirmed" | "found";

export function checkState(checkedAt: Date | null, found: boolean): CheckState {
  // Evidence outranks the timestamp. Rendering "never looked" beside a Facebook URL we are
  // holding would be the one reading that contradicts itself.
  if (found) return "found";
  return checkedAt ? "none-confirmed" : "never-looked";
}

/**
 * Every id in this schema is a uuid, and one that arrived from a URL might not be.
 *
 * The point is not injection — ids reach Postgres as bound parameters. It is that Postgres
 * rejects a malformed uuid literal as an error, the read layer catches errors and reports
 * *unknown*, and "we could not find out" is the wrong answer to a question that was never
 * askable. A stale or hand-edited link is a **not-found**, and the two must not collapse.
 *
 * Deliberately shape-only: it says the string could be one of ours, never that it is.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
