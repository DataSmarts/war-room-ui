import { Suspense } from "react";

import {
  SweepCount,
  SweepsEmpty,
  SweepsFailed,
  SweepsLoading,
  SweepTable,
} from "@/components/discovery/sweep-table";
import { LowDataNotice } from "@/components/pending";
import { PageHeader } from "@/components/shell/page-header";
import { listSweeps } from "@/lib/discovery/queries";

/**
 * The index of every sweep, and the app's front door — `/` redirects here.
 *
 * Four pending states, each on its real trigger rather than on a prop: `read` returning
 * `{ ok: false }` is *unknown*, an `ok` page with no rows is *empty*, the Suspense fallback is
 * *loading*, and a handful of sweeps is too few to generalise from. They are different facts and
 * the page never spends one on another.
 */

/** Below this, the index is a list of things that happened, not a set to reason across (§5.14). */
const LOW_DATA_MAX = 3;

export default function SweepsPage() {
  return (
    <>
      <PageHeader
        title="Sweeps"
        description="The index of every sweep discovery has run."
      />
      <div className="space-y-4 p-4">
        {/* The read degrades on its own, so the boundary is here for streaming: the header and
            the note below render immediately instead of waiting on a round trip. A skeleton
            means still asking — never the hollow ring, which means asked and could not find
            out. */}
        <Suspense fallback={<SweepsLoading />}>
          <SweepIndex />
        </Suspense>

        {/* Permanent, and outside the boundary on purpose: it is true whatever the read did.
            The two things a reader will otherwise infer from this table are the two things it
            cannot say. */}
        <p className="max-w-prose text-xs text-text-3">
          A sweep&rsquo;s size is what its rows prove, not what it planned — the areas
          after an abort leave no rows at all, so a sweep that stopped and one still
          going look the same here. The <span className="text-text-2">standing</span> is
          what tells them apart. The planned area count, the bias radius and what a sweep
          cost live outside this database.
        </p>
      </div>
    </>
  );
}

async function SweepIndex() {
  const sweeps = await listSweeps();

  if (!sweeps.ok) return <SweepsFailed />;

  const page = sweeps.value;
  if (page.rows.length === 0) return <SweepsEmpty />;

  return (
    <div className="space-y-3">
      <SweepCount page={page} />
      <SweepTable page={page} />
      {page.total <= LOW_DATA_MAX ? (
        <LowDataNotice n={page.total} noun="sweep" />
      ) : null}
    </div>
  );
}
