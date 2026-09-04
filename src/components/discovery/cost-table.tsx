import Link from "next/link";

import { areaLabel, shortId } from "@/components/discovery/sweep-table";
import { SpendCell } from "@/components/discovery/spend-facts";
import { EmptyState, FailedState, LoadingRows } from "@/components/pending";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsd, spendReading, sumUsd } from "@/lib/discovery/derive";
import type { Page, SweepRow } from "@/lib/discovery/sql";
import { absoluteTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * What each sweep spent, with nothing fetched.
 *
 * Same split as every other view here — rows in as a prop, so `/kitchen-sink` can render a
 * recorded sweep beside an unrecorded one while the database holds only the second kind.
 *
 * **The order is chronological, and that is a correctness decision rather than a default.**
 * Ranking by cost is the obvious thing for a costs table and it is the one thing this data cannot
 * support: every sweep older than 010 has no ledger rows, and sorting would file them under
 * *cheapest*. A quantity half the rows do not have is not a quantity you may rank by — the same
 * reason `stalled` takes no colour and `never looked` is not `none`.
 */

/** Right-aligned, and the digits stay in their columns as the eye runs down them. */
const NUM = "text-right tabular-nums text-text-1";

function CostTableRow({ row, selected }: { row: SweepRow; selected: string | null }) {
  const area = areaLabel(row.cities, row.niches);
  const id = row.batchId ?? row.runId;
  const isSelected = id !== null && id === selected;

  return (
    <TableRow
      // Selection is a fact about the URL, not a colour with a meaning. A surface, never a hue:
      // purple is identity and the status ramp is severity, and "you clicked this" is neither.
      className={cn(isSelected && "bg-surface-2")}
      aria-selected={isSelected}
    >
      <TableCell>
        {id ? (
          <Link
            // Selection rides in the query string, so it survives a reload and travels in a
            // link — and the page is still the list, which is why a stale id degrades in the
            // rail instead of 404-ing the route.
            href={`/costs?sweep=${id}`}
            scroll={false}
            className={cn(
              "decoration-hairline underline-offset-4 hover:underline",
              area ? "text-text-1" : "text-text-3",
            )}
          >
            {area ?? "unrecorded"}
          </Link>
        ) : (
          <span className={area ? "text-text-1" : "text-text-3"}>{area ?? "unrecorded"}</span>
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

      <TableCell className="text-right">
        <SpendCell spend={row.spend} />
      </TableCell>

      <TableCell title={absoluteTime(row.firstRunAt)}>
        {relativeTime(row.firstRunAt)}
      </TableCell>

      <TableCell title={absoluteTime(row.lastProgressAt)}>
        {relativeTime(row.lastProgressAt)}
      </TableCell>
    </TableRow>
  );
}

export function CostTable({
  page,
  selected = null,
}: {
  page: Page<SweepRow>;
  selected?: string | null;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Sweep</TableHead>
          <TableHead className="text-right">Queries</TableHead>
          <TableHead className="text-right">List price</TableHead>
          <TableHead>First run</TableHead>
          <TableHead>Last progress</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.rows.map((row) => (
          <CostTableRow
            key={row.batchId ?? row.runId}
            row={row}
            selected={selected}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The headline, and the sentence that keeps it honest.
 *
 * A total over rows where some are `unrecorded` would be a smaller number pretending to be a
 * complete one. So the total says what it is a total *of*, and names how many sweeps it could not
 * include — which is the whole answer for a while yet, since only sweeps run after 010 have rows.
 */
export function CostTotal({ page }: { page: Page<SweepRow> }) {
  const recorded = page.rows.filter(
    (row) => spendReading(row.spend.attempts) === "recorded",
  );
  const missing = page.rows.length - recorded.length;

  if (recorded.length === 0) {
    return (
      <p className="text-xs text-text-3">
        Nothing on the ledger yet. Every sweep listed ran before the ledger existed, so what
        they spent was never written down.
      </p>
    );
  }

  return (
    <p className="text-xs text-text-3">
      <span className="text-text-1 tabular-nums">
        {formatUsd(sumUsd(recorded.map((row) => row.spend.costUsd)))}
      </span>{" "}
      at list price across {recorded.length}{" "}
      {recorded.length === 1 ? "sweep" : "sweeps"}
      {missing > 0
        ? ` — ${missing} more ${missing === 1 ? "is" : "are"} not on the ledger and cannot be added in`
        : ""}
      .
    </p>
  );
}

/**
 * How much of the answer is on screen. Every list statement carries a `LIMIT` (§9).
 */
export function CostCount({ page }: { page: Page<SweepRow> }) {
  const { rows, total } = page;
  return (
    <p className="text-xs text-text-3">
      {rows.length < total
        ? `showing ${rows.length} of ${total} sweeps`
        : `${total} ${total === 1 ? "sweep" : "sweeps"}`}
    </p>
  );
}

// Exported for the same reason every other view's are: the kitchen sink shows the copy the page
// renders, rather than a second set of words that can drift from it.

export function CostsLoading() {
  return <LoadingRows rows={6} />;
}

export function CostsEmpty() {
  return (
    <EmptyState
      title="No sweeps yet"
      hint="Discovery has never recorded a run, so there is nothing to have cost anything. A row appears here the first time a query lands — with its spend, if it ran after the ledger existed."
    />
  );
}

export function CostsFailed() {
  // No detail, and none to give: `read` logs the error's name and nothing else, because a
  // connection failure's message can echo the URL that produced it.
  return <FailedState title="Could not read what these sweeps spent. The database did not answer." />;
}
