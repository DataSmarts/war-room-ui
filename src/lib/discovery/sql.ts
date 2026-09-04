import type { NeonQueryFunction } from "@neondatabase/serverless";

import {
  CHECK_STATE_VALUES,
  PLACES_TEXT_SEARCH_CAP,
  checkState,
  isUuid,
  ratingReading,
  resultCount,
  runStateOf,
  WEB_PRESENCE_VALUES,
  webPresence,
  type CheckState,
  type RatingReading,
  type ResultCount,
  type RunState,
  type WebPresence,
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
 * * **No list statement selects `runs.error` or `runs.aborted_reason`** (§5.12). Both embed a
 *   provider's response body, and a Google error body can echo a request URL — request URLs carry
 *   `key=`. What comes back is whether a scar exists, never its text. A list query that cannot
 *   select the column cannot leak it into a cell, a log line or a metadata blob, whatever a
 *   future view does with the row. Reading the text itself, redacted and behind a disclosure, is
 *   its own slice, and `selectRunScars` at the bottom of this file is the whole of it.
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
 * the planned area count and the bias radius still live outside this database. **Cost does not,
 * since 010** — it is joined below, per run, from the ledger the sweep wrote as it spent.
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
       (coalesce(sum(sp.attempts), 0))::int                             as spend_attempts,
       (coalesce(sum(sp.requests), 0))::int                             as spend_requests,
       coalesce(sum(sp.cost_usd), 0)                                    as spend_cost_usd,
       (count(*) over ())::int                                          as total_sweeps
from run_accounting ra
join runs r       on r.id      = ra.run_id
join run_state rs on rs.run_id = ra.run_id
-- LEFT, and that is the whole reading: a sweep older than 010 has no ledger rows, and the zero
-- this produces means "not recorded" rather than "spent nothing". spendReading is what keeps
-- those apart; nothing here may render the 0 as money.
left join (select run_id,
                  (sum(attempts))::int as attempts,
                  (sum(requests))::int as requests,
                  sum(cost_usd)        as cost_usd
           from run_spend group by run_id) sp on sp.run_id = ra.run_id
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
  /**
   * What the sweep spent, summed from the per-request ledger (010).
   *
   * `attempts` is what it tried and `requests` is what we believe Google charged for — a sweep
   * that met a 429 differs on the two, and both are kept. `costUsd` stays a **string** all the way
   * to the screen: the column is `numeric` precisely so money never becomes a float, and
   * `formatUsd` places the digits.
   *
   * Zero attempts is `unrecorded`, not zero spent. Ask `spendReading`, never `costUsd === "0"`.
   */
  spend: { attempts: number; requests: number; costUsd: string };
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
  spend_attempts: number;
  spend_requests: number;
  spend_cost_usd: string;
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
    spend: {
      attempts: raw.spend_attempts,
      requests: raw.spend_requests,
      costUsd: raw.spend_cost_usd,
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

/**
 * One sweep's spend, split by what was bought.
 *
 * The split is the point: §5.11 says `results_returned` cannot see geocoding at all, so a total
 * that did not separate the two would answer the question the trap says is unanswerable while
 * looking like it had. Takes a batch id or a one-off's run id, the same pair `/sweeps/<id>`
 * already accepts.
 */
const SWEEP_SPEND_SQL = `
select s.sku                  as sku,
       (sum(s.attempts))::int as attempts,
       (sum(s.requests))::int as requests,
       sum(s.cost_usd)        as cost_usd
from run_spend s
join runs r on r.id = s.run_id
where r.batch_id = $1 or r.id = $1
group by s.sku
order by s.sku
`;

export type SpendRow = {
  /** `places:text_search` or `geocoding:geocode`. Rendered by a lookup, never by splitting it. */
  sku: string;
  attempts: number;
  requests: number;
  /** A string, deliberately — see `SweepRow["spend"]`. */
  costUsd: string;
};

export async function selectSweepSpend(sql: Sql, id: string): Promise<SpendRow[]> {
  const raw = (await sql.query(SWEEP_SPEND_SQL, [id])) as {
    sku: string;
    attempts: number;
    requests: number;
    cost_usd: string;
  }[];

  return raw.map((row) => ({
    sku: row.sku,
    attempts: row.attempts,
    requests: row.requests,
    costUsd: row.cost_usd,
  }));
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

// --- businesses ------------------------------------------------------------------------------

/**
 * The other half of discovery: not what we asked, but what came back.
 *
 * `select *` is not an option here and would not work if it were — the `ui` role is granted
 * `businesses` **column by column**, 20 of 23, and the three it withholds are the raw provider
 * payloads (`places_raw`, `socials_raw`, `contacts_raw`) that carry PII (§6). A star would be
 * refused by the database. Listing the columns is not a style preference; it is the shape of the
 * grant, written down.
 *
 * `sightings` is a correlated subquery rather than a join so a business twelve areas returned
 * stays one row. `run_businesses(business_id)` is indexed (§9).
 *
 * `contacts_found` comes from `business_contact_counts` (008), which is a granted **count** over a
 * table this role still cannot read a row of. It is joined rather than subqueried because it is
 * already grouped one row per business. Its sibling column `graded` is deliberately not selected:
 * nothing renders it, and a column no statement names is a column no future view can put on a
 * screen by accident — the same reasoning that keeps `error` out of every list statement.
 */
const BUSINESS_COLUMNS = `
       b.id                                                             as id,
       b.google_place_id                                                as google_place_id,
       b.name                                                           as name,
       b.website_uri                                                    as website_uri,
       b.website_domain                                                 as website_domain,
       b.formatted_address                                              as formatted_address,
       b.national_phone                                                 as national_phone,
       b.international_phone                                            as international_phone,
       b.rating                                                         as rating,
       b.user_rating_count                                              as user_rating_count,
       b.facebook_url                                                   as facebook_url,
       b.instagram_url                                                  as instagram_url,
       b.x_url                                                          as x_url,
       b.linkedin_url                                                   as linkedin_url,
       b.socials_checked_at                                             as socials_checked_at,
       b.contacts_checked_at                                            as contacts_checked_at,
       b.created_at                                                     as created_at,
       b.updated_at                                                     as updated_at,
       (select count(*) from run_businesses rb
         where rb.business_id = b.id)::int                              as sightings,
       coalesce(bcc.contacts, 0)                                        as contacts_found,
       (count(*) over ())::int                                          as total_businesses
from businesses b
left join business_contact_counts bcc on bcc.business_id = b.id
`;

/**
 * Every filter is a nullable parameter, and the statement is one static string.
 *
 * Not a WHERE clause assembled from parts: a static statement has no concatenation to get wrong,
 * one plan to reason about, and it is the same text whether five filters are set or none. Values
 * reach Postgres bound, never interpolated.
 *
 * **The `web`, `socials` and `contacts` predicates are `webPresence` and `checkState` transcribed
 * into SQL,** and that duplication is the one real hazard in this file — a filter that disagrees
 * with the cell it filters on is invisible until someone counts. `schema:check` asserts they agree
 * on live rows for every value of both vocabularies, so a drift refuses a push rather than
 * shipping. Note especially that `found` outranks the timestamp in all three: a business holding a
 * Facebook URL reads `found` whatever `socials_checked_at` says, and one holding a contact reads
 * `found` whatever `contacts_checked_at` says, so `never-looked` has to exclude both here too.
 *
 * The sweep filter takes a `batch_id` **or** a `run_id`, the same either/or `/sweeps/<id>`
 * answers, so a sweep can link straight to what it found.
 */
const BUSINESSES_SQL = `
select ${BUSINESS_COLUMNS}
where ($1::text is null or b.name ilike '%' || $1::text || '%')
  and ($2::text is null
       or ($2 = 'site'         and b.website_domain is not null)
       or ($2 = 'off-platform' and b.website_uri is not null and b.website_domain is null)
       or ($2 = 'none'         and b.website_uri is null))
  and ($3::text is null
       or ($3 = 'found'
           and num_nonnulls(b.facebook_url, b.instagram_url, b.x_url, b.linkedin_url) > 0)
       or ($3 = 'none-confirmed'
           and b.socials_checked_at is not null
           and num_nonnulls(b.facebook_url, b.instagram_url, b.x_url, b.linkedin_url) = 0)
       or ($3 = 'never-looked'
           and b.socials_checked_at is null
           and num_nonnulls(b.facebook_url, b.instagram_url, b.x_url, b.linkedin_url) = 0))
  and ($4::text is null
       or ($4 = 'found'          and coalesce(bcc.contacts, 0) > 0)
       or ($4 = 'none-confirmed'
           and b.contacts_checked_at is not null
           and coalesce(bcc.contacts, 0) = 0)
       or ($4 = 'never-looked'
           and b.contacts_checked_at is null
           and coalesce(bcc.contacts, 0) = 0))
  and ($5::uuid is null or exists (
        select 1 from run_businesses rb
        join runs r on r.id = rb.run_id
        where rb.business_id = b.id and (r.batch_id = $5::uuid or r.id = $5::uuid)))
  and ($6::text is null or exists (
        select 1 from run_businesses rb
        join runs r on r.id = rb.run_id
        where rb.business_id = b.id and r.city = $6::text))
order by b.name asc, b.id asc
limit $7
`;

/** One business, by id. No filters: a rail's subject is not part of the list's question. */
const BUSINESS_BY_ID_SQL = `select ${BUSINESS_COLUMNS} where b.id = $1 limit 1`;

/** The city list the filter offers. Two values today; it is the sweeps that grow it. */
const DISCOVERY_CITIES_SQL = `
select distinct r.city as city
from runs r
where r.city is not null
order by 1 asc
`;

/**
 * What the list is asking for. Every field nullable: null is "do not filter on this".
 *
 * `q` is held exactly as it was typed so the form can render it back. The ILIKE escaping happens
 * at the bind, not here — a `%` the operator typed is a percent sign they are searching for, and
 * a filter that quietly turned it into a wildcard would return rows nobody asked about.
 */
export type BusinessFilters = {
  q: string | null;
  web: WebPresence | null;
  socials: CheckState | null;
  /** The same vocabulary as `socials`, since 008 — both are `checkState`. */
  contacts: CheckState | null;
  /** A `batch_id` or a `run_id`. */
  sweep: string | null;
  city: string | null;
};

export const NO_BUSINESS_FILTERS: BusinessFilters = {
  q: null,
  web: null,
  socials: null,
  contacts: null,
  sweep: null,
  city: null,
};

export function hasBusinessFilter(filters: BusinessFilters): boolean {
  return Object.values(filters).some((value) => value !== null);
}

/** A repeated or absent param, as `searchParams` hands it over. */
type ParamValue = string | string[] | undefined;

function one(value: ParamValue): string | null {
  // A repeated param is ambiguous — `?web=site&web=none` asks for two answers to one question.
  // Ignoring it filters nothing, which is what the control will show.
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function member<T extends string>(value: ParamValue, allowed: readonly T[]): T | null {
  const raw = one(value);
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

/**
 * A URL, narrowed to the six questions this list can answer.
 *
 * Anything unrecognised becomes null rather than an error: `?web=purple` names an axis that
 * exists and a value that does not, and the honest response is to filter nothing and let the
 * control show "any" — the page has not lost the ability to answer, only the instruction.
 *
 * `sweep` is shape-checked because a malformed uuid is a Postgres error, `read` reports errors as
 * *unknown*, and "we could not find out" is the wrong answer to a question that was never
 * askable (the same reason `isUuid` guards the id routes). A well-formed uuid naming no sweep is
 * a different matter and stays a filter: it matches nothing, and "nothing matched" is true.
 *
 * `city` is not validated, because it is data rather than a vocabulary — an unknown city matches
 * nothing, which is the same honest answer.
 */
export function parseBusinessFilters(
  params: Record<string, ParamValue>,
): BusinessFilters {
  const sweep = one(params.sweep);
  return {
    q: one(params.q),
    web: member(params.web, WEB_PRESENCE_VALUES),
    socials: member(params.socials, CHECK_STATE_VALUES),
    contacts: member(params.contacts, CHECK_STATE_VALUES),
    sweep: sweep !== null && isUuid(sweep) ? sweep : null,
    city: one(params.city),
  };
}

/**
 * The inverse of `parseBusinessFilters`, and it lives beside it so the two cannot drift.
 *
 * Every link on the page rebuilds the query string from the parsed filters rather than passing
 * the original through: a value this build does not recognise was dropped at the parse, and
 * carrying it along in every href would keep a filter alive in the URL that is not being applied
 * to the rows. What the address bar says and what the table did stay the same thing.
 */
export function businessFilterParams(filters: BusinessFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== null) params.set(key, value);
  }
  return params;
}

export type BusinessRow = {
  id: string;
  /** Identity. A business five queries found is one row, keyed on this. */
  googlePlaceId: string;
  name: string;
  /** Kept raw beside the reading because a view links it — through `httpHref`, never directly. */
  websiteUri: string | null;
  websiteDomain: string | null;
  /** Already read (§5.3), so no view compares the two columns and invents a fourth answer. */
  web: WebPresence;
  formattedAddress: string | null;
  nationalPhone: string | null;
  internationalPhone: string | null;
  /** Already read (§5.14): a 5.0 from four reviews arrives as `thin`, never as a bare number. */
  rating: RatingReading;
  facebookUrl: string | null;
  instagramUrl: string | null;
  xUrl: string | null;
  linkedinUrl: string | null;
  /** Already read (§5.4). "Looked and found nobody" is a fact, not a gap. */
  socials: CheckState;
  socialsCheckedAt: Date | null;
  /**
   * Already read (§5.4), and three states since 008 — the same reading socials gets, from a
   * granted count rather than four granted columns. `contacts` itself is still invisible to this
   * role; what the view hands over is an integer, never a name.
   */
  contacts: CheckState;
  contactsCheckedAt: Date | null;
  /** How many people the enrichment found. The evidence behind `contacts`, and all of it. */
  contactsFound: number;
  /** When the row was first written. The sightings list is the authority on when it was *seen*. */
  createdAt: Date;
  /** When the row was last written — a re-sighting, or an enrichment check. Not a sighting. */
  updatedAt: Date;
  /** How many runs have ever returned it. Exact: `run_businesses` is unique on the pair. */
  sightings: number;
};

type RawBusinessRow = {
  id: string;
  google_place_id: string;
  name: string;
  website_uri: string | null;
  website_domain: string | null;
  formatted_address: string | null;
  national_phone: string | null;
  international_phone: string | null;
  rating: number | null;
  user_rating_count: number | null;
  facebook_url: string | null;
  instagram_url: string | null;
  x_url: string | null;
  linkedin_url: string | null;
  socials_checked_at: Date | null;
  contacts_checked_at: Date | null;
  created_at: Date;
  updated_at: Date;
  sightings: number;
  contacts_found: number;
  total_businesses: number;
};

function toBusinessRow(raw: RawBusinessRow): BusinessRow {
  const socialUrls = [raw.facebook_url, raw.instagram_url, raw.x_url, raw.linkedin_url];
  return {
    id: raw.id,
    googlePlaceId: raw.google_place_id,
    name: raw.name,
    websiteUri: raw.website_uri,
    websiteDomain: raw.website_domain,
    web: webPresence(raw.website_uri, raw.website_domain),
    formattedAddress: raw.formatted_address,
    nationalPhone: raw.national_phone,
    internationalPhone: raw.international_phone,
    rating: ratingReading(raw.rating, raw.user_rating_count),
    facebookUrl: raw.facebook_url,
    instagramUrl: raw.instagram_url,
    xUrl: raw.x_url,
    linkedinUrl: raw.linkedin_url,
    socials: checkState(
      raw.socials_checked_at,
      socialUrls.some((url) => url !== null),
    ),
    socialsCheckedAt: raw.socials_checked_at,
    contacts: checkState(raw.contacts_checked_at, raw.contacts_found > 0),
    contactsCheckedAt: raw.contacts_checked_at,
    contactsFound: raw.contacts_found,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    sightings: raw.sightings,
  };
}

/** `%` and `_` are ILIKE wildcards; the operator typed characters, not a pattern. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function selectBusinesses(
  sql: Sql,
  filters: BusinessFilters = NO_BUSINESS_FILTERS,
  limit: number = DEFAULT_LIMIT,
): Promise<Page<BusinessRow>> {
  const raw = (await sql.query(BUSINESSES_SQL, [
    filters.q === null ? null : likeLiteral(filters.q),
    filters.web,
    filters.socials,
    filters.contacts,
    filters.sweep,
    filters.city,
    limit,
  ])) as RawBusinessRow[];

  return { rows: raw.map(toBusinessRow), total: raw[0]?.total_businesses ?? 0 };
}

export async function selectBusiness(
  sql: Sql,
  id: string,
): Promise<BusinessRow | null> {
  const raw = (await sql.query(BUSINESS_BY_ID_SQL, [id])) as RawBusinessRow[];
  const row = raw[0];
  return row ? toBusinessRow(row) : null;
}

export async function selectDiscoveryCities(sql: Sql): Promise<string[]> {
  const raw = (await sql.query(DISCOVERY_CITIES_SQL, [])) as { city: string }[];
  return raw.map((row) => row.city);
}

// --- sightings -------------------------------------------------------------------------------

/**
 * Every query that ever returned one business.
 *
 * **Reads `runs`, not `run_accounting`, and that is a performance decision with teeth** (§9): the
 * view's window function partitions by `business_id`, so no predicate can be pushed into it and
 * every query against it sorts the whole of `run_businesses`. Nothing here needs a count —
 * `query`, `city` and `neighborhood` all exist on `runs` itself (they are three of the seven
 * names §5.7 warns collide), so the join is simply not made.
 *
 * `order by rb.id` is exact "first ever seen": `run_businesses.id` is a bigserial and §3.2 says
 * so deliberately, because timestamps tie and a sequence does not. The first row of this list is
 * the run that earned the business its `businesses_new` credit, permanently.
 *
 * Booleans for the scars, like every other list statement. The text lives one link away.
 */
const SIGHTINGS_SQL = `
select r.id                                                             as run_id,
       r.batch_id                                                       as batch_id,
       r.query                                                          as query,
       r.city                                                           as city,
       r.neighborhood                                                   as neighborhood,
       rb.rank                                                          as rank,
       rb.seen_at                                                       as seen_at,
       rs.state                                                         as state,
       (r.error is not null)                                            as has_error,
       (r.aborted_reason is not null)                                   as has_aborted_reason,
       (count(*) over ())::int                                          as total_sightings
from run_businesses rb
join runs r       on r.id      = rb.run_id
join run_state rs on rs.run_id = rb.run_id
where rb.business_id = $1
order by rb.id asc
limit $2
`;

export type SightingRow = {
  runId: string;
  batchId: string | null;
  /** The exact string that returned it. */
  query: string;
  city: string | null;
  neighborhood: string | null;
  /** 1-based Places position, continuous across pages. Null if the writer never recorded one. */
  rank: number | null;
  seenAt: Date;
  state: RunState | null;
  hasError: boolean;
  hasAbortedReason: boolean;
};

type RawSightingRow = {
  run_id: string;
  batch_id: string | null;
  query: string;
  city: string | null;
  neighborhood: string | null;
  rank: number | null;
  seen_at: Date;
  state: string | null;
  has_error: boolean;
  has_aborted_reason: boolean;
  total_sightings: number;
};

function toSightingRow(raw: RawSightingRow): SightingRow {
  return {
    runId: raw.run_id,
    batchId: raw.batch_id,
    query: raw.query,
    city: raw.city,
    neighborhood: raw.neighborhood,
    rank: raw.rank,
    seenAt: raw.seen_at,
    state: runStateOf(raw.state),
    hasError: raw.has_error,
    hasAbortedReason: raw.has_aborted_reason,
  };
}

export async function selectSightings(
  sql: Sql,
  businessId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<Page<SightingRow>> {
  const raw = (await sql.query(SIGHTINGS_SQL, [businessId, limit])) as RawSightingRow[];
  return { rows: raw.map(toSightingRow), total: raw[0]?.total_sightings ?? 0 };
}
