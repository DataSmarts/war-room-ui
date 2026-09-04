import { Suspense } from "react";

import { CostRail } from "@/components/discovery/cost-rail";
import {
  CostCount,
  CostsEmpty,
  CostsFailed,
  CostsLoading,
  CostTable,
  CostTotal,
} from "@/components/discovery/cost-table";
import {
  DetailLayout,
  RailEmpty,
  RailLoading,
} from "@/components/shell/detail-rail";
import { PageHeader } from "@/components/shell/page-header";
import { listSweeps } from "@/lib/discovery/queries";

/**
 * What discovery spent, per sweep — the module §5.11 said could not be built.
 *
 * It could not, and the reason is worth keeping now that it can: actual requests and actual cost
 * lived in the sweep tool's process, were printed once, and were discarded. `results_returned`
 * could not stand in for them — it is post-trim, it cannot see a page that returned nothing, and
 * it cannot see geocoding at all. Migration 010 writes a row per request instead, with the rate
 * copied onto it, and this page reads the sums.
 *
 * **The state that matters most here is the one with no number in it.** Every sweep run before
 * 010 has no ledger rows and never will, so most of this table reads `not recorded` — the hollow
 * ring, no colour, exactly as `never looked` and `never rated` do. Nothing on this page may
 * render that absence as `$0.00`, and nothing may sort by a column half the rows do not have.
 *
 * Streams behind `<Suspense>` and never calls `notFound()`: the page is the list and `?sweep=` is
 * a selection beside it, so a stale id is a fact about the rail. `/sweeps/[id]`, where the id is
 * the subject, is the case that must answer 404 instead.
 */

/** Below this the list is a few rows, not a set to reason across (§5.14). */
const LOW_DATA_MAX = 3;

export default async function CostsPage({ searchParams }: PageProps<"/costs">) {
  const params = await searchParams;
  const raw = typeof params.sweep === "string" ? params.sweep.trim() : "";
  const selected = raw === "" ? null : raw;

  return (
    <>
      <PageHeader
        title="Costs"
        description="What each sweep spent, at the rate it was charged."
      />
      <DetailLayout
        rail={
          selected === null ? (
            <RailEmpty />
          ) : (
            // Keyed on the id: picking a different sweep should say "still asking" rather than
            // leave the previous one's numbers on screen under a new selection.
            <Suspense key={selected} fallback={<RailLoading />}>
              <CostRail id={selected} />
            </Suspense>
          )
        }
      >
        <div className="space-y-3">
          <Suspense fallback={<CostsLoading />}>
            <CostIndex selected={selected} />
          </Suspense>

          {/* Permanent, outside the boundary: true whatever the read did, and these are the two
              things a reader will otherwise take this table to mean. */}
          <p className="max-w-prose text-xs text-text-3">
            <span className="text-text-2">List price, not an invoice.</span> Google&rsquo;s
            first 1,000 text searches and 10,000 geocodes each month are free, and that
            allowance is account-wide across projects this database cannot see — so a sweep
            reading $2.10 here may have been billed nothing. In the other direction, a request
            we could not confirm was charged is counted as tried and left out of the money.
            And <span className="text-text-2">not recorded</span> is not zero: the ledger
            begins at migration 010, and what earlier sweeps spent was never written down.
          </p>
        </div>
      </DetailLayout>
    </>
  );
}

async function CostIndex({ selected }: { selected: string | null }) {
  const sweeps = await listSweeps();

  if (!sweeps.ok) return <CostsFailed />;

  const page = sweeps.value;
  if (page.rows.length === 0) return <CostsEmpty />;

  return (
    <div className="space-y-3">
      <CostTable page={page} selected={selected} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CostCount page={page} />
        <CostTotal page={page} />
      </div>
      {page.rows.length <= LOW_DATA_MAX ? (
        <LowData n={page.rows.length} />
      ) : null}
    </div>
  );
}

/** Kept local so the noun is this page's, not the sweep index's. */
function LowData({ n }: { n: number }) {
  return (
    <p className="text-xs text-text-3">
      {n} {n === 1 ? "sweep" : "sweeps"} is a list of things that happened, not a spending
      trend. Nothing here should be extrapolated.
    </p>
  );
}
