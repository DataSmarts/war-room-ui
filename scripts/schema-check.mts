import { neon } from "@neondatabase/serverless";
import env from "@next/env";

import { RUN_STATE_VALUES, runStateOf } from "../src/lib/discovery/derive.ts";
import {
  READ_MODEL,
  UNGRANTED,
  VIEWS,
  WITHHELD,
  type Relation,
} from "../src/lib/discovery/schema.ts";
import {
  selectRun,
  selectSweepRuns,
  selectSweeps,
} from "../src/lib/discovery/sql.ts";

/**
 * Does the database still look like what this repo says it looks like?
 *
 * A read-model in a public repo is a claim about a database nobody reading the repo can see. This
 * script is what makes the claim falsifiable — it runs at push time, as the `ui` role, and
 * refuses the push when the answer has changed.
 *
 * Six questions, in widening circles:
 *
 *   1. shape           every modelled column exists, with the type we typed against
 *   2. blast radius    every withheld column and ungranted relation is still invisible
 *   3. vocabulary      `run_state` still emits only the five words we recognise
 *   4. view predicates the view still concludes what 007 says it concludes
 *   5. read-through    the real queries return real rows, with counts as numbers
 *   6. write refusal   a write through this URL is refused, by the role
 *
 * **On check 4 restating the predicates.** CLAUDE.md's rule is that no *view* re-derives run
 * state — six dashboards must not each hold an opinion about it at render time. A check is the
 * opposite of that: stating the expectation and confronting the view with it is the only way to
 * find out whether the view still means what the migration said. Nothing here is imported by
 * anything that renders.
 *
 * It runs against whatever `DATABASE_URL` points at, as `ui` — a role holding SELECT and nothing
 * else, which is what makes pointing it at production safe, and what check 6 exists to prove.
 *
 * **Exit codes**, because the pre-push hook has to tell three different things apart:
 *
 *   0  everything held
 *   1  the database answered, and disagrees — this is the one that refuses a push
 *   2  no `DATABASE_URL`; nothing was checked
 *   3  the database could not be reached; nothing was checked
 *
 * 2 and 3 are not failures. A read degrades, and a push must not require a network.
 */

const { loadEnvConfig } = env;
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("schema:check — DATABASE_URL is not set. Nothing was checked.");
  process.exit(2);
}

const sql = neon(url);

// --- reporting -------------------------------------------------------------------------------

let failed = false;

function heading(name: string) {
  console.log(`\n${name}`);
}

function pass(detail: string) {
  console.log(`  ✔ ${detail}`);
}

/** Something to know about, which is not a reason to refuse the push. */
function note(detail: string) {
  console.log(`  • ${detail}`);
}

function fail(detail: string) {
  failed = true;
  console.log(`  ✘ ${detail}`);
}

/** A payload column nobody remembered to enumerate is still a payload column. */
function looksLikeRawPayload(column: string): boolean {
  return column === "raw" || column.endsWith("_raw");
}

// --- 0. who is asking ------------------------------------------------------------------------

type IdentityRow = { role: string; database: string };

let identity: IdentityRow | undefined;

try {
  // Doubles as the reachability probe. Everything below assumes the database answered at least
  // once, so a failure here is "could not ask" — a different thing from "asked, and disagrees",
  // and the only one of the two that must not refuse a push.
  [identity] = (await sql`
    select current_user as role, current_database() as database
  `) as IdentityRow[];
} catch (err) {
  // The name and nothing more: a connection failure's message can echo the URL that produced it.
  console.error(
    `schema:check — could not reach the database (${err instanceof Error ? err.name : "non-error thrown"}). Nothing was checked.`,
  );
  process.exit(3);
}

// The role and the database, which are safe to say. Never the host and never the URL.
console.log(
  `schema:check — connected as ${identity?.role ?? "?"} to ${identity?.database ?? "?"}`,
);

if (identity?.role !== "ui") {
  // Not fatal: the checks are all reads. But every one of them is a statement about what the
  // restricted role can see, and a different role would answer a different question.
  note(`expected the restricted 'ui' role — checks below describe ${identity?.role}, not ui`);
}

// --- 1. shape --------------------------------------------------------------------------------

heading("shape — the read-model against information_schema");

type ColumnRow = {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
  table_type: string;
};

const columns = (await sql`
  select c.table_name, c.column_name, c.udt_name, c.is_nullable, t.table_type
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public'
  order by c.table_name, c.ordinal_position
`) as ColumnRow[];

const visible = new Map<string, Map<string, ColumnRow>>();
for (const row of columns) {
  let relation = visible.get(row.table_name);
  if (!relation) visible.set(row.table_name, (relation = new Map()));
  relation.set(row.column_name, row);
}

let checkedColumns = 0;

