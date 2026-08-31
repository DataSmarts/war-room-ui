import * as React from "react";

import { TopBar } from "@/components/shell/top-bar";

/**
 * The frame every view sits in.
 *
 * A route group, so the group's parentheses never reach a URL and anything that must render
 * *without* the shell — a login screen, say — lands as a sibling of this folder rather than
 * forcing a restructure.
 */
export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <TopBar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
