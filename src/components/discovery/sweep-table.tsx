import Link from "next/link";

import { EmptyState, FailedState, LoadingRows } from "@/components/pending";
import {
  RUN_STATE_ORDER,
  SWEEP_STANDINGS,
  SweepStandingPill,
} from "@/components/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sweepStanding } from "@/lib/discovery/derive";
import type { Page, SweepRow } from "@/lib/discovery/sql";
import { absoluteTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The sweep index, with nothing fetched.
 *
 * The same split the shell uses (`ChipsView` / `ShellChips`, `NavLinksView` / `NavLinks`): rows
 * come in as a prop, so `/kitchen-sink` renders every standing and every shape from fixtures
 * while `/sweeps` renders the database. A view that could only be seen with the right rows in
 * the database is a view whose rare states never get looked at.
 *
 * **What this table is not allowed to imply.** A batch is a grouping, not a thing with a size
 * (§5.10): there is no planned count anywhere in this database, so nothing here is a
 * denominator and there is no progress bar. `queries` is how many runs the rows prove, and the
 * only ratio on the page — *saturated of queries* — divides the rows by the rows.
 *
 * **And the trap that follows from it.** The areas after an abort leave no rows at all (§5.6),
 * so a sweep that stopped and a sweep still going hold the same number of runs and the same
 * numbers inside them. Shape cannot tell them apart, which means the rendering has to, three
 * times over: the standing pill's word and colour, the outlook line under the timestamp
 * (`final` / `still moving`), and a vermilion rule down the left of a row that stopped.
 * §5.13 — terminal states must look terminal.
 */

/** Enough of a uuid to recognise a sweep by, and to match against a log line. */
function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * `city · niche`, from two arrays.
 *
 * Aggregated rather than assumed: usually one of each, but nothing stops a batch spanning two,
 * and `array_agg … filter` hands back an empty array when every value was null. Empty is
 * **unrecorded**, never blank — a cell with nothing in it reads as a rendering bug, and this is
 * a fact about the runs.
 */
function areaLabel(cities: string[], niches: string[]): string | null {
  const parts = [cities.join(", "), niches.join(", ")].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The five counts, spelled out — zeros omitted, and anything left over named.
 *
 * `sql.ts` counts each state by name, so a run whose `state` is a word this build does not
 * recognise falls into none of the five. Saying `1 unrecognised` out loud is the difference
 * between a row that is short by one and a row that quietly reads as complete.
 */
function rollup(states: SweepRow["states"], queries: number): string {
  const parts = RUN_STATE_ORDER.filter((state) => states[state] > 0).map(
    (state) => `${states[state]} ${state}`,
  );
  const counted = RUN_STATE_ORDER.reduce((sum, state) => sum + states[state], 0);
  if (counted < queries) parts.push(`${queries - counted} unrecognised`);
  return parts.join(" · ");
}

/** Right-aligned, and the digits stay in their columns as the eye runs down them. */
const NUM = "text-right tabular-nums text-text-1";

function SweepTableRow({ row }: { row: SweepRow }) {
  const standing = sweepStanding(row.states, row.queries);
  const { outlook } = SWEEP_STANDINGS[standing];
  const area = areaLabel(row.cities, row.niches);

  // One row of the index stands for either a batch or a single unbatched run, and `/sweeps/<id>`
  // takes whichever it is — the read layer already answers both (`listSweepRuns`, `getRun`).
  const id = row.batchId ?? row.runId;

  return (
    <TableRow>
      <TableCell
        className={cn(
          // Terminal, and the one place the table paints a status on the row itself. Transparent
          // rather than absent on every other row, so nothing shifts by two pixels.
          "border-l-2",
          standing === "stopped" ? "border-l-status-fail" : "border-l-transparent",
        )}
      >
        {/* The label can be missing; the row still has to be openable. A sweep whose runs
            recorded no city or niche is exactly the one worth looking inside. */}
        {id ? (
          <Link
            href={`/sweeps/${id}`}
            className={cn(
              "decoration-hairline underline-offset-4 hover:underline",
              area ? "text-text-1" : "text-text-3",
            )}
          >
            {area ?? "unrecorded"}
          </Link>
        ) : (
          <span className={area ? "text-text-1" : "text-text-3"}>
            {area ?? "unrecorded"}
          </span>
        )}
        {id ? (
          <div className="mt-0.5 text-xs text-text-3">
            {row.batchId ? null : "one-off · "}
            <span className="font-mono">{shortId(id)}</span>
          </div>
        ) : null}
      </TableCell>

      <TableCell className={NUM} title="runs recorded — a batch has no planned size">
        {row.queries}
      </TableCell>

      <TableCell
        className={NUM}
        title="queries that came back full: each one holds MORE than it returned"
      >
        {row.saturatedQueries} of {row.queries}
      </TableCell>

      <TableCell className={NUM} title="businesses this sweep was the first ever to find">
        {row.businessesNew}
      </TableCell>

      <TableCell
        className={NUM}
        title="re-sightings — (run, business) pairs, not distinct businesses"
      >
        {row.sightingsKnown}
      </TableCell>

      <TableCell
        className="whitespace-nowrap"
        title={absoluteTime(row.firstRunAt)}
      >
        {relativeTime(row.firstRunAt)}
      </TableCell>

      <TableCell className="whitespace-nowrap">
        <span title={absoluteTime(row.lastProgressAt)}>
          {relativeTime(row.lastProgressAt)}
        </span>
        {/* Whether anything else is coming. On this page that is the fact a reader actually
            needs, and it is the one the row's numbers cannot carry. */}
        <div className="mt-0.5 text-xs text-text-3">{outlook}</div>
      </TableCell>

      <TableCell>
        <SweepStandingPill standing={standing} />
        <div className="mt-1 text-xs whitespace-nowrap text-text-3">
          {rollup(row.states, row.queries)}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function SweepTable({ page }: { page: Page<SweepRow> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {/* The left rule lives on the first cell, so the header pads to match it. */}
          <TableHead className="border-l-2 border-l-transparent">Sweep</TableHead>
          <TableHead className="text-right">Queries</TableHead>
          <TableHead className="text-right">Saturated</TableHead>
          <TableHead className="text-right">New</TableHead>
          <TableHead className="text-right">Sightings</TableHead>
          <TableHead>First run</TableHead>
          <TableHead>Last progress</TableHead>
          <TableHead>Standing</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.rows.map((row) => (
          <SweepTableRow key={row.batchId ?? row.runId} row={row} />
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * How much of the answer is on screen.
 *
 * Every list statement in this repo carries a `LIMIT`, so every list has to say whether it hit
 * one (§9). Free at three rows; the discipline exists so that the day it is not free, the page
 * is already honest about it rather than silently truncating.
 */
export function SweepCount({ page }: { page: Page<SweepRow> }) {
  const { rows, total } = page;
  return (
    <p className="text-xs text-text-3">
      {rows.length < total
        ? `showing ${rows.length} of ${total} sweeps`
        : `${total} ${total === 1 ? "sweep" : "sweeps"}`}
    </p>
  );
}

// The index's own pending states, exported for the same reason the rail's are: the kitchen sink
// shows the copy the page actually renders, rather than a second set of words that can drift
// from it.

export function SweepsLoading() {
  return <LoadingRows rows={6} />;
}

export function SweepsEmpty() {
  return (
    <EmptyState
      title="No sweeps yet"
      hint="We asked, and discovery has never recorded a run — which is not the same as not knowing. A row appears here the first time a query lands: one per batch, plus each unbatched one-off on its own."
    />
  );
}

export function SweepsFailed() {
  // No detail, and none to give: `read` logs the error's name and keeps everything else, because
  // a connection failure's message can echo the URL that produced it.
  return (
    <FailedState title="Could not read the sweep index. The database did not answer." />
  );
}
