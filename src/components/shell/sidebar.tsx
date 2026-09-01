import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

import { ChipsSkeleton, ShellChips } from "./chips";
import { NavLinks } from "./nav-links";

/**
 * The left rail — identity at the top, the modules under it, what the system is doing at the
 * bottom.
 *
 * **This replaces the top bar, and the reasoning it was built on.** That bar's comment argued a
 * sidebar plus a right-hand detail rail would squeeze the dense table from both sides. The
 * answer is that both fit: the rail is 208px and the detail panel is ~290px, which on the widths
 * this app is actually used at leaves the table more room than a full-width bar plus a rail
 * ever did — and a top bar cannot hold five modules and a status block without becoming a
 * second navigation problem. This app is a set of views over one system; the rail is what says
 * so on every screen.
 *
 * Three zones, top to bottom:
 *
 * 1. **Identity.** The wordmark and what this thing is.
 * 2. **Modules.** What exists, then what is planned — see `nav-links.tsx` for why the planned
 *    ones are drawn at all.
 * 3. **Standing.** The freshness and schema chips, then the account controls. The chips read
 *    the database, so they sit behind their own `<Suspense>` and degrade to `unknown` — the
 *    rule has not changed, only where the chips live.
 */

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("shrink-0 text-sm font-semibold tracking-[0.25em] text-text-1", className)}
    >
      WAR<span className="text-brand">·</span>ROOM
    </Link>
  );
}

/** The rail's layout, with nothing fetched — so `/kitchen-sink` can render it whole. */
export function SidebarChrome({
  nav,
  standing,
  className,
}: {
  nav: React.ReactNode;
  standing: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex w-[var(--shell-rail-w)] shrink-0 flex-col gap-6 border-r border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="space-y-1 px-2.5 pt-1">
        <Wordmark />
        <p className="text-[11px] leading-tight text-text-3">Views over the outbound system</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>

      <div className="space-y-3 border-t border-hairline px-1 pt-3">{standing}</div>
    </aside>
  );
}

/**
 * The account controls, at the foot of the rail.
 *
 * Sign-out is a form, not a link: no state mutation on GET, and a prefetch must never be able
 * to sign the operator out.
 */
export function SidebarFooter() {
  return (
    <div className="flex items-center justify-between px-1.5">
      <Link
        href="/kitchen-sink"
        className="text-xs text-text-3 transition-colors hover:text-text-2"
      >
        kitchen sink
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="text-xs text-text-3 transition-colors hover:text-text-2"
        >
          sign out
        </button>
      </form>
    </div>
  );
}

export function Sidebar() {
  return (
    <SidebarChrome
      nav={<NavLinks />}
      standing={
        <>
          {/* The chips read the database. Without this boundary a layout-level read blocks
              every navigation until it answers — and the rule is that a read degrades, never
              blocks. The fallback is a skeleton rather than "unknown" on purpose: still asking
              and asked-but-could-not-find-out are different facts. */}
          <div className="flex flex-col items-start gap-1.5 px-1.5">
            <Suspense fallback={<ChipsSkeleton />}>
              <ShellChips />
            </Suspense>
          </div>
          <SidebarFooter />
        </>
      }
    />
  );
}
