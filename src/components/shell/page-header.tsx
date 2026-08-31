import * as React from "react";

/**
 * A page's title, and room for exactly one primary action.
 *
 * `action` is a single `ReactElement` rather than a `ReactNode`: a list in the slot is a
 * type error, so the constraint holds where it can be checked instead of in a comment
 * nobody reads. One page, one primary action — and it is the only purple button on it.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactElement;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-hairline px-4 py-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-lg font-semibold text-text-1">{title}</h1>
        {description ? (
          <p className="max-w-prose text-sm text-text-2">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
