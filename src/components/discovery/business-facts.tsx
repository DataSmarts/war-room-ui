import * as React from "react";

import { Badge } from "@/components/ui/badge";
import {
  CHECK_STATE_VALUES,
  httpHref,
  WEB_PRESENCE_VALUES,
  type CheckState,
  type ContactsCheck,
  type RatingReading,
  type WebPresence,
} from "@/lib/discovery/derive";
import type { BusinessRow } from "@/lib/discovery/sql";
import { absoluteTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Where a business fact is paired with a rendering — for all four vocabularies, and nowhere else.
 *
 * `status-pill.tsx` does this job for run state and sweep standing. This is the same job for the
 * four readings `derive.ts` makes about a business, and it exists for the same reason: a table, a
 * rail, a filter and a kitchen sink would otherwise each arrive at their own words.
 *
 * **None of these is a status, so none of them gets a colour.** Purple is identity; ok / warn /
 * fail / info is severity; "this business has no website" is neither. What every mark below
 * spends instead is weight and glyph — near-monochrome, which is the restraint the design
 * language is built on.
 *
 * The one exception proves the rule. `Badge variant="unknown"` — a hollow ring, no hue — appears
 * exactly where knowledge is genuinely absent: nobody looked for socials, nobody looked for
 * contacts, nobody has rated the business. **It is never spent on a fact.** "No site" is
 * knowledge, arrived at by looking, and rendering it hollow would say we never asked.
 */

/** Absent knowledge, and the only badge on this page. Absence of colour means absence of it. */
function Hollow({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <Badge variant="unknown" title={title}>
      {children}
    </Badge>
  );
}

/**
 * A provider's URL, clickable only if `httpHref` allows it.
 *
 * Nothing in this app builds an `href` any other way. When the scheme is not http(s) the value is
 * still rendered — it is a fact about the business — it simply is not a link.
 */
function ExternalLink({
  uri,
  children,
  className,
}: {
  uri: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const href = httpHref(uri);
  if (!href) {
    return (
      <span
        className={cn(className, "text-text-3")}
        title="not an http(s) URL — shown, but not linked"
      >
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(className, "decoration-hairline underline-offset-4 hover:underline")}
    >
      {children}
    </a>
  );
}

// --- web presence ------------------------------------------------------------------------------

/** The filter's words and the sink's notes. The cell renders the domain itself, not a label. */
export const WEB_PRESENCE: Record<WebPresence, { label: string; note: string }> = {
  site: {
    label: "own site",
    note: "a domain of its own — the only one of the three that is reachable downstream",
  },
  "off-platform": {
    label: "elsewhere",
    note: "a page on someone else's platform: a linktr.ee, a Facebook page, a Yelp listing. A real presence, and not 'no website'",
  },
  none: {
    label: "no site",
    note: "no URL of any kind. Known, not unknown — which is why it carries no hollow ring",
  },
};

export const WEB_PRESENCE_ORDER: readonly WebPresence[] = WEB_PRESENCE_VALUES;

/**
 * `wrap` is layout, not vocabulary: a dense cell truncates an off-platform URL and carries the
 * whole of it in a `title`, the rail has room to show it. The words do not change either way.
 */
export function WebPresenceMark({
  row,
  wrap = false,
}: {
  row: BusinessRow;
  wrap?: boolean;
}) {
  switch (row.web) {
    case "site":
      return (
        <ExternalLink uri={row.websiteUri} className="font-mono text-text-1">
          {row.websiteDomain}
        </ExternalLink>
      );
    case "off-platform":
      return (
        <div className="min-w-0">
          {/* The full URL is never withheld — truncated on screen, whole in the tooltip. */}
          <span title={row.websiteUri ?? undefined}>
            <ExternalLink
              uri={row.websiteUri}
              className={cn(
                "block font-mono text-text-2",
                wrap ? "break-all" : "truncate",
              )}
            >
              {row.websiteUri}
            </ExternalLink>
          </span>
          <div
            className="mt-0.5 text-xs text-text-3"
            title={WEB_PRESENCE["off-platform"].note}
          >
            elsewhere
          </div>
        </div>
      );
    case "none":
      // Definite, and deliberately not hollow: we looked at the payload and there was no URL.
      return <span className="text-text-3">no site</span>;
  }
}

// --- socials -----------------------------------------------------------------------------------

export const SOCIALS: Record<CheckState, { label: string; note: string }> = {
  found: {
    label: "found",
    note: "at least one profile worth staking outreach on",
  },
  "none-confirmed": {
    label: "none confirmed",
    note: "we looked and found nobody — a fact about the business, never a gap in our data, and never rendered as plain 'none'",
  },
  "never-looked": {
    label: "never looked",
    note: "no check has been run. The hollow ring is the whole point: absent knowledge, not an absent profile",
  },
};

export const SOCIALS_ORDER: readonly CheckState[] = CHECK_STATE_VALUES;

/** One list of platforms, so the table and the rail cannot enumerate different ones. */
const PLATFORMS: ReadonlyArray<{ label: string; of: (row: BusinessRow) => string | null }> =
  [
    { label: "facebook", of: (row) => row.facebookUrl },
    { label: "instagram", of: (row) => row.instagramUrl },
    { label: "x", of: (row) => row.xUrl },
    { label: "linkedin", of: (row) => row.linkedinUrl },
  ];

export function SocialsMark({ row }: { row: BusinessRow }) {
  switch (row.socials) {
    case "found":
      return (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {PLATFORMS.filter(({ of }) => of(row) !== null).map(({ label, of }) => (
            <ExternalLink key={label} uri={of(row)} className="text-text-2">
              {label}
            </ExternalLink>
          ))}
        </div>
      );
    case "none-confirmed":
      return (
        <span
          className="text-text-2"
          title={
            row.socialsCheckedAt
              ? `looked on ${absoluteTime(row.socialsCheckedAt)}, found nobody`
              : undefined
          }
        >
          none confirmed
        </span>
      );
    case "never-looked":
      return <Hollow title={SOCIALS["never-looked"].note}>never looked</Hollow>;
  }
}

// --- contacts ----------------------------------------------------------------------------------

/**
 * Two entries, not three — the column that had to give something up.
 *
 * The question a "Contacts" column wants to answer is *does this business have any*, and this
 * role cannot answer it: `contacts` is ungranted (§6). So the column answers the question it
 * can — **were they looked for** — and says the date it happened. What the looking found is not
 * claimed anywhere on this page.
 */
export const CONTACTS: Record<ContactsCheck, { label: string; note: string }> = {
  checked: {
    label: "checked",
    note: "an enrichment ran on this date. Whether it found anyone is not readable by this role",
  },
  "never-looked": {
    label: "never looked",
    note: "no enrichment has run. Nothing is known about this business's contacts either way",
  },
};

export const CONTACTS_ORDER: readonly ContactsCheck[] = ["checked", "never-looked"];

export function ContactsMark({ row }: { row: BusinessRow }) {
  if (row.contacts === "never-looked") {
    return <Hollow title={CONTACTS["never-looked"].note}>never looked</Hollow>;
  }
  return (
    <span
      className="whitespace-nowrap text-text-2"
      title={
        row.contactsCheckedAt
          ? `${absoluteTime(row.contactsCheckedAt)} — whether it found anyone is not readable by this role`
          : undefined
      }
    >
      checked {row.contactsCheckedAt ? relativeTime(row.contactsCheckedAt) : ""}
    </span>
  );
}

// --- rating ------------------------------------------------------------------------------------

export const RATINGS: Record<RatingReading["kind"], { label: string; note: string }> = {
  rated: {
    label: "rated",
    note: "enough reviews behind it to read as a rating",
  },
  thin: {
    label: "thin",
    note: "fewer than ten reviews. The number is shown and the weight is not — a 5.0 from four reviews is a sample, not a score",
  },
  unrated: {
    label: "never rated",
    note: "no rating and no reviews. Absent knowledge, so it carries the hollow ring",
  },
};

export const RATINGS_ORDER: readonly RatingReading["kind"][] = ["rated", "thin", "unrated"];

/**
 * A number and its sample size, always together, and never a shape.
 *
 * No stars, no bar, no meter — anywhere, for either kind. A filled shape reads as confidence, and
 * the whole point of the `thin` reading is that the confidence is not there to draw.
 */
export function RatingMark({ reading }: { reading: RatingReading }) {
  if (reading.kind === "unrated") {
    return <Hollow title={RATINGS.unrated.note}>never rated</Hollow>;
  }
  const thin = reading.kind === "thin";
  return (
    <div className="whitespace-nowrap">
      <span className={cn("tabular-nums", thin ? "text-text-3" : "text-text-1")}>
        {reading.rating.toFixed(1)}
      </span>{" "}
      <span className="text-xs text-text-3 tabular-nums">
        {reading.reviews} {reading.reviews === 1 ? "review" : "reviews"}
      </span>
      {thin ? (
        <div className="mt-0.5 text-xs text-text-3" title={RATINGS.thin.note}>
          thin
        </div>
      ) : null}
    </div>
  );
}
