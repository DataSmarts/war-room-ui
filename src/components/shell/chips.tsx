import * as React from "react";

import { Badge } from "@/components/ui/badge";
import type { Freshness, SchemaState } from "@/lib/shell-status";
import { shellStatus } from "@/lib/shell-status";
import { absoluteTime, compactRelativeTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The rail's two chips: how fresh the data is, and which migration it was built against.
 *
 * Colour appears only where there is a status to report. A chip that is green whenever
 * nothing is wrong turns the rail into a christmas tree and teaches the operator to stop
 * looking at it — so the ordinary case is plain metadata, drift is `warn`, and a read we
 * could not make is `unknown`: the deliberate absence of a hue, because absence of colour
 * means absence of knowledge.
 *
 * **Both renderings own their own stack.** The chips are two `w-fit` pills with ~200px of
 * natural width in a 164px column, so the column is not decoration — a caller that forgot it
 * would push them out over the table. Keeping it here rather than at four call sites is what
 * stops `/kitchen-sink` showing a standing block the app does not have.
 */
const STANDING =
  "flex flex-col items-start gap-1.5 px-1.5 rail-narrow:items-center rail-narrow:px-0";

/** Metadata, not status: the pill shape without the status dot. */
function Chip({
  title,
  className,
  children,
}: {
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2.5 py-0.5 text-xs whitespace-nowrap text-text-3",
        // Collapsed the capsule goes and the fact stays. 47px has room for `007`; it does not
        // have room for a border and 20px of padding around it.
        "rail-narrow:gap-0 rail-narrow:border-transparent rail-narrow:bg-transparent rail-narrow:px-0",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Collapsed, a badge keeps its dot and loses its words. */
const TIGHT_BADGE = "rail-narrow:gap-1 rail-narrow:px-1.5";

function shortVersion(version: string): string {
  // "007_run_state" → "007". The whole string goes in the title.
  return version.split("_")[0] ?? version;
}

/**
 * Labelled "sweeps", not "data". `max(runs.updated_at)` knows about discovery and nothing
 * else — businesses, contacts and outreach move on their own clocks, and calling this the
 * whole database's freshness would overclaim. Other views can add their own.
 *
 * Collapsed, `sweeps · 2h ago` becomes `2h`. The word it drops is the noun, never the number:
 * the rail is the only place freshness is reported, and a rail that stops reporting it below a
 * laptop is a rail that goes quiet exactly when the operator is on the smaller screen.
 */
export function FreshnessChip({ freshness }: { freshness: Freshness }) {
  if (freshness.kind === "unknown") {
    return (
      <Badge variant="unknown" title="the database could not be reached" className={TIGHT_BADGE}>
        {/* Collapsed this is the hollow ring and nothing else — which is the whole vocabulary
            for absent knowledge already, and the one thing 47px can say without abbreviating
            into a guess. */}
        <span className="rail-narrow:sr-only">sweeps unknown</span>
      </Badge>
    );
  }
  if (freshness.kind === "no-runs") {
    // We looked. Discovery has never run. That is a fact, not a failure.
    return (
      <Chip title="no runs recorded">
        <span className="rail-narrow:sr-only">no sweeps yet</span>
        <span aria-hidden className="hidden rail-narrow:inline">
          none
        </span>
      </Chip>
    );
  }
  return (
    <Chip title={`last page landed ${absoluteTime(freshness.at)}`}>
      <span className="rail-narrow:sr-only">sweeps · {relativeTime(freshness.at)}</span>
      <span aria-hidden className="hidden rail-narrow:inline">
        {compactRelativeTime(freshness.at)}
      </span>
    </Chip>
  );
}

export function SchemaChip({ schema }: { schema: SchemaState }) {
  if (schema.kind === "unknown") {
    return (
      <Badge variant="unknown" title="the database could not be reached" className={TIGHT_BADGE}>
        <span className="rail-narrow:sr-only">schema unknown</span>
      </Badge>
    );
  }
  if (schema.kind === "drift") {
    // The read-model may be describing a schema that has moved. Degraded, so: warn.
    return (
      <Badge
        variant="warn"
        title={`database at ${schema.version}; this UI was built against ${schema.expected}`}
        className={TIGHT_BADGE}
      >
        {/* Collapsed: the amber dot and the number the database is actually at. The comparison
            it drops is the reason `--shell-rail-w-min` is 4.5rem and not 4rem — this is the
            widest thing the standing block still has to fit. */}
        <span className="rail-narrow:sr-only">schema </span>
        {shortVersion(schema.version)}
        <span className="rail-narrow:sr-only"> · built for {shortVersion(schema.expected)}</span>
      </Badge>
    );
  }
  return (
    <Chip title={`${schema.version}, applied ${absoluteTime(schema.appliedAt)}`}>
      <span className="rail-narrow:sr-only">schema </span>
      {shortVersion(schema.version)}
    </Chip>
  );
}

/**
 * Loading, which is not the same as unknown.
 *
 * "Still asking" and "asked, and could not find out" are different facts — the same
 * distinction the run vocabulary draws between a view's *loading* and a run's *running*.
 * Fixed width so the block does not shift when the answer arrives, at either rail width.
 */
export function ChipsSkeleton() {
  return (
    <div className={STANDING} aria-busy="true" aria-label="Loading status">
      <span className="h-5 w-28 animate-pulse rounded-full bg-surface-2 rail-narrow:w-10" />
      <span className="h-5 w-20 animate-pulse rounded-full bg-surface-2 rail-narrow:w-8" />
    </div>
  );
}

export function ChipsView({
  freshness,
  schema,
}: {
  freshness: Freshness;
  schema: SchemaState;
}) {
  return (
    <div className={STANDING}>
      <FreshnessChip freshness={freshness} />
      <SchemaChip schema={schema} />
    </div>
  );
}

/** The live pair. Always rendered inside a Suspense boundary — see `sidebar.tsx`. */
export async function ShellChips() {
  const { freshness, schema } = await shellStatus();
  return <ChipsView freshness={freshness} schema={schema} />;
}
