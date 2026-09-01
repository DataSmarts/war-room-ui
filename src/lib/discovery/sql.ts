import type { NeonQueryFunction } from "@neondatabase/serverless";

import {
  PLACES_TEXT_SEARCH_CAP,
  resultCount,
  runStateOf,
  type ResultCount,
  type RunState,
} from "./derive.ts";

/**
 * The statements, and the shapes they come back as.
 *
 * Split from `queries.ts` so that bare `node` can execute the real SQL and the real row mapping.
 * A push-time check that proved a *copy* of these queries returns typed rows would prove nothing
 * about the queries — so the check imports this file and runs exactly what a page runs. That is
 * also why the only imports here are a type and the pure derivations: nothing from `next/`, so
 * type stripping is enough to load it.
 *
 * Three rules every statement below keeps, each one a trap that has a plausible wrong answer:
 *
 * * **Every column is qualified** (§5.7). `run_accounting` and `runs` collide on seven names —
 *   `query`, `niche`, `city`, `neighborhood`, `results_returned`, `completed_at`, `created_at` —
 *   and Postgres refuses an unqualified reference as ambiguous. `run_accounting` is the source
 *   for all seven; `runs` contributes `batch_id`, `error`, `next_page_token`, `lat`, `lng`,
 *   `country`.
 * * **Every count is cast `::int`** (§5.8). The view's counts are `bigint` and the driver hands
 *   those back as strings. `(agg)::int` is parenthesised because `count(*) filter (…)::int` does
 *   not parse.
 * * **Neither statement selects `runs.error` or `runs.aborted_reason`** (§5.12). Both embed a
 *   provider's response body, and a Google error body can echo a request URL — request URLs carry
 *   `key=`. What comes back is whether a scar exists, never its text. A list query that cannot
 *   select the column cannot leak it into a cell, a log line or a metadata blob, whatever a
 *   future view does with the row. Reading the text itself, redacted and behind a disclosure, is
 *   its own slice.
 */

type Sql = NeonQueryFunction<false, false>;

/** Always `LIMIT`, always report "showing N of M". At 3 runs this is free; it will not always be. */
export const DEFAULT_LIMIT = 200;

/** A page of rows, and how many there were before the limit. */
export type Page<T> = { rows: T[]; total: number };

// --- sweeps ----------------------------------------------------------------------------------

/**
 * The index of every sweep: one row per `batch_id`, plus each unbatched one-off as its own row.
 *
 * A batch is a grouping, not a thing (§5.10). It has no size, no lifecycle and no progress, so
 * there is no denominator here and there is not meant to be one — `queries` is how many runs the
 * rows prove, never a total to divide by. `build_grid.py` mints the uuid in the operating half;
 * the planned area count, the bias radius and the cost live outside this database entirely.
 *
 * The `case` in the `group by` is what keeps one-offs apart. Grouping on `batch_id` alone would
 * collapse every unbatched run into a single null-keyed row, which would read as one sweep that
 * never happened.
 *
 * **No summed `results_returned`.** §5.1 forbids it: a full page is a ceiling, so adding three of
 * them produces a number that means nothing. `saturated_queries` is the honest form of the same
 * question — "3 of 3 saturated" is true, "180 returned" is not.
 */
const SWEEPS_SQL = `
select r.batch_id                                                       as batch_id,
       case when r.batch_id is null then r.id end                       as run_id,
       min(ra.created_at)                                               as first_run_at,
       max(rs.updated_at)                                               as last_progress_at,
       (count(*))::int                                                  as queries,
       array_agg(distinct ra.city)  filter (where ra.city  is not null) as cities,
       array_agg(distinct ra.niche) filter (where ra.niche is not null) as niches,
       (sum(ra.businesses_new))::int                                    as businesses_new,
       (sum(ra.businesses_known))::int                                  as sightings_known,
       (count(*) filter (where ra.results_returned >= $1))::int         as saturated_queries,
       (count(*) filter (where rs.state = 'completed'))::int            as completed,
       (count(*) filter (where rs.state = 'aborted'))::int              as aborted,
       (count(*) filter (where rs.state = 'errored'))::int              as errored,
       (count(*) filter (where rs.state = 'running'))::int              as running,
       (count(*) filter (where rs.state = 'stalled'))::int              as stalled,
       (count(*) over ())::int                                          as total_sweeps
from run_accounting ra
join runs r       on r.id      = ra.run_id
join run_state rs on rs.run_id = ra.run_id
group by r.batch_id, (case when r.batch_id is null then r.id end)
order by max(rs.updated_at) desc, min(ra.created_at) desc
limit $2
`;