for (const relation of Object.keys(READ_MODEL) as Relation[]) {
  const actual = visible.get(relation);
  if (!actual) {
    fail(`${relation} — not visible to this role at all (grant revoked, or renamed)`);
    continue;
  }

  const modelled = READ_MODEL[relation] as Readonly<Record<string, string>>;
  const isView = VIEWS.has(relation);

  for (const [column, spec] of Object.entries(modelled)) {
    checkedColumns += 1;
    const notNull = spec.endsWith("!");
    const expected = notNull ? spec.slice(0, -1) : spec;
    const found = actual.get(column);

    if (!found) {
      fail(`${relation}.${column} — modelled, but not there`);
      continue;
    }
    if (found.udt_name !== expected) {
      fail(
        `${relation}.${column} — expected ${expected}, database says ${found.udt_name}`,
      );
      continue;
    }
    // information_schema calls every view column nullable whatever the view's SQL guarantees, so
    // a view's `!` is checked against its rows further down instead.
    if (!isView && (found.is_nullable === "NO") !== notNull) {
      fail(
        `${relation}.${column} — model says ${notNull ? "not null" : "nullable"}, database says the opposite`,
      );
    }
  }

  for (const column of actual.keys()) {
    if (column in modelled) continue;
    if (looksLikeRawPayload(column)) {
      fail(
        `${relation}.${column} — a raw payload column is visible to this role; the grant widened`,
      );
    } else {
      // Drift, not danger: a migration added a column and the read-model has not caught up. The
      // schema chip in the top bar is already saying so, and refusing the push would block the
      // change that adopts it.
      note(`${relation}.${column} — visible but not modelled`);
    }
  }
}

if (!failed) {
  pass(
    `${Object.keys(READ_MODEL).length} relations, ${checkedColumns} columns match`,
  );
}

// --- 2. blast radius -------------------------------------------------------------------------

heading("blast radius — what 006 drew, checked from outside it");

let radiusHeld = true;

for (const { relation, column } of WITHHELD) {
  if (visible.get(relation)?.has(column)) {
    radiusHeld = false;
    fail(`${relation}.${column} — withheld, but this role can see it`);
  }
}

for (const relation of UNGRANTED) {
  if (visible.has(relation)) {
    radiusHeld = false;
    fail(`${relation} — ungranted, but visible to this role`);
  }
}

if (radiusHeld) {
  pass(
    `${WITHHELD.length} withheld columns and ${UNGRANTED.length} ungranted relations are invisible`,
  );
}

// --- 3. vocabulary ---------------------------------------------------------------------------

heading("vocabulary — the words run_state emits");

type StateCountRow = { state: string; n: number };

const stateCounts = (await sql`
  select rs.state, (count(*))::int as n
  from run_state rs
  group by rs.state
`) as StateCountRow[];

const seen = new Map(stateCounts.map((r) => [r.state, r.n]));
const unknownStates = stateCounts.filter((r) => runStateOf(r.state) === null);

if (unknownStates.length > 0) {
  for (const row of unknownStates) {
    fail(`run_state emitted ${JSON.stringify(row.state)} — not one of the five we recognise`);
  }
} else {
  pass(`only known states; the read layer narrows every one of them`);
}

// The honest half. Four of the five states have never had a row, and a check that passes over
// nothing must not read like a check that passed over something.
note(
  `coverage — ${RUN_STATE_VALUES.map((s) => `${s} ${seen.get(s) ?? 0}`).join(" · ")}` +
    `${RUN_STATE_VALUES.some((s) => !seen.has(s)) ? "  (a zero is untested, not proven)" : ""}`,
);

// --- 4. view predicates ----------------------------------------------------------------------

heading("view predicates — does run_state still conclude what 007 says");

type PredicateRow = {
  runs: number;
  completed_disagree: number;
  aborted_disagree: number;
  errored_disagree: number;
  running_disagree: number;
  stalled_disagree: number;
  view_nulls: number;
  accounting_nulls: number;
};

// One statement, so `now()` is the same instant for the view and for the expectation — otherwise
// the running/stalled boundary could move between two queries and invent a disagreement.
const [predicates] = (await sql`
  select (count(*))::int as runs,
         (count(*) filter (
            where (r.completed_at is not null) <> (rs.state = 'completed')))::int
           as completed_disagree,
         (count(*) filter (
            where (r.completed_at is null and r.aborted_reason is not null)
                  <> (rs.state = 'aborted')))::int
           as aborted_disagree,
         (count(*) filter (
            where (r.completed_at is null and r.aborted_reason is null and r.error is not null)
                  <> (rs.state = 'errored')))::int
           as errored_disagree,
         (count(*) filter (
            where (r.completed_at is null and r.aborted_reason is null and r.error is null
                   and r.updated_at > now() - interval '10 minutes')
                  <> (rs.state = 'running')))::int
           as running_disagree,
         (count(*) filter (
            where (r.completed_at is null and r.aborted_reason is null and r.error is null
                   and r.updated_at <= now() - interval '10 minutes')
                  <> (rs.state = 'stalled')))::int
           as stalled_disagree,
         (count(*) filter (
            where rs.run_id is null or rs.state is null or rs.updated_at is null))::int
           as view_nulls,
         (count(*) filter (
            where ra.run_id is null or ra.query is null or ra.results_returned is null
                  or ra.businesses_matched is null or ra.businesses_new is null
                  or ra.businesses_known is null or ra.businesses_with_website is null
                  or ra.created_at is null))::int
           as accounting_nulls
  from runs r
  join run_state rs      on rs.run_id = r.id
  join run_accounting ra on ra.run_id = r.id
`) as PredicateRow[];

