import * as React from "react";

import { EmptyState, LoadingRows } from "@/components/pending";
import { cn } from "@/lib/utils";

/**
 * A dense list with a persistent right-hand detail rail.
 *
 * This rail is why the app has a top bar and not a sidebar: a sidebar plus a rail squeezes
 * the table from both sides. Container query again, so the stacked layout is a property of
 * the box and can be shown truthfully at any width.
 *
 * Selection belongs in the URL — that is the view's job, not this component's.
 */
export function DetailLayout({
  rail,
  children,
  className,
}: {
  rail: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("@container", className)}>
      <div className="grid @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 p-4">{children}</div>
        <aside
          aria-label="Detail"
          className="border-t border-hairline p-4 @4xl:sticky @4xl:top-[var(--shell-bar-h)] @4xl:max-h-[calc(100dvh-var(--shell-bar-h))] @4xl:overflow-y-auto @4xl:border-t-0 @4xl:border-l"
        >
          {rail}
        </aside>
      </div>
    </div>
  );
}

// The rail's states are the page's pending states, sized for the rail — not a second set of
// cards that can drift from the first.

export function RailEmpty() {
  return (
    <EmptyState
      title="Nothing selected"
      hint="Pick a row and everything known about it appears here. The selection lives in the URL, so it survives a reload and travels in a link."
    />
  );
}

export function RailLoading() {
  return <LoadingRows rows={4} />;
}

export function RailNotFound() {
  return (
    <EmptyState
      title="Not found"
      hint="Nothing in the list matches that selection — the link is probably stale. The list beside it is unaffected."
    />
  );
}
