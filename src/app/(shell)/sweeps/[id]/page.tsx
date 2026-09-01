import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

import {
  RunScars,
  RunScarsLoading,
  RunRailFacts,
} from "@/components/discovery/run-rail";
import {
  RunCount,
  RunsFailed,
  RunTable,
} from "@/components/discovery/run-table";
import { LowDataNotice } from "@/components/pending";
import {
  DetailLayout,
  RailEmpty,
  RailNotFound,
} from "@/components/shell/detail-rail";
import { PageHeader } from "@/components/shell/page-header";
import { SweepStandingPill } from "@/components/status-pill";
import { sweepStanding, type RunState } from "@/lib/discovery/derive";
import { getRun, listSweepRuns } from "@/lib/discovery/queries";
import type { Page, RunRow } from "@/lib/discovery/sql";

/**
 * One sweep's queries, and the rail for the one that is selected.
 *
 * `<id>` is a `batch_id` or, for a run that was never part of a grid, a `run_id` — the contract
 * `/sweeps` set when its rows started linking here, and the shape `listSweepRuns` and `getRun`
 * were already built for.
 *
 * **The read is awaited here rather than streamed, and that is the whole reason this page has no
 * skeleton.** Next returns a real 404 only for a non-streamed response; behind a `<Suspense>`,
 * `notFound()` answers 200 with 404 markup, and a stale link reporting success is exactly the
 * collapse `isUuid` exists in the read layer to prevent. The page's subject *is* the id, so
 * there is nothing honest to paint before it resolves. The loading state moves to the rail,
 * which has its own read and its own boundary.
 */

/** Below this the list is a handful of queries, not a set to generalise across (§5.14). */
const LOW_DATA_MAX = 3;

export default async function SweepDetailPage({
  params,
  searchParams,
}: PageProps<"/sweeps/[id]">) {
  const { id } = await params;
  const query = await searchParams;

  const page = await resolveSweep(id);
  // `{ ok: false }` is unknown — we could not ask. Never a not-found: those are different facts
  // and a 404 would claim we looked.
  if (page === "unknown") return <Failed />;

  const selectedId = typeof query.run === "string" ? query.run : undefined;
  const selected = selectedId
    ? page.rows.find((row) => row.runId === selectedId)
    : undefined;

  const aborted = page.rows.find((row) => row.state === "aborted");

  return (
    <>
      <PageHeader title={title(page.rows)} description={`Sweep ${id}`} />
      <DetailLayout
        rail={
          !selectedId ? (
            <RailEmpty />
          ) : !selected ? (
            // Rail-local: the link is stale, and the table beside it is unaffected.
            <RailNotFound />
          ) : (
            <div className="space-y-4">
              <RunRailFacts row={selected} />
              {/* The only read on this page that fetches a provider's response body, and it
                  happens only because a run is selected. */}
              <Suspense fallback={<RunScarsLoading />}>
                <RunScars runId={selected.runId} />
              </Suspense>
            </div>
          )
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link
              href="/sweeps"
              className="text-xs text-text-3 transition-colors hover:text-text-2"
            >
              ← all sweeps
            </Link>
            <SweepStandingPill standing={standingOf(page)} />
            <RunCount page={page} />
          </div>

          {aborted ? <AbortNotice row={aborted} /> : null}

          <RunTable page={page} basePath={`/sweeps/${id}`} selected={selectedId} />

          <p className="max-w-prose text-xs text-text-3">
            <span className="text-text-2">Returned is not a count.</span> A query that
            came back full reads <span className="font-mono">60+</span>: Google caps one
            text search at sixty, so the area holds more than that and these are the ones
            it ranked highest. Never sum the column. Two or fewer is thin — check the
            query string before blaming the area. Web presence is counted now rather than
            at sweep time, so two readings of the same historical run can differ.
          </p>

          {page.total <= LOW_DATA_MAX ? (
            <LowDataNotice n={page.total} noun="query" plural="queries" />
          ) : null}
        </div>
      </DetailLayout>
    </>
  );
}

/**
 * A batch id, a one-off's run id, or nothing that exists.
 *
 * Tried in that order because a batch is the common case. `notFound()` throws, so the return
 * type does not have to carry a third case for it.
 */
async function resolveSweep(id: string): Promise<Page<RunRow> | "unknown"> {
  const batch = await listSweepRuns(id);
  if (!batch.ok) return "unknown";
  if (batch.value.rows.length > 0) return batch.value;

  const one = await getRun(id);
  if (!one.ok) return "unknown";
  if (!one.value) notFound();
  return { rows: [one.value], total: 1 };
}

/** `city · niche`, aggregated the way the index does — nothing stops a batch spanning two. */
function title(rows: RunRow[]): string {
  const distinct = (values: (string | null)[]) => [
    ...new Set(values.filter((v): v is string => v !== null)),
  ];
  const parts = [
    distinct(rows.map((r) => r.city)).join(", "),
    distinct(rows.map((r) => r.niche)).join(", "),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sweep";
}

/**
 * The same word the index prints for this sweep, from the same function.
 *
 * Tallying here rather than re-reading the index's row is what makes the two pages unable to
 * disagree: a `null` state falls into none of the five counts, they sum short of the run count,
 * and `sweepStanding` drops to `unknown` — exactly as it does on `/sweeps`.
 */
function standingOf(page: Page<RunRow>) {
  const states: Record<RunState, number> = {
    completed: 0,
    aborted: 0,
    errored: 0,
    running: 0,
    stalled: 0,
  };
  for (const row of page.rows) if (row.state) states[row.state] += 1;
  return sweepStanding(states, page.rows.length);
}

/**
 * Why nothing else ran — without saying why.
 *
 * The reason is a scar and can carry a provider's response body, so the text stays behind the
 * rail's disclosure. What belongs on the page is the fact that the sweep stopped and *which*
 * query stopped it, because otherwise an operator has to find one row among fifty to learn that
 * the list is shorter than the sweep intended.
 *
 * Keyed on the derived state rather than on `aborted_reason is not null`: a run that carries the
 * scar and later completed did not stop anything, and `completed_at` outranks it (§5.5).
 */
function AbortNotice({ row }: { row: RunRow }) {
  return (
    <div className="space-y-1 rounded-md border border-status-fail/40 bg-surface-1 p-3 text-xs">
      <p className="font-medium text-text-2">This sweep stopped here.</p>
      <p className="text-text-3">
        It aborted at <span className="font-mono text-text-2">{row.query}</span>, and the
        areas after it left no rows at all — so this list is what ran, not what was
        planned.{" "}
        <Link
          href={`?run=${row.runId}`}
          scroll={false}
          className="text-text-2 decoration-hairline underline underline-offset-4"
        >
          Open that query
        </Link>{" "}
        to read the reason.
      </p>
    </div>
  );
}

function Failed() {
  return (
    <>
      <PageHeader title="Sweep" />
      <div className="p-4">
        <RunsFailed />
      </div>
    </>
  );
}