const disagreements: Array<[string, number]> = [
  ["completed", predicates?.completed_disagree ?? 0],
  ["aborted", predicates?.aborted_disagree ?? 0],
  ["errored", predicates?.errored_disagree ?? 0],
  ["running", predicates?.running_disagree ?? 0],
  ["stalled", predicates?.stalled_disagree ?? 0],
];

const wrong = disagreements.filter(([, n]) => n > 0);

if (wrong.length > 0) {
  for (const [state, n] of wrong) {
    fail(`${n} run(s) disagree with the ${state} predicate — the view has moved`);
  }
} else {
  pass(
    `all five predicates agree across ${predicates?.runs ?? 0} runs` +
      // Saying it plainly: with only completed rows in the database, four of these passed on
      // nothing at all. completed_at outranking a scar is the one genuinely exercised here.
      ` (only states with rows above are actually exercised)`,
  );
}

// A view's `!` in the read-model is read out of the migration, not out of information_schema.
// This is the only evidence a reader outside the private repo can get for it.
if ((predicates?.view_nulls ?? 0) > 0 || (predicates?.accounting_nulls ?? 0) > 0) {
  fail(
    `a column the read-model marks not-null is null in a view row ` +
      `(run_state ${predicates?.view_nulls}, run_accounting ${predicates?.accounting_nulls})`,
  );
} else {
  pass("no view column the model marks not-null holds a null");
}

// --- 5. read-through -------------------------------------------------------------------------

heading("read-through — the real statements, the real mapping");

const sweeps = await selectSweeps(sql);

if (sweeps.rows.length === 0) {
  note("no sweeps recorded — nothing to read through");
} else {
  const sweep = sweeps.rows[0]!;
  pass(
    `${sweeps.total} sweep(s); newest holds ${sweep.queries} quer${sweep.queries === 1 ? "y" : "ies"}, ` +
      `${sweep.saturatedQueries} saturated, ${sweep.businessesNew} new`,
  );

  // The §5.8 proof. The view hands these back as the string "60"; if the ::int casts were
  // dropped, this is the line that notices, and it notices before a page renders "60" as text.
  const numeric: Array<[string, unknown]> = [
    ["queries", sweep.queries],
    ["businessesNew", sweep.businessesNew],
    ["sightingsKnown", sweep.sightingsKnown],
    ["saturatedQueries", sweep.saturatedQueries],
    ["states.completed", sweep.states.completed],
  ];
  const notNumbers = numeric.filter(([, v]) => typeof v !== "number");
  if (notNumbers.length > 0) {
    fail(
      `counts came back as strings — a ::int cast is missing: ${notNumbers
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ")}`,
    );
  } else {
    pass("every count is a number, not a bigint string");
  }

  const runs = sweep.batchId
    ? await selectSweepRuns(sql, sweep.batchId)
    : { rows: sweep.runId ? [(await selectRun(sql, sweep.runId))!] : [], total: 1 };

  if (runs.rows.length === 0) {
    fail("a sweep with queries returned no runs");
  } else {
    const unnarrowed = runs.rows.filter((r) => r.state === null);
    if (unnarrowed.length > 0) {
      fail(`${unnarrowed.length} run(s) carry a state the read layer does not recognise`);
    } else {
      const shapes = new Set(runs.rows.map((r) => r.results.kind));
      pass(
        `${runs.total} run(s) typed; states narrowed; results read as ${[...shapes].join(", ")}`,
      );
    }
  }
}

// --- 6. write refusal ------------------------------------------------------------------------

heading("write refusal — the role, not a convention in a public repo");

try {
  // `where false` matches nothing, so privilege is the only thing this can be stopped by — and
  // it is stopped before it could reach a row even if it matched one.
  await sql.query("update runs set error = error where false");
  fail("a write through this URL was NOT refused — this role holds more than SELECT");
} catch (err) {
  const code = (err as { code?: string }).code;
  if (code === "42501") {
    pass("update refused with SQLSTATE 42501 (insufficient privilege)");
  } else {
    fail(
      `the write failed, but not on privilege — SQLSTATE ${code ?? "?"}. ` +
        `That is not proof the role cannot write.`,
    );
  }
}

// --- verdict ---------------------------------------------------------------------------------

console.log(failed ? "\nschema:check FAILED\n" : "\nschema:check passed\n");
process.exit(failed ? 1 : 0);
