import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { FlaskConical, LogOut } from "lucide-react";

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
 *
 * **And two widths, because "both fit" stopped being true below a laptop.** Under 64rem of app
 * frame the rail collapses to 4.5rem of icons; see `globals.css` for the two container queries
 * and why there are two. Everything the rail stops *showing* it keeps *saying*: a hidden label
 * is `sr-only`, never deleted, so a nav row's accessible name is the same at both widths and
 * the `title` stays a description rather than becoming the name by default.
 */

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      // Two renderings of one fact, so the name is pinned once here and both glyph spans are
      // decorative — otherwise the accessible name would change with the width.
      aria-label="War Room"
      className={cn("shrink-0 text-sm font-semibold tracking-[0.25em] text-text-1", className)}
    >
      <span aria-hidden className="rail-narrow:hidden">
        WAR<span className="text-brand">·</span>ROOM
      </span>
      {/* Hidden by default and shown only inside a narrow rail — never the other way round.
          `/login` renders this component with no `rail` container anywhere above it, so a
          variant that failed the other way would put `W·R` on the sign-in screen. */}
      <span aria-hidden className="hidden tracking-normal rail-narrow:inline">
        W<span className="text-brand">·</span>R
      </span>
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
        // `@container/rail` is the box every collapse inside this rail keys off. The narrow
        // rendering is a property of THIS element's width, which is the whole reason
        // `/kitchen-sink` can show it: make a rail narrow and it collapses, for the same reason
        // and by the same rule as the live shell.
        //
        // The padding is deliberately the same at both widths. An element can never query its
        // own container, so a `rail-narrow:` padding here would silently do nothing — and setting it
        // from outside would move the content box that the 8rem threshold is measured against.
        "@container/rail flex w-[var(--shell-rail-w)] shrink-0 flex-col gap-6 border-r border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      {/* `space-y-0` when narrow is not cosmetic: `space-y-*` skips only the last child, and a
          `display:none` strapline is still the last child — without it the wordmark keeps a
          4px margin under it against nothing. */}
      <div className="space-y-1 px-2.5 pt-1 rail-narrow:space-y-0 rail-narrow:px-0">
        <Wordmark className="rail-narrow:block rail-narrow:text-center" />
        <p className="text-[11px] leading-tight text-text-3 rail-narrow:hidden">
          Views over the outbound system
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>

      <div className="space-y-3 border-t border-hairline px-1 pt-3 rail-narrow:px-0">
        {standing}
      </div>
    </aside>
  );
}

/**
 * The account controls, at the foot of the rail.
 *
 * Sign-out is a form, not a link: no state mutation on GET, and a prefetch must never be able
 * to sign the operator out. Collapsed, both become icons — with the words kept for assistive
 * tech and repeated in the `title`, because a 47px column has room for a glyph and nothing else.
 */
const FOOT_CONTROL =
  "flex items-center gap-1.5 rounded-md text-xs text-text-3 transition-colors hover:text-text-2 " +
  // The nav column above scrolls, and a UA outline drawn outside a 47px row is the first thing
  // to get clipped. Drawn inside, it survives at both widths.
  "focus-visible:outline-2 focus-visible:outline-brand focus-visible:-outline-offset-2";

export function SidebarFooter() {
  return (
    <div className="flex items-center justify-between px-1.5 rail-narrow:flex-col rail-narrow:gap-2 rail-narrow:px-0">
      <Link href="/kitchen-sink" title="Kitchen sink" className={FOOT_CONTROL}>
        <FlaskConical className="hidden size-4 shrink-0 rail-narrow:block" aria-hidden />
        <span className="rail-narrow:sr-only">kitchen sink</span>
      </Link>
      <form action={signOut}>
        <button type="submit" title="Sign out" className={FOOT_CONTROL}>
          <LogOut className="hidden size-4 shrink-0 rail-narrow:block" aria-hidden />
          <span className="rail-narrow:sr-only">sign out</span>
        </button>
      </form>
    </div>
  );
}

/**
 * The standing block's contents and their order, in one place.
 *
 * `Sidebar` and every `/kitchen-sink` frame render the same block. Hand-rolled copies of it are
 * copies that drift, and a sink showing a rail the app does not have is worse than no sink.
 */
export function SidebarStanding({ chips }: { chips: React.ReactNode }) {
  return (
    <>
      {chips}
      <SidebarFooter />
    </>
  );
}

export function Sidebar() {
  return (
    <SidebarChrome
      // The policy line, and it lives here rather than inside `SidebarChrome` for a reason:
      // `/kitchen-sink` renders the chrome from INSIDE the shell, so the `shell` container is
      // one of its ancestors too. Baked into the chrome, this class would collapse the sink's
      // wide frames along with the real rail whenever the window was narrow — and `cn` could
      // not undo it, because a variant utility and a bare one never conflict. Nothing in
      // `SidebarChrome` knows how wide the app frame is; this is the only line that does.
      className="shell-narrow:w-[var(--shell-rail-w-min)]"
      nav={<NavLinks />}
      standing={
        <SidebarStanding
          chips={
            /* The chips read the database. Without this boundary a layout-level read blocks
               every navigation until it answers — and the rule is that a read degrades, never
               blocks. The fallback is a skeleton rather than "unknown" on purpose: still asking
               and asked-but-could-not-find-out are different facts. */
            <Suspense fallback={<ChipsSkeleton />}>
              <ShellChips />
            </Suspense>
          }
        />
      }
    />
  );
}
