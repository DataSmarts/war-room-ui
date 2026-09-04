import Link from "next/link";

import { SpendSplit } from "@/components/discovery/spend-facts";
import { FailedState } from "@/components/pending";
import { RailField, RailNotFound } from "@/components/shell/detail-rail";
import { getRun, getSweepSpend, listSweepRuns } from "@/lib/discovery/queries";

/**
 * What one sweep bought, split by provider operation.
 *
 * Two reads and they answer different questions. The **split** is the subject. The **runs** are
 * asked for only to tell a stale link from a sweep with nothing on the ledger — an empty split
 * means one of those two things, and rendering "ran before the ledger existed" over a
 * hand-edited uuid would be a confident answer to a question nobody asked.
 *
 * A stale `?sweep=` lands on `RailNotFound` and the page stays 200: the page is the list, and the
 * list is fine. That is the same reading `/businesses` makes, and the opposite of what
 * `/sweeps/[id]` must do, where the id *is* the subject.
 */
export async function CostRail({ id }: { id: string }) {
  const [spend, runs] = await Promise.all([getSweepSpend(id), listSweepRuns(id)]);

  if (!spend.ok || !runs.ok) {
    // No detail: `read` keeps the error's name and nothing else, because a connection failure's
    // message can echo the URL that produced it.
    return <FailedState title="Could not read this sweep's spend. The database did not answer." />;
  }

  // A batch id lists its runs; a one-off's run id lists none, so the second question is only
  // asked when the first came back empty.
  if (runs.value.total === 0) {
    const run = await getRun(id);
    if (!run.ok) {
      return <FailedState title="Could not read this sweep. The database did not answer." />;
    }
    if (run.value === null) return <RailNotFound />;
  }

  const queries = runs.value.total || 1;

  return (
    <div className="space-y-4">
      <dl className="space-y-1 text-xs">
        <RailField label="Queries" title="runs recorded — a batch has no planned size">
          <span className="tabular-nums">{queries}</span>
        </RailField>
        <RailField label="Sweep">
          <Link
            href={`/sweeps/${id}`}
            className="font-mono decoration-hairline underline-offset-4 hover:underline"
          >
            {id.slice(0, 8)}
          </Link>
        </RailField>
      </dl>

      <SpendSplit rows={spend.value} />

      {/* The caveat belongs beside the number it qualifies, not only in the page prose. Both
          directions, because an operator reads this column as money. */}
      <p className="text-xs text-text-3">
        List price at the rate of the day each request was bought. The monthly free tier is
        account-wide and invisible here, so a sweep may have been billed less — and requests we
        could not confirm were charged are counted as <span className="text-text-2">tried</span>{" "}
        but not as money.
      </p>
    </div>
  );
}