export type SweepRow = {
  /** Null for a one-off: a run that was never part of a grid. */
  batchId: string | null;
  /** Set only when `batchId` is null — the single run this row stands for. */
  runId: string | null;
  firstRunAt: Date;
  /** The newest heartbeat in the sweep: when the last page landed, never when one was tried. */
  lastProgressAt: Date;
  /** How many runs this batch holds. What the rows prove — never a denominator. */
  queries: number;
  /** Usually one of each. Aggregated rather than assumed: nothing stops a batch spanning two. */
  cities: string[];
  niches: string[];
  /** Businesses this sweep was the first ever to find. Exact: each one is a distinct business. */
  businessesNew: number;
  /**
   * Re-sightings, and named for what it is. Summing the view's `businesses_known` across runs
   * counts *(run, business)* pairs, not distinct firms — a business three areas all returned is
   * two of these. `businesses_new` has no such problem, which is why only one of the pair got
   * renamed.
   */
  sightingsKnown: number;
  /** Queries that came back full. Each one holds more than it returned (§5.1). */
  saturatedQueries: number;
  /**
   * The runs by state. Five numbers rather than one rolled-up severity: ranking `aborted` above
   * `errored` is a rendering decision, and it belongs where the rendering is.
   */
  states: Record<RunState, number>;
};

type RawSweepRow = {
  batch_id: string | null;
  run_id: string | null;
  first_run_at: Date;
  last_progress_at: Date;
  queries: number;
  cities: string[] | null;
  niches: string[] | null;
  businesses_new: number | null;
  sightings_known: number | null;
  saturated_queries: number;
  completed: number;
  aborted: number;
  errored: number;
  running: number;
  stalled: number;
  total_sweeps: number;
};

function toSweepRow(raw: RawSweepRow): SweepRow {
  return {
    batchId: raw.batch_id,
    runId: raw.run_id,
    firstRunAt: raw.first_run_at,
    lastProgressAt: raw.last_progress_at,
    queries: raw.queries,
    // `array_agg … filter` returns null, not an empty array, when every row was filtered out.
    cities: raw.cities ?? [],
    niches: raw.niches ?? [],
    // `sum` over no rows is null. It cannot happen inside a group, but the type says it can.
    businessesNew: raw.businesses_new ?? 0,
    sightingsKnown: raw.sightings_known ?? 0,
    saturatedQueries: raw.saturated_queries,
    states: {
      completed: raw.completed,
      aborted: raw.aborted,
      errored: raw.errored,
      running: raw.running,
      stalled: raw.stalled,
    },
  };
}

export async function selectSweeps(
  sql: Sql,
  limit: number = DEFAULT_LIMIT,
): Promise<Page<SweepRow>> {
  const raw = (await sql.query(SWEEPS_SQL, [
    PLACES_TEXT_SEARCH_CAP,
    limit,
  ])) as RawSweepRow[];

  return { rows: raw.map(toSweepRow), total: raw[0]?.total_sweeps ?? 0 };
}

// --- runs ------------------------------------------------------------------------------------

/**
 * One shape for a run, whether it is being listed inside a sweep or looked at on its own.
 *
 * `businesses_with_website` is aliased here because the name lies twice (§5.9): it counts
 * `website_uri`, so a business whose only presence is a linktr.ee is inside it, and it is
 * evaluated *now* rather than at sweep time, so two screenshots of the same historical run
 * legitimately disagree. `with_web_presence` is what it actually measures.
 */
const RUN_COLUMNS = `
       ra.run_id                                                        as run_id,
       ra.query                                                         as query,
       ra.niche                                                         as niche,
       ra.city                                                          as city,
       ra.neighborhood                                                  as neighborhood,
       ra.results_returned                                              as results_returned,
       (ra.businesses_matched)::int                                     as businesses_matched,
       (ra.businesses_new)::int                                         as businesses_new,
       (ra.businesses_known)::int                                       as businesses_known,
       (ra.businesses_with_website)::int                                as businesses_with_web_presence,
       ra.completed_at                                                  as completed_at,
       ra.created_at                                                    as created_at,
       rs.state                                                         as state,
       rs.updated_at                                                    as updated_at,
       r.batch_id                                                       as batch_id,
       r.country                                                        as country,
       r.lat                                                            as lat,
       r.lng                                                            as lng,
       (r.next_page_token is not null)                                  as has_next_page,
       (r.error is not null)                                            as has_error,
       (r.aborted_reason is not null)                                   as has_aborted_reason,
       (count(*) over ())::int                                          as total_runs
from run_accounting ra
join runs r       on r.id      = ra.run_id
join run_state rs on rs.run_id = ra.run_id
`;

/** A sweep's queries, in the order the areas were swept. */
const SWEEP_RUNS_SQL = `select ${RUN_COLUMNS} where r.batch_id = $1 order by ra.created_at asc limit $2`;

/** One run, by id. Serves the one-off rows the sweep index lists without a batch. */
const RUN_BY_ID_SQL = `select ${RUN_COLUMNS} where ra.run_id = $1 limit 1`;

