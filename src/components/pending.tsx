import * as React from "react";

import { Disclosure, DisclosureBody } from "@/components/disclosure";
import { cn } from "@/lib/utils";

/**
 * The four pending states, first-class.
 *
 * A pipeline app is mostly empty / loading / partial / failed, and at single-digit volumes
 * those are the common case rather than the edge. Every view ships all of them.
 *
 * A different axis from run state: this is what the **page** is doing, that is what the
 * **data** says. Both appear on the same screen, and neither is allowed to borrow the
 * other's words.
 */

const CARD = "rounded-md border border-hairline bg-surface-1 p-3";

export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  /** What would appear here, and how to cause it. An empty state that only says "empty"
   *  makes the operator guess whether the system is broken or merely idle. */
  hint: string;
  action?: React.ReactElement;
  className?: string;
}) {
  return (
    <div className={cn(CARD, "space-y-2", className)}>
      <p className="text-xs font-medium text-text-2">{title}</p>
      <p className="text-xs text-text-3">{hint}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

// Cycled so the bars read as text rather than as a bar chart.
const ROW_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/12"];

export function LoadingRows({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(CARD, "space-y-2", className)}
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 animate-pulse rounded bg-surface-2",
            ROW_WIDTHS[i % ROW_WIDTHS.length],
          )}
        />
      ))}
    </div>
  );
}

export function LowDataNotice({
  n,
  noun,
  plural = `${noun}s`,
  className,
}: {
  n: number;
  noun: string;
  /** Pass it where adding an "s" would be wrong. */
  plural?: string;
  className?: string;
}) {
  // Say the number instead of dressing it up. A three-point line drawn confidently is a
  // claim about a trend that three points cannot support.
  return (
    <div className={cn(CARD, "text-xs text-text-2", className)}>
      {n} {n === 1 ? noun : plural} — too few to read a trend from
    </div>
  );
}

export function FailedState({
  title,
  detail,
  className,
}: {
  title: string;
  /** The provider's own words. Rendered behind a disclosure, always. */
  detail?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-md border border-status-fail/40 bg-surface-1 p-3",
        className,
      )}
    >
      <p className="text-xs font-medium text-text-2">{title}</p>
      {detail ? (
        // Structural, not advisory: the reason can only be reached through the disclosure, so
        // no caller can put it in a list cell or in page prose. `Disclosure` holds the one
        // implementation — a run's scars go through the same component, for the same reason.
        <Disclosure summary="reason">
          <DisclosureBody>{detail}</DisclosureBody>
        </Disclosure>
      ) : null}
    </div>
  );
}
