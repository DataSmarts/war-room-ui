import Link from "next/link";

import { EmptyState } from "@/components/pending";
import { PageHeader } from "@/components/shell/page-header";

/**
 * The 404 for a sweep id that matched nothing, rendered inside the shell.
 *
 * Without this file Next's default 404 renders — and that page follows the operating system's
 * colour scheme rather than the app's, so a dark-only app would hand back a white screen for a
 * stale link. It also says nothing about which of the two things went wrong.
 *
 * **Not-found, never unknown.** Reaching here means the database answered and held no such
 * batch and no such run. A read that could not be made takes the other path and says so.
 */
export default function SweepNotFound() {
  return (
    <>
      <PageHeader title="No such sweep" />
      <div className="p-4">
        <EmptyState
          title="That id matched nothing"
          hint="The database answered, and holds no batch and no run with this id — so the link is stale or hand-edited, not broken. This is a not-found, not a read we could not make."
          action={
            <Link
              href="/sweeps"
              className="text-xs text-text-2 decoration-hairline underline underline-offset-4 hover:text-text-1"
            >
              ← all sweeps
            </Link>
          }
        />
      </div>
    </>
  );
}