export type RunRow = {
  runId: string;
  /** The exact string sent to Google. Never reconstructed from its parts. */
  query: string;
  niche: string | null;
  city: string | null;
  neighborhood: string | null;
  /**
   * Already read (§5.1), so a view cannot compare a number to 60 and get it wrong. A full page is
   * a floor: the area holds more than this, and these are the ones Google ranked highest.
   */
  results: ResultCount;
  businessesMatched: number;
  businessesNew: number;
  businessesKnown: number;
  businessesWithWebPresence: number;
  /** The authority on whether this run finished — even when a scar is set (§5.5). */
  completedAt: Date | null;
  createdAt: Date;
  /** From the `run_state` view, narrowed. Null means the view said a word we do not know. */
  state: RunState | null;
  /** The heartbeat: when the last page committed. */
  updatedAt: Date;
  batchId: string | null;
  country: string | null;
  /** The geocoded bias centre of the *area*, not of any business. */
  lat: number | null;
  lng: number | null;
  /** A cursor was left behind — this query had more pages it never asked for. */
  hasNextPage: boolean;
  /** A scar exists. Its text is not in this row, and that is deliberate (§5.12). */
  hasError: boolean;
  hasAbortedReason: boolean;
};

type RawRunRow = {
  run_id: string;
  query: string;
  niche: string | null;
  city: string | null;
  neighborhood: string | null;
  results_returned: number;
  businesses_matched: number;
  businesses_new: number;
  businesses_known: number;
  businesses_with_web_presence: number;
  completed_at: Date | null;
  created_at: Date;
  state: string | null;
  updated_at: Date;
  batch_id: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  has_next_page: boolean;
  has_error: boolean;
  has_aborted_reason: boolean;
  total_runs: number;
};

function toRunRow(raw: RawRunRow): RunRow {
  return {
    runId: raw.run_id,
    query: raw.query,
    niche: raw.niche,
    city: raw.city,
    neighborhood: raw.neighborhood,
    results: resultCount(raw.results_returned),
    businessesMatched: raw.businesses_matched,
    businessesNew: raw.businesses_new,
    businessesKnown: raw.businesses_known,
    businessesWithWebPresence: raw.businesses_with_web_presence,
    completedAt: raw.completed_at,
    createdAt: raw.created_at,
    state: runStateOf(raw.state),
    updatedAt: raw.updated_at,
    batchId: raw.batch_id,
    country: raw.country,
    lat: raw.lat,
    lng: raw.lng,
    hasNextPage: raw.has_next_page,
    hasError: raw.has_error,
    hasAbortedReason: raw.has_aborted_reason,
  };
}

export async function selectSweepRuns(
  sql: Sql,
  batchId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<Page<RunRow>> {
  const raw = (await sql.query(SWEEP_RUNS_SQL, [batchId, limit])) as RawRunRow[];
  return { rows: raw.map(toRunRow), total: raw[0]?.total_runs ?? 0 };
}

export async function selectRun(sql: Sql, runId: string): Promise<RunRow | null> {
  const raw = (await sql.query(RUN_BY_ID_SQL, [runId])) as RawRunRow[];
  const row = raw[0];
  return row ? toRunRow(row) : null;
}

// --- scars -----------------------------------------------------------------------------------

/**
 * **The only statement in this repo that names `runs.error` or `runs.aborted_reason`.**
 *
 * Everything above returns `has_error` / `has_aborted_reason` as booleans, and that is not
 * squeamishness — it is the mechanism. A list query that cannot select the column cannot leak it
 * into a cell, a log line or a metadata blob, whatever a future view does with the row. Reading
 * the text is a different question asked deliberately, about one run, by a caller that has
 * somewhere safe to put the answer.
 *
 * So this is a separate door rather than four more columns on `RUN_COLUMNS`. Keep it that way:
 * the moment either name appears in a statement that returns many rows, the guarantee is gone
 * and nothing in the type system will say so.
 *
 * What comes back is raw. `readScar` in `derive.ts` is what makes it renderable, and the caller
 * is required to use it — a Google error body can echo the request URL, and request URLs carry
 * `key=` (§5.12).
 */
const RUN_SCARS_SQL = `
select r.error          as error,
       r.aborted_reason as aborted_reason
from runs r
where r.id = $1
limit 1
`;

/** Raw, unredacted, straight from the column. Never render this without `readScar`. */
export type RunScars = { error: string | null; abortedReason: string | null };

export async function selectRunScars(
  sql: Sql,
  runId: string,
): Promise<RunScars | null> {
  const raw = (await sql.query(RUN_SCARS_SQL, [runId])) as {
    error: string | null;
    aborted_reason: string | null;
  }[];
  const row = raw[0];
  return row ? { error: row.error, abortedReason: row.aborted_reason } : null;
}
