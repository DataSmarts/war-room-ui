import Link from "next/link";

import { LoadingRows, FailedState } from "@/components/pending";
import { StatusPill } from "@/components/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ResultCount } from "@/lib/discovery/derive";
import type { Page, RunRow } from "@/lib/discovery/sql";
import { absoluteTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * One sweep's queries, with nothing fetched.
 *
 * Same split as `sweep-table.tsx`: rows come in as a prop, so `/kitchen-sink` renders the four
 * states the database has never produced — nothing is `aborted`, `errored`, `running` or
 * `stalled` in it, and only one row in forty-three carries a scar at all.
 *
 * **Nothing here selects a scar's text and nothing here can.** `RunRow` carries `hasError` and
 * `hasAbortedReason` as booleans because the list statement was written unable to fetch the
 * columns (§5.12). This table says a scar *exists*; the rail is where its text is asked for, and
 * `readScar` is what makes it safe to show.
 */

/** How the run's `results_returned` reads, already decided by `resultCount` (§5.1). */
function resultReading(results: ResultCount): { value: string; note: string | null } {
  switch (results.kind) {
    case "saturated":
      // A floor, never a total: the area holds MORE than this and Google ranked what came back.
      return { value: `${results.atLeast}+`, note: "saturated" };
    case "thin":
      // Nought to two means the niche is not there *or* the wording is off, and the query text
      // in the first column is the thing to check before blaming the area.
      return { value: `${results.n}`, note: "thin" };
    case "counted":
      return { value: `${results.n}`, note: null };
  }
}

/** Which scars a run carries — named, never quoted. */
function scarNames(row: RunRow): string | null {
  const names = [
    row.hasError ? "an error" : null,
    row.hasAbortedReason ? "an abort reason" : null,
  ].filter(Boolean);
  return names.length ? `carries ${names.join(" and ")}` : null;
}

const NUM = "text-right tabular-nums text-text-1";

function RunTableRow({
  row,
  basePath,
  selected,
}: {
  row: RunRow;
  basePath: string;
  selected: boolean;
}) {
  const results = resultReading(row.results);
  const scars = scarNames(row);

  return (
    <TableRow
      aria-current={selected ? "true" : undefined}
      className={cn(selected && "bg-surface-1")}
    >
      <TableCell
        className={cn(
          "border-l-2",
          selected ? "border-l-brand" : "border-l-transparent",
        )}
      >
        {/* The exact string that was sent, never reconstructed from niche and area. `scroll`
            stays off so picking a row does not throw the reader back to the top of the page. */}
        <Link
          href={`${basePath}?run=${row.runId}`}
          scroll={false}
          className="font-mono text-text-1 decoration-hairline underline-offset-4 hover:underline"
        >
          {row.query}
        </Link>
      </TableCell>

      <TableCell className={NUM} title="raw results across all pages, before dedupe">
        {results.value}
        {results.note ? (
          <div className="mt-0.5 text-xs font-normal text-text-3">{results.note}</div>
        ) : null}
      </TableCell>

      <TableCell className={NUM} title="distinct businesses this query returned, after dedupe">
        {row.businessesMatched}
      </TableCell>

      <TableCell className={NUM} title="first ever seen by this query">
        {row.businessesNew}
      </TableCell>

      <TableCell className={NUM} title="already known before this query ran">
        {row.businessesKnown}
      </TableCell>

      <TableCell
        className={NUM}
        title="counted now rather than at sweep time, and an off-platform page counts — two readings of the same historical run can legitimately differ"
      >
        {row.businessesWithWebPresence}
      </TableCell>

      <TableCell className="whitespace-nowrap" title={absoluteTime(row.createdAt)}>
        {relativeTime(row.createdAt)}
      </TableCell>

      <TableCell>
        <StatusPill state={row.state} />
        {/* A scar is visibly present and unmistakably not the status. `completed_at` is the
            authority, so a run carrying both reads completed — with this line beneath it. */}
        {scars ? (
          <div className="mt-1 text-xs whitespace-nowrap text-text-3">{scars}</div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function RunTable({
  page,
  basePath,
  selected,
}: {
  page: Page<RunRow>;
  /** Where a row's link points, so selection lands back on this same sweep. */
  basePath: string;
  selected?: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="border-l-2 border-l-transparent">Query</TableHead>
          <TableHead className="text-right">Returned</TableHead>
          <TableHead className="text-right">Matched</TableHead>
          <TableHead className="text-right">New</TableHead>
          <TableHead className="text-right">Known</TableHead>
          <TableHead className="text-right">Web presence</TableHead>
          <TableHead>Ran</TableHead>
          <TableHead>State</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.rows.map((row) => (
          <RunTableRow
            key={row.runId}
            row={row}
            basePath={basePath}
            selected={row.runId === selected}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/** "20 queries", or what the LIMIT left of them (§9). */
export function RunCount({ page }: { page: Page<RunRow> }) {
  const { rows, total } = page;
  return (
    <p className="text-xs text-text-3">
      {rows.length < total
        ? `showing ${rows.length} of ${total} queries`
        : `${total} ${total === 1 ? "query" : "queries"}`}
    </p>
  );
}

// The page's own pending states, exported so the kitchen sink shows the copy an operator meets.

export function RunsLoading() {
  return <LoadingRows rows={6} />;
}

export function RunsFailed() {
  return (
    <FailedState title="Could not read this sweep's queries. The database did not answer." />
  );
}
