"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The primary destinations, and only those.
 *
 * `Route` is `string & {}` while `typedRoutes` is off, so this compiles today and starts
 * rejecting a typo'd href the day the flag is turned on — with no change needed here.
 *
 * `/kitchen-sink` is deliberately absent. It is a development surface, and leaving it out
 * means the two pages an operator lands on most often are genuine no-active-route pages
 * rather than a state we had to contrive one.
 */
export const NAV_ITEMS: { href: Route; label: string }[] = [
  { href: "/sweeps", label: "Sweeps" },
  { href: "/businesses", label: "Businesses" },
];

/**
 * The rendering, with the pathname handed in.
 *
 * Split from the hook on purpose: `/kitchen-sink` shows the bar's no-active-route state by
 * passing a pathname, rather than by mocking a router or drawing a picture of one.
 */
export function NavLinksView({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-5 overflow-x-auto"
    >
      {NAV_ITEMS.map((item) => {
        // A child route keeps its section lit — /sweeps/<batch> is still Sweeps.
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 py-1 text-sm transition-colors",
              // Purple is identity. The active link is the only place it appears in this
              // bar, and it never encodes a state.
              active
                ? "font-medium text-brand"
                : "text-text-2 hover:text-text-1",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Layouts in this version do not re-render on navigation and cannot read the pathname, so
 * the active link has to be concluded on the client. There is no `activeClassName` on Link
 * and no server-side pathname — this is the documented pattern, not a workaround.
 */
export function NavLinks() {
  return <NavLinksView pathname={usePathname()} />;
}
