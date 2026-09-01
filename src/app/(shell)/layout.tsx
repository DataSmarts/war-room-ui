import * as React from "react";

import { Sidebar } from "@/components/shell/sidebar";
import { requireSession } from "@/lib/auth/guard";

/**
 * The frame every view sits in.
 *
 * A route group, so the group's parentheses never reach a URL and anything that must render
 * *without* the shell — a login screen, say — lands as a sibling of this folder rather than
 * forcing a restructure. `/login` is exactly that sibling.
 *
 * **The session check is here, not only in `proxy.ts`, and the duplication is the point.** Next's
 * own guide calls the proxy an *optimistic* check and says it should not be the only line of
 * defence, because the real one belongs as close as possible to the data. This is that line:
 * every view under this layout reads Neon, and a matcher pattern is a poor last thing between a
 * stranger and 712 firms' names, addresses and phone numbers.
 *
 * Deliberately **not** behind `<Suspense>`. The Suspense rule in CLAUDE.md is about database
 * reads — which degrade to unknown and must never block a navigation. This is neither: it reads
 * a cookie, it cannot degrade, and a shell that streamed before it knew who was asking would
 * have already sent the frame to whoever asked.
 */
export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  return (
    // The rail is fixed-width and the main column takes the rest. `min-w-0` on the column is
    // load-bearing: without it a dense table's intrinsic width wins the flex negotiation and
    // pushes the whole page into a horizontal scroll instead of scrolling inside its own
    // container.
    <div className="flex flex-1">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
