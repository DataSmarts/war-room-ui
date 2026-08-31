import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { ChipsSkeleton, ShellChips } from "./chips";
import { NavLinks } from "./nav-links";

export function Wordmark() {
  return (
    <Link
      href="/"
      className="shrink-0 text-sm font-semibold tracking-[0.25em] text-text-1"
    >
      WAR<span className="text-brand">·</span>ROOM
    </Link>
  );
}

/**
 * The bar's layout, with nothing fetched.
 *
 * A top bar rather than a sidebar: every view carries a right-hand rail, and a sidebar plus
 * a rail squeezes the dense table from both sides.
 *
 * Responsive by **container** query, not viewport. Narrow is then a property of the box the
 * bar sits in — which is what lets `/kitchen-sink` render the real narrow layout inside a
 * small frame instead of a drawing of it. Wide: one row. Narrow: wordmark, then nav, then
 * the meta cluster, each on its own line. No JavaScript, no disclosure, no hamburger.
 */
export function TopBarChrome({
  nav,
  end,
  className,
}: {
  nav: React.ReactNode;
  end: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "@container sticky top-0 z-30 border-b border-hairline bg-background/80 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 @2xl:h-[var(--shell-bar-h)] @2xl:flex-nowrap @2xl:py-0">
        <Wordmark />
        <div className="w-full min-w-0 @2xl:w-auto @2xl:flex-1">{nav}</div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 @2xl:w-auto @2xl:justify-end">
          {end}
        </div>
      </div>
    </header>
  );
}

/** Matches the nav's height and rough width so nothing jumps when it hydrates. */
export function NavSkeleton() {
  return (
    <div className="flex items-center gap-5 py-1" aria-busy="true" aria-label="Loading navigation">
      <span className="h-4 w-14 animate-pulse rounded bg-surface-2" />
      <span className="h-4 w-20 animate-pulse rounded bg-surface-2" />
    </div>
  );
}

export function KitchenSinkLink() {
  return (
    <Link
      href="/kitchen-sink"
      className="shrink-0 text-xs text-text-3 transition-colors hover:text-text-2"
    >
      kitchen sink
    </Link>
  );
}

export function TopBar() {
  return (
    <TopBarChrome
      nav={
        // usePathname can suspend once Cache Components is on, and a suspending client
        // component in a layout is a build error rather than a slow page. The boundary costs
        // one element today and doubles as the nav's own loading rendering.
        <Suspense fallback={<NavSkeleton />}>
          <NavLinks />
        </Suspense>
      }
      end={
        <>
          {/* The chips read the database. Without this boundary a layout-level read blocks
              every navigation until it answers — and the rule is that a read degrades, never
              blocks. The fallback is a skeleton rather than "unknown" on purpose: still
              asking and asked-but-could-not-find-out are different facts. */}
          <Suspense fallback={<ChipsSkeleton />}>
            <ShellChips />
          </Suspense>
          <KitchenSinkLink />
        </>
      }
    />
  );
}
