"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Coins,
  PenLine,
  Radar,
  Send,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The modules, and which of them exist yet.
 *
 * This app is a set of views over one system — discovery today, outreach and costs and copy
 * next — so the nav is the roadmap made visible rather than a list of the two pages that
 * happen to be finished. A module is one line here.
 *
 * `Route` is `string & {}` while `typedRoutes` is off, so this compiles today and starts
 * rejecting a typo'd href the day the flag is turned on — with no change needed here.
 */
export interface NavItem {
  readonly href: Route;
  readonly label: string;
  readonly icon: LucideIcon;
  /** What the section answers. Shown as the link's title, and it is the thing that stops a
   *  module being added because the nav looked short. */
  readonly blurb: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/sweeps", label: "Sweeps", icon: Radar, blurb: "What discovery was asked to find" },
  { href: "/businesses", label: "Businesses", icon: Building2, blurb: "What came back, and what is known about it" },
];

/**
 * Named, dimmed, and not links.
 *
 * The alternative is a nav that silently implies discovery is the whole system. **A planned
 * module renders as planned** — the same distinction the read model insists on everywhere
 * else: "not built" is a different fact from "empty", and the businesses stub already says so
 * in those words. Delete a row from here the moment it moves to `NAV_ITEMS`.
 */
export const PLANNED_ITEMS: readonly Omit<NavItem, "href">[] = [
  { label: "Outreach", icon: Send, blurb: "Campaigns, sequences, and what Instantly did with them" },
  { label: "Costs", icon: Coins, blurb: "What a sweep spent — needs a schema change first (§5.11)" },
  { label: "Copy", icon: PenLine, blurb: "Offers and the versions that went out" },
];

const ROW = "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors";

/**
 * The rendering, with the pathname handed in.
 *
 * Split from the hook on purpose: `/kitchen-sink` shows the rail's active and no-active-route
 * states by passing a pathname, rather than by mocking a router or drawing a picture of one.
 */
export function NavLinksView({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        // A child route keeps its section lit — /sweeps/<batch> is still Sweeps.
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.blurb}
            aria-current={active ? "page" : undefined}
            className={cn(
              ROW,
              // Purple is identity. The active section is the only place it appears in this
              // rail, and it never encodes a state.
              active
                ? "bg-brand/15 font-medium text-brand"
                : "text-text-2 hover:bg-surface-2 hover:text-text-1",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      <p className="mt-5 mb-1 px-2.5 text-[10px] font-medium tracking-widest text-text-3 uppercase">
        Planned
      </p>

      {PLANNED_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            title={item.blurb}
            aria-disabled="true"
            className={cn(ROW, "cursor-default text-text-3")}
          >
            <Icon className="size-4 shrink-0 opacity-60" aria-hidden />
            <span className="truncate">{item.label}</span>
            {/* No colour: "not built" is absent knowledge about a screen, not a status. */}
            <span className="ml-auto text-[10px] text-text-3">not built</span>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Layouts in this version do not re-render on navigation and cannot read the pathname, so the
 * active link has to be concluded on the client. There is no `activeClassName` on Link and no
 * server-side pathname — this is the documented pattern, not a workaround.
 */
export function NavLinks() {
  return <NavLinksView pathname={usePathname()} />;
}
