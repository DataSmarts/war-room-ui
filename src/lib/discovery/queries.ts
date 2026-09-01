import { cache } from "react";

import { read, type Read } from "@/lib/db";

import { isUuid } from "./derive";
import {
  selectRun,
  selectRunScars,
  selectSweepRuns,
  selectSweeps,
  type Page,
  type RunRow,
  type RunScars,
  type SweepRow,
} from "./sql";

/**
 * What a view calls.
 *
 * Each one is `read()` — so it waits for a real request rather than being baked into a
 * prerender, degrades to `{ ok: false }` instead of throwing, and logs an error's name and
 * nothing else — wrapped in React's `cache`, so two components on one page share one round trip
 * rather than asking twice.
 *
 * The statements themselves are in `sql.ts`, which bare `node` can load; this file is the half
 * that only makes sense inside Next.
 */

export type { Page, RunRow, RunScars, SweepRow };

/**
 * An id out of a URL that is not a uuid is a **not-found**, never an unknown.
 *
 * Postgres would reject it as a malformed literal, `read` would catch that, and the page would
 * report "we could not find out" about a question that was never askable. Those are different
 * facts and this codebase does not get to collapse them: a stale or hand-edited link should
 * degrade to an empty answer with the rest of the page intact.
 *
 * Injection is not the concern — every id below is a bound parameter. Honesty is.
 */
const NOT_FOUND_PAGE: Read<Page<never>> = { ok: true, value: { rows: [], total: 0 } };

/** The index of every sweep, most recently active first. */
export const listSweeps = cache(
  (limit?: number): Promise<Read<Page<SweepRow>>> =>
    read("discovery/sweeps", (sql) => selectSweeps(sql, limit)),
);

/** One sweep's queries, in the order the areas were swept. */
export const listSweepRuns = cache(
  async (batchId: string, limit?: number): Promise<Read<Page<RunRow>>> => {
    if (!isUuid(batchId)) return NOT_FOUND_PAGE;
    return read("discovery/sweep-runs", (sql) =>
      selectSweepRuns(sql, batchId, limit),
    );
  },
);

/** One run. Also serves the one-off runs the sweep index lists without a batch. */
export const getRun = cache(
  async (runId: string): Promise<Read<RunRow | null>> => {
    if (!isUuid(runId)) return { ok: true, value: null };
    return read("discovery/run", (sql) => selectRun(sql, runId));
  },
);

/**
 * One run's scars, **raw** — asked for separately because reading them is a separate decision.
 *
 * Issued only when a rail has a run selected, so the ordinary path down this page never fetches
 * a provider's response body at all. What comes back is unredacted; `readScar` is what makes it
 * renderable, and nothing may put this string on a page without it.
 */
export const getRunScars = cache(
  async (runId: string): Promise<Read<RunScars | null>> => {
    if (!isUuid(runId)) return { ok: true, value: null };
    return read("discovery/run-scars", (sql) => selectRunScars(sql, runId));
  },
);
