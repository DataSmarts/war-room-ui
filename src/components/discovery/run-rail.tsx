import * as React from "react";

import { Disclosure, DisclosureBody } from "@/components/disclosure";
import { EmptyState, FailedState, LoadingRows } from "@/components/pending";
import { StatusPill } from "@/components/status-pill";
import { readScar, type ResultCount } from "@/lib/discovery/derive";
import { getRunScars } from "@/lib/discovery/queries";
import type { RunRow, RunScars } from "@/lib/discovery/sql";
import { absoluteTime, relativeTime } from "@/lib/time";

/**
 * Everything known about the selected run.
 *
 * Split by what it costs. The **facts** are already in the row the table fetched, so they paint
 * with no second round trip. The **scars** are a separate statement — the only one allowed to
 * name `runs.error` or `runs.aborted_reason` — issued solely because a run is selected, so the
 * ordinary path through this page never fetches a provider's response body at all.
 *
 * That split is also why the rail has a real loading state while the page does not: the page
 * awaits its read so a stale id can answer 404 rather than 200, and the rail streams.
 */

function Field({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-0.5">
      <dt className="text-text-3" title={title}>
        {label}
      </dt>
      <dd className="min-w-0 text-text-2">{children}</dd>
    </div>
  );
}

/** Never blank. A cell with nothing in it reads as a bug; this is a fact about the run. */
function Value({ children }: { children: string | null }) {
  return children ? (
    <>{children}</>
  ) : (
    <span className="text-text-3">unrecorded</span>
  );
}

/** The result count in words, so the rail states what the table's `60+` is claiming. */
function resultSentence(results: ResultCount): string {
  switch (results.kind) {
    case "saturated":
      return `${results.atLeast}+ — a full page, so the area holds more than this and these are the ones Google ranked highest`;
    case "thin":
      return `${results.n} — thin. The niche may not be there, or the query wording is off; check the string above before blaming the area`;
    case "counted":
      return `${results.n}`;
  }
}

export function RunRailFacts({ row }: { row: RunRow }) {
  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-1.5">
        <p className="text-text-3">the query, exactly as sent</p>
        <p className="rounded bg-surface-2 p-2 font-mono text-[11px] break-words text-text-1">
          {row.query}
        </p>
      </div>

      <StatusPill state={row.state} />

      <dl className="space-y-1">
        <Field label="niche">
          <Value>{row.niche}</Value>
        </Field>
        <Field label="city">
          <Value>{row.city}</Value>
        </Field>
        <Field label="neighborhood">
          <Value>{row.neighborhood}</Value>
        </Field>
        <Field label="country">
          <Value>{row.country}</Value>
        </Field>
        <Field
          label="bias centre"
          title="the geocoded centre of the AREA, not of any business — and the radius that went with it is not in this database"
        >
          <Value>
            {row.lat !== null && row.lng !== null
              ? `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}`
              : null}
          </Value>
        </Field>
      </dl>

      <dl className="space-y-1">
        <Field label="returned">{resultSentence(row.results)}</Field>
        <Field label="matched">{row.businessesMatched}</Field>
        <Field label="new">{row.businessesNew}</Field>
        <Field label="known">{row.businessesKnown}</Field>
        <Field
          label="web presence"
          title="counted now rather than at sweep time, and an off-platform page counts (§5.9)"
        >
          {row.businessesWithWebPresence}
        </Field>
      </dl>

      <dl className="space-y-1">
        <Field label="created">
          <span title={absoluteTime(row.createdAt)}>{relativeTime(row.createdAt)}</span>
        </Field>
        <Field
          label="completed"
          title="the authority on whether this run finished — even when a scar is set"
        >
          {row.completedAt ? (
            <span title={absoluteTime(row.completedAt)}>
              {relativeTime(row.completedAt)}
            </span>
          ) : (
            <span className="text-text-3">no ending recorded</span>
          )}
        </Field>
        <Field
          label="last progress"
          title="stamped only where a page committed — never when one was merely tried"
        >
          <span title={absoluteTime(row.updatedAt)}>{relativeTime(row.updatedAt)}</span>
        </Field>
      </dl>

      {row.hasNextPage ? (
        <p className="text-text-3">
          A cursor was left behind: this query had more pages, and they were never asked
          for.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The scars, rendered.
 *
 * `readScar` is not optional here and this is the only place either string is turned into
 * elements. It strips credentials first and truncates second, and says how much it cut — a
 * silent truncation would be a third thing the reader has to guess about.
 */
export function RunScarsView({ scars }: { scars: RunScars }) {
  const entries = [
    {
      key: "error",
      summary: "error — this query's own failure",
      note: "It failed once. It is not a status, it was never cleared by a later success, and if a completion is recorded above then this run completed.",
      raw: scars.error,
    },
    {
      key: "aborted",
      summary: "abort reason — why the sweep stopped here",
      note: "Auth or quota. The areas after this one left no rows at all, which is why the sweep has no size to compare against.",
      raw: scars.abortedReason,
    },
  ].filter((entry) => entry.raw !== null);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No scars"
        hint="We asked: this run recorded neither an error nor an abort reason. That is a fact about the run, not a gap in what we can see."
      />
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const scar = readScar(entry.raw as string);
        return (
          <div key={entry.key} className="space-y-1">
            <Disclosure summary={entry.summary}>
              <DisclosureBody>{scar.text}</DisclosureBody>
              <p className="mt-1 text-text-3">
                Redacted before display.{" "}
                {scar.truncated
                  ? `Showing the first ${scar.text.length} of ${scar.ofChars} characters.`
                  : `${scar.ofChars} characters.`}
              </p>
            </Disclosure>
            <p className="text-xs text-text-3">{entry.note}</p>
          </div>
        );
      })}
    </div>
  );
}

export function RunScarsLoading() {
  return <LoadingRows rows={2} />;
}

export function RunScarsFailed() {
  return <FailedState title="Could not read this run's error columns." />;
}

/** The live half. Always inside its own Suspense — see the page. */
export async function RunScars({ runId }: { runId: string }) {
  const result = await getRunScars(runId);
  if (!result.ok) return <RunScarsFailed />;
  // A run whose row vanished between the two reads. Nothing to show, and nothing went wrong.
  if (!result.value) return <RunScarsView scars={{ error: null, abortedReason: null }} />;
  return <RunScarsView scars={result.value} />;
}
