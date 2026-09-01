import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Text that may only be reached by asking for it.
 *
 * A `<details>`, and the point is that it is **structural**. Two kinds of string in this app can
 * carry a provider's raw response body — a failed read's reason, and a run's `error` or
 * `aborted_reason` (§5.12) — and a Google error body can echo the request URL, which carries
 * `key=`. Neither may reach a list cell, page prose, metadata or a log.
 *
 * Putting the folding in one component rather than in each caller is what keeps that true. A
 * caller passes the string here and has no way to render it flat; a caller that re-typed its own
 * `<details>` beside this one would eventually not.
 *
 * Redacting the string is still the caller's job — this component cannot know what a secret
 * looks like. Keeping it folded away is this component's.
 */
export function Disclosure({
  summary,
  children,
  className,
}: {
  /** What the reader is choosing to open. Say what it is, not "click here". */
  summary: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("text-xs", className)}>
      <summary className="cursor-pointer text-text-3 marker:text-text-3 hover:text-text-2">
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

/**
 * The body itself: monospace, scrollable, wrapping, and never wider than its column.
 *
 * `break-all` because the thing inside is frequently one unbroken 400-character line of JSON,
 * and a pre that does not break it makes its container scroll the whole page sideways.
 */
export function DisclosureBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "max-h-48 overflow-auto rounded bg-surface-2 p-2 font-mono text-[11px] break-all whitespace-pre-wrap text-text-3",
        className,
      )}
    >
      {children}
    </pre>
  );
}
