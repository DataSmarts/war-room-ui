import { connection } from "next/server";

import { sql } from "./db";

/**
 * The migration this UI was built against.
 *
 * Migration 006 grants `schema_migrations` to the `ui` role for exactly one stated reason:
 * so a dashboard can say which migration the read-model was built against, and notice when
 * the schema has moved out from under it. The database can only report where it is — the
 * expectation has to be checked in beside the code that assumes it. Bump this in the change
 * that adopts a migration, never ahead of one.
 */
export const EXPECTED_SCHEMA = "007_run_state";

/**
 * Three states, never two.
 *
 * "A page landed at 14:02", "nothing has ever run" and "we could not ask" are different
 * facts. Collapsing the last two into one dash is the same lie as rendering a business
 * nobody ever checked as having no contacts.
 */
export type Freshness =
  | { kind: "as-of"; at: Date }
  | { kind: "no-runs" }
  | { kind: "unknown" };

export type SchemaState =
  | { kind: "match"; version: string; appliedAt: Date }
  | { kind: "drift"; version: string; expected: string }
  | { kind: "unknown" };

export type ShellStatus = { freshness: Freshness; schema: SchemaState };

const UNKNOWN: ShellStatus = {
  freshness: { kind: "unknown" },
  schema: { kind: "unknown" },
};

type StatusRow = {
  schema_version: string | null;
  schema_applied_at: Date | null;
  runs_as_of: Date | null;
};

export async function shellStatus(): Promise<ShellStatus> {
  // Without this the query runs during the prerender and the answer is frozen into the
  // bundle. A freshness chip baked at build time reports the moment it was built, forever —
  // which is precisely the failure the chip exists to make visible.
  await connection();

  if (!sql) return UNKNOWN;

  try {
    // One round trip. Both relations are whole-table grants to the `ui` role (006, 007), so
    // no column list is needed here — unlike `businesses`, where the grant is column by
    // column and `select *` is refused outright.
    //
    // `version` is the migration file's stem and the files are zero-padded, so a lexical
    // sort is the apply order. `runs.updated_at` is the heartbeat: written only inside the
    // transaction where a page commits, never on attempt, so max() means "the last page that
    // landed" and cannot mean "the last time we tried".
    const rows = (await sql`
      select (select version    from schema_migrations order by version desc limit 1) as schema_version,
             (select applied_at from schema_migrations order by version desc limit 1) as schema_applied_at,
             (select max(updated_at) from runs)                                       as runs_as_of
    `) as StatusRow[];

    const row = rows[0];
    if (!row) return UNKNOWN;

    return {
      freshness: row.runs_as_of
        ? { kind: "as-of", at: row.runs_as_of }
        : { kind: "no-runs" },
      schema: schemaState(row.schema_version, row.schema_applied_at),
    };
  } catch (err) {
    // The error's name and nothing more. A connection failure's message can echo the URL
    // that produced it, and secrets never reach a log.
    console.error(
      "[shell] status read failed:",
      err instanceof Error ? err.name : "non-error thrown",
    );
    return UNKNOWN;
  }
}

function schemaState(version: string | null, appliedAt: Date | null): SchemaState {
  if (!version || !appliedAt) return { kind: "unknown" };
  if (version !== EXPECTED_SCHEMA) {
    return { kind: "drift", version, expected: EXPECTED_SCHEMA };
  }
  return { kind: "match", version, appliedAt };
}
