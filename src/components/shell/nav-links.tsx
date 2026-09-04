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
  { href: "/costs", label: "Costs", icon: Coins, blurb: "What each sweep spent, at the rate it was charged" },
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
  { label: "Copy", icon: PenLine, blurb: "Offers and the versions that went out" },
];

const ROW =
  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors " +
  // The nav column scrolls, and `overflow-y: auto` forces the other axis to clip too — so an
  // outline drawn outside a row is cut off. Drawn inside, it survives, and on a 47px rail it is
  // the only thing a keyboard has to go on.
  "focus-visible:outline-2 focus-visible:outline-brand focus-visible:-outline-offset-2 " +
  // Collapsed: the icon alone, centred. The 2px left border is transparent on every row so the
  // active one can colour it without moving anything by 2px.
  "rail-narrow:justify-center rail-narrow:gap-0 rail-narrow:rounded-l-none rail-narrow:border-l-2 " +
  "rail-narrow:border-transparent rail-narrow:px-0";

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
            // The label leads, because collapsed this is the only place it can be read at all —
            // a title of "What discovery was asked to find" that never says "Sweeps" is a
            // tooltip for a rail that still has its labels. One string, both widths.
            title={`${item.label} — ${item.blurb}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              ROW,
              // Purple is identity. The active section is the only place it appears in this
              // rail, and it never encodes a state. Collapsed, the tint alone has 47px to work
              // with, so it is joined by a rule down the left — the same move `/sweeps` makes
              // for a stopped sweep, in the other colour axis.
              active
                ? "bg-brand/15 font-medium text-brand rail-narrow:border-brand"
                : "text-text-2 hover:bg-surface-2 hover:text-text-1",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {/* Hidden, never deleted. `sr-only` keeps the link's accessible name "Sweeps" at
                both widths; `hidden` would drop it to the title, which is a description. */}
            <span className="truncate rail-narrow:sr-only">{item.label}</span>
          </Link>
        );
      })}

      {/* Collapsed, the word goes and the rule stays: with its only child out of flow the
          paragraph is 0px tall, so its own `border-t` is the separator. The grouping is the
          fact worth keeping — the three planned modules stay drawn at both widths, because a
          nav that hides them implies discovery is the whole system. */}
      <p className="mt-5 mb-1 px-2.5 text-[10px] font-medium tracking-widest text-text-3 uppercase rail-narrow:mx-2 rail-narrow:mt-3 rail-narrow:mb-2 rail-narrow:border-t rail-narrow:border-hairline rail-narrow:px-0">
        <span className="rail-narrow:sr-only">Planned</span>
      </p>

      {PLANNED_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            title={`${item.label} — ${item.blurb}`}
            aria-disabled="true"
            className={cn(ROW, "cursor-default text-text-3")}
          >
            <Icon className="size-4 shrink-0 opacity-60" aria-hidden />
            <span className="truncate rail-narrow:sr-only">{item.label}</span>
            {/* No colour: "not built" is absent knowledge about a screen, not a status. It is
                still said collapsed, just not shown — the dimming and the rule above are what
                carry it visually. */}
            <span className="ml-auto text-[10px] text-text-3 rail-narrow:sr-only">not built</span>
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
