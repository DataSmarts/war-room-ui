import * as React from "react";

import { Badge } from "@/components/ui/badge";
import type { Freshness, SchemaState } from "@/lib/shell-status";
import { shellStatus } from "@/lib/shell-status";
import { absoluteTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The bar's two chips: how fresh the data is, and which migration it was built against.
 *
 * Colour appears only where there is a status to report. A chip that is green whenever
 * nothing is wrong turns the top bar into a christmas tree and teaches the operator to stop
 * looking at it — so the ordinary case is plain metadata, drift is `warn`, and a read we
 * could not make is `unknown`: the deliberate absence of a hue, because absence of colour
 * means absence of knowledge.
 */

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
        className,
      )}
    >
      {children}
    </span>
  );
}

function shortVersion(version: string): string {
  // "007_run_state" → "007". The whole string goes in the title.
  return version.split("_")[0] ?? version;
}

/**
 * Labelled "sweeps", not "data". `max(runs.updated_at)` knows about discovery and nothing
 * else — businesses, contacts and outreach move on their own clocks, and calling this the
 * whole database's freshness would overclaim. Other views can add their own.
 */
export function FreshnessChip({ freshness }: { freshness: Freshness }) {
  if (freshness.kind === "unknown") {
    return (
      <Badge variant="unknown" title="the database could not be reached">
        sweeps unknown
      </Badge>
    );
  }
  if (freshness.kind === "no-runs") {
    // We looked. Discovery has never run. That is a fact, not a failure.
    return <Chip title="no runs recorded">no sweeps yet</Chip>;
  }
  return (
    <Chip title={`last page landed ${absoluteTime(freshness.at)}`}>
      sweeps · {relativeTime(freshness.at)}
    </Chip>
  );
}

export function SchemaChip({ schema }: { schema: SchemaState }) {
  if (schema.kind === "unknown") {
    return (
      <Badge variant="unknown" title="the database could not be reached">
        schema unknown
      </Badge>
    );
  }
  if (schema.kind === "drift") {
    // The read-model may be describing a schema that has moved. Degraded, so: warn.
    return (
      <Badge
        variant="warn"
        title={`database at ${schema.version}; this UI was built against ${schema.expected}`}
      >
        schema {shortVersion(schema.version)} · built for{" "}
        {shortVersion(schema.expected)}
      </Badge>
    );
  }
  return (
    <Chip title={`${schema.version}, applied ${absoluteTime(schema.appliedAt)}`}>
      schema {shortVersion(schema.version)}
    </Chip>
  );
}

/**
 * Loading, which is not the same as unknown.
 *
 * "Still asking" and "asked, and could not find out" are different facts — the same
 * distinction the run vocabulary draws between a view's *loading* and a run's *running*.
 * Fixed width so the bar does not shift when the answer arrives.
 */
export function ChipsSkeleton() {
  return (
    <div className="flex items-center gap-2" aria-busy="true" aria-label="Loading status">
      <span className="h-5 w-28 animate-pulse rounded-full bg-surface-2" />
      <span className="h-5 w-20 animate-pulse rounded-full bg-surface-2" />
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
    <div className="flex items-center gap-2">
      <FreshnessChip freshness={freshness} />
      <SchemaChip schema={schema} />
    </div>
  );
}

/** The live pair. Always rendered inside a Suspense boundary — see `top-bar.tsx`. */
export async function ShellChips() {
  const { freshness, schema } = await shellStatus();
  return <ChipsView freshness={freshness} schema={schema} />;
}
