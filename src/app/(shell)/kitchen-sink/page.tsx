import {
  CONTACTS,
  CONTACTS_ORDER,
  ContactsMark,
  RATINGS,
  RATINGS_ORDER,
  RatingMark,
  SOCIALS,
  SOCIALS_ORDER,
  SocialsMark,
  WEB_PRESENCE,
  WEB_PRESENCE_ORDER,
  WebPresenceMark,
} from "@/components/discovery/business-facts";
import {
  BusinessFilterBar,
  BusinessFiltersLoading,
} from "@/components/discovery/business-filters";
import {
  BusinessRailFacts,
  SightingsFailed,
  SightingsLoading,
  SightingsView,
} from "@/components/discovery/business-rail";
import {
  BusinessCount,
  BusinessesEmpty,
  BusinessesFailed,
  BusinessesFiltered,
  BusinessesLoading,
  BusinessTable,
} from "@/components/discovery/business-table";
import {
  RunRailFacts,
  RunScarsFailed,
  RunScarsLoading,
  RunScarsView,
} from "@/components/discovery/run-rail";
import {
  RunCount,
  RunsFailed,
  RunsLoading,
  RunTable,
} from "@/components/discovery/run-table";
import {
  SweepCount,
  SweepsEmpty,
  SweepsFailed,
  SweepsLoading,
  SweepTable,
} from "@/components/discovery/sweep-table";
import {
  EmptyState,
  FailedState,
  LoadingRows,
  LowDataNotice,
} from "@/components/pending";
import {
  ChipsSkeleton,
  ChipsView,
  FreshnessChip,
  SchemaChip,
} from "@/components/shell/chips";
import {
  DetailLayout,
  RailEmpty,
  RailLoading,
  RailNotFound,
} from "@/components/shell/detail-rail";
import { NavLinksView } from "@/components/shell/nav-links";
import { PageHeader } from "@/components/shell/page-header";
import {
  SidebarChrome,
  SidebarStanding,
} from "@/components/shell/sidebar";
import {
  RUN_STATES,
  RunState,
  StatusPill,
  SWEEP_STANDING_ORDER,
  SWEEP_STANDINGS,
  SweepStanding,
  SweepStandingPill,
} from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  checkState,
  ratingReading,
  redactSecrets,
  resultCount,
  webPresence,
  type CheckState,
  type RatingReading,
  type WebPresence,
} from "@/lib/discovery/derive";
import type { BusinessRow, RunRow, SightingRow, SweepRow } from "@/lib/discovery/sql";
import { LoginFormView, LoginNoticeLine } from "@/components/auth/login-form";
import { LOGIN_IDLE, LOGIN_NOTICE_VALUES } from "@/lib/auth/notices";
import { EXPECTED_SCHEMA } from "@/lib/shell-status";

const surfaces = [
  { name: "background", cls: "bg-background" },
  { name: "surface-1", cls: "bg-surface-1" },
  { name: "surface-2", cls: "bg-surface-2" },
];

const chart = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

const runStates = Object.entries(RUN_STATES) as [
  RunState,
  (typeof RUN_STATES)[RunState],
][];

const standings = SWEEP_STANDING_ORDER.map(
  (standing) => [standing, SWEEP_STANDINGS[standing]] as const,
);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Only the states a fixture cares about; the rest are nought. */
function runs(counts: Partial<Record<RunState, number>>): Record<RunState, number> {
  return { completed: 0, aborted: 0, errored: 0, running: 0, stalled: 0, ...counts };
}

const ago = (ms: number) => new Date(Date.now() - ms);

/**
 * Invented sweeps — every standing and every shape, none of which the database currently holds.
 *
 * Four of the five standings have never occurred in a real row, which is exactly why they are
 * here rather than left to a screenshot to stumble across one day. The cities and niches are
 * made up: this repo is public, and the live campaign's targeting is not something it commits.
 *
 * Rows two and three are **deliberately identical in every number** — see the caption.
 */
const SWEEP_FIXTURES: SweepRow[] = [
  {
    batchId: "9f2c41ab-0000-4000-8000-000000000001",
    runId: null,
    firstRunAt: ago(26 * HOUR),
    lastProgressAt: ago(25 * HOUR),
    queries: 12,
    cities: ["Portland"],
    niches: ["roofers"],
    businessesNew: 214,
    sightingsKnown: 96,
    saturatedQueries: 9,
    states: runs({ completed: 12 }),
  },
  {
    batchId: "3ad70e55-0000-4000-8000-000000000002",
    runId: null,
    firstRunAt: ago(3 * HOUR),
    lastProgressAt: ago(2 * HOUR),
    queries: 12,
    cities: ["Sacramento"],
    niches: ["orthodontists"],
    businessesNew: 168,
    sightingsKnown: 74,
    saturatedQueries: 7,
    states: runs({ completed: 11, aborted: 1 }),
  },
  {
    batchId: "c81b96d4-0000-4000-8000-000000000003",
    runId: null,
    firstRunAt: ago(3 * HOUR),
    lastProgressAt: ago(4 * MINUTE),
    queries: 12,
    cities: ["Sacramento"],
    niches: ["orthodontists"],
    businessesNew: 168,
    sightingsKnown: 74,
    saturatedQueries: 7,
    states: runs({ completed: 11, running: 1 }),
  },
  {
    batchId: "5e0aa317-0000-4000-8000-000000000004",
    runId: null,
    firstRunAt: ago(9 * HOUR),
    lastProgressAt: ago(5 * HOUR),
    queries: 8,
    cities: ["Fresno"],
    niches: ["chiropractors"],
    businessesNew: 91,
    sightingsKnown: 38,
    saturatedQueries: 2,
    states: runs({ completed: 7, stalled: 1 }),
  },
  {
    batchId: "b6d4f209-0000-4000-8000-000000000005",
    runId: null,
    firstRunAt: ago(31 * HOUR),
    lastProgressAt: ago(30 * HOUR),
    queries: 9,
    cities: ["Tucson"],
    niches: ["hvac contractors"],
    businessesNew: 143,
    sightingsKnown: 61,
    saturatedQueries: 9,
    states: runs({ completed: 8, errored: 1 }),
  },
  {
    // Five counts that sum to five, over six runs. One run holds a word this build has never
    // seen, and the row says so rather than reading as complete.
    batchId: "0c73e8fa-0000-4000-8000-000000000006",
    runId: null,
    firstRunAt: ago(50 * HOUR),
    lastProgressAt: ago(49 * HOUR),
    queries: 6,
    cities: ["Boise"],
    niches: ["dentists"],
    businessesNew: 47,
    sightingsKnown: 12,
    saturatedQueries: 0,
    states: runs({ completed: 5 }),
  },
  {
    // A run that was never part of a grid. Its identity is its own id.
    batchId: null,
    runId: "e41d90c7-0000-4000-8000-000000000007",
    firstRunAt: ago(72 * HOUR),
    lastProgressAt: ago(72 * HOUR),
    queries: 1,
    cities: ["Reno"],
    niches: ["podiatrists"],
    businessesNew: 19,
    sightingsKnown: 0,
    saturatedQueries: 0,
    states: runs({ completed: 1 }),
  },
  {
    // Every run's city and niche came back null. Unrecorded, never blank.
    batchId: "7b52ce16-0000-4000-8000-000000000008",
    runId: null,
    firstRunAt: ago(96 * HOUR),
    lastProgressAt: ago(96 * HOUR),
    queries: 2,
    cities: [],
    niches: [],
    businessesNew: 6,
    sightingsKnown: 1,
    saturatedQueries: 0,
    states: runs({ completed: 2 }),
  },
];

/** One invented run. The defaults are an ordinary completed query; a case overrides what it is about. */
function makeRun(over: Partial<RunRow> & Pick<RunRow, "runId" | "query">): RunRow {
  return {
    niche: "orthodontists",
    city: "Sacramento",
    neighborhood: "Midtown",
    country: "US",
    results: resultCount(37),
    businessesMatched: 37,
    businessesNew: 21,
    businessesKnown: 16,
    businessesWithWebPresence: 33,
    completedAt: ago(3 * HOUR),
    createdAt: ago(3 * HOUR),
    updatedAt: ago(3 * HOUR),
    state: "completed",
    batchId: "3ad70e55-0000-4000-8000-000000000002",
    lat: 38.5749,
    lng: -121.4786,
    hasNextPage: false,
    hasError: false,
    hasAbortedReason: false,
    ...over,
  };
}

/**
 * The run states and result shapes the database has never held.
 *
 * Nothing in it is `aborted`, `errored`, `running` or `stalled`, and exactly one row in
 * forty-three carries a scar — so every reading below except the first two is invented, and
 * would otherwise never be looked at.
 */
const RUN_FIXTURES: RunRow[] = [
  makeRun({
    runId: "aa000001-0000-4000-8000-000000000001",
    query: "orthodontists in Midtown, Sacramento, CA",
    results: resultCount(60),
    businessesMatched: 60,
    businessesNew: 44,
    businessesKnown: 16,
    businessesWithWebPresence: 58,
  }),
  makeRun({
    runId: "aa000002-0000-4000-8000-000000000002",
    query: "orthodontists in Land Park, Sacramento, CA",
    neighborhood: "Land Park",
    results: resultCount(1),
    businessesMatched: 1,
    businessesNew: 1,
    businessesKnown: 0,
    businessesWithWebPresence: 1,
  }),
  makeRun({
    runId: "aa000003-0000-4000-8000-000000000003",
    query: "orthodontists in Curtis Park, Sacramento, CA",
    neighborhood: "Curtis Park",
  }),
  makeRun({
    // The trap, adjacent to the row above it: a scar AND an ending.
    runId: "aa000004-0000-4000-8000-000000000004",
    query: "orthodontists in East Sacramento, CA",
    neighborhood: "East Sacramento",
    hasError: true,
  }),
  makeRun({
    runId: "aa000005-0000-4000-8000-000000000005",
    query: "orthodontists in Oak Park, Sacramento, CA",
    neighborhood: "Oak Park",
    results: resultCount(0),
    businessesMatched: 0,
    businessesNew: 0,
    businessesKnown: 0,
    businessesWithWebPresence: 0,
    completedAt: null,
    state: "aborted",
    hasAbortedReason: true,
  }),
  makeRun({
    runId: "aa000006-0000-4000-8000-000000000006",
    query: "orthodontists in Tahoe Park, Sacramento, CA",
    neighborhood: "Tahoe Park",
    completedAt: null,
    state: "errored",
    hasError: true,
  }),
  makeRun({
    runId: "aa000007-0000-4000-8000-000000000007",
    query: "orthodontists in Elmhurst, Sacramento, CA",
    neighborhood: "Elmhurst",
    completedAt: null,
    updatedAt: ago(4 * MINUTE),
    state: "running",
    hasNextPage: true,
  }),
  makeRun({
    runId: "aa000008-0000-4000-8000-000000000008",
    query: "orthodontists in Colonial Village, Sacramento, CA",
    neighborhood: "Colonial Village",
    completedAt: null,
    state: "stalled",
  }),
  makeRun({
    // The view emitted a word this build has never seen. Drift, not a sixth state.
    runId: "aa000009-0000-4000-8000-000000000009",
    query: "orthodontists in Hollywood Park, Sacramento, CA",
    neighborhood: "Hollywood Park",
    completedAt: null,
    state: null,
  }),
];

const RUN_PAGE = { rows: RUN_FIXTURES, total: RUN_FIXTURES.length };

// --- businesses --------------------------------------------------------------------------------

const DAY = 24 * HOUR;

/**
 * A business fixture that cannot lie about itself.
 *
 * The four readings are **derived here by the same functions `toBusinessRow` uses**, rather than
 * set alongside the columns. A fixture that could carry `web: "site"` beside a null
 * `website_uri` would let this page show a row the read layer is incapable of producing — which
 * is the one thing a kitchen sink must never do, because the whole reason it exists is to be
 * trusted about states the database has not got round to holding.
 */
type BusinessSeed = Partial<Omit<BusinessRow, "web" | "socials" | "contacts">> &
  Pick<BusinessRow, "id" | "name">;

function makeBusiness(over: BusinessSeed): BusinessRow {
  const row = {
    googlePlaceId: "ChIJfake0000000000000000",
    websiteUri: "https://mercerortho.example/",
    websiteDomain: "mercerortho.example",
    formattedAddress: "1200 K St, Sacramento, CA 95814, USA",
    nationalPhone: "(916) 555-0134",
    internationalPhone: "+1 916-555-0134",
    rating: ratingReading(4.7, 214),
    facebookUrl: null,
    instagramUrl: null,
    xUrl: null,
    linkedinUrl: null,
    socialsCheckedAt: null,
    contactsCheckedAt: null,
    contactsFound: 0,
    createdAt: ago(6 * DAY),
    updatedAt: ago(2 * HOUR),
    sightings: 3,
    ...over,
  };

  return {
    ...row,
    web: webPresence(row.websiteUri, row.websiteDomain),
    socials: checkState(
      row.socialsCheckedAt,
      [row.facebookUrl, row.instagramUrl, row.xUrl, row.linkedinUrl].some(
        (url) => url !== null,
      ),
    ),
    contacts: checkState(row.contactsCheckedAt, row.contactsFound > 0),
  };
}

/**
 * The states the live table holds two of, or none of.
 *
 * Of 1416 businesses, **two** have an off-platform presence — so the row that teaches the third
 * state is a row nobody would ever meet by scrolling. A non-http URL has never appeared at all,
 * and it is the one that must not become an `href`.
 */
const BUSINESS_FIXTURES: BusinessRow[] = [
  makeBusiness({
    id: "bb000001-0000-4000-8000-000000000001",
    name: "Mercer Orthodontics",
    facebookUrl: "https://facebook.com/mercerortho",
    linkedinUrl: "https://linkedin.com/company/mercerortho",
    socialsCheckedAt: ago(2 * DAY),
    contactsCheckedAt: ago(2 * DAY),
    contactsFound: 3,
    sightings: 7,
  }),
  makeBusiness({
    id: "bb000002-0000-4000-8000-000000000002",
    name: "Land Park Smile Studio",
    websiteUri: "https://linktr.ee/landparksmiles",
    websiteDomain: null,
    formattedAddress: "2510 Freeport Blvd, Sacramento, CA 95818, USA",
    rating: ratingReading(5, 4),
    socialsCheckedAt: ago(3 * DAY),
    contactsCheckedAt: ago(3 * DAY),
    sightings: 2,
  }),
  makeBusiness({
    id: "bb000003-0000-4000-8000-000000000003",
    name: "Curtis Park Dental Arts",
    websiteUri: null,
    websiteDomain: null,
    formattedAddress: "2801 Franklin Blvd, Sacramento, CA 95818, USA",
    nationalPhone: null,
    internationalPhone: null,
    rating: ratingReading(null, null),
    sightings: 1,
  }),
  makeBusiness({
    // Forty-nine names in the live table are shared. The address is what tells them apart.
    id: "bb000004-0000-4000-8000-000000000004",
    name: "Mercer Orthodontics",
    formattedAddress: "8120 Greenback Ln, Citrus Heights, CA 95610, USA",
    websiteUri: "https://mercerortho-citrus.example/",
    websiteDomain: "mercerortho-citrus.example",
    rating: ratingReading(5, 9),
    socialsCheckedAt: ago(5 * DAY),
    sightings: 4,
  }),
  makeBusiness({
    id: "bb000005-0000-4000-8000-000000000005",
    name: "Midtown Family Dentistry",
    // Never seen live, and the reason `httpHref` is an allowlist: shown, and not clickable.
    websiteUri: "javascript:alert('nope')",
    websiteDomain: null,
    facebookUrl: "https://facebook.com/midtownfamilydds",
    instagramUrl: "https://instagram.com/midtownfamilydds",
    xUrl: "https://x.com/midtownfamdds",
    linkedinUrl: "https://linkedin.com/company/midtownfamilydds",
    socialsCheckedAt: ago(HOUR),
    contactsCheckedAt: ago(HOUR),
    // One, so the singular is on the page — and it is the overwhelmingly common case: of the 590
    // live businesses with contacts, 585 hold exactly one, two hold two, three hold five.
    contactsFound: 1,
    rating: ratingReading(4.9, 1204),
    sightings: 12,
  }),
  makeBusiness({
    id: "bb000006-0000-4000-8000-000000000006",
    name: "Arden Arcade Braces Co.",
    formattedAddress: "1610 Watt Ave, Sacramento, CA 95864, USA",
    rating: ratingReading(3.2, 61),
    contactsCheckedAt: ago(9 * DAY),
    // 293 live rows look like this: in the database with no run recorded as having found them.
    sightings: 0,
  }),
];

const BUSINESS_PAGE = { rows: BUSINESS_FIXTURES, total: BUSINESS_FIXTURES.length };

/** One sample per value, so each vocabulary can be enumerated beside its own rendering. */
const WEB_SAMPLES: Record<WebPresence, BusinessRow> = {
  site: BUSINESS_FIXTURES[0]!,
  "off-platform": BUSINESS_FIXTURES[1]!,
  none: BUSINESS_FIXTURES[2]!,
};

const SOCIALS_SAMPLES: Record<CheckState, BusinessRow> = {
  found: BUSINESS_FIXTURES[0]!,
  "none-confirmed": BUSINESS_FIXTURES[3]!,
  "never-looked": BUSINESS_FIXTURES[2]!,
};

const CONTACTS_SAMPLES: Record<CheckState, BusinessRow> = {
  found: BUSINESS_FIXTURES[0]!,
  // Checked nine days ago, nobody found. 296 live businesses are in this state and had no
  // rendering of their own until 008 granted the count that separates them from the 590.
  "none-confirmed": BUSINESS_FIXTURES[5]!,
  "never-looked": BUSINESS_FIXTURES[2]!,
};

const RATING_SAMPLES: Record<RatingReading["kind"], RatingReading> = {
  rated: ratingReading(4.7, 214),
  thin: ratingReading(5, 4),
  unrated: ratingReading(null, null),
};

/** Every query that ever returned one business, including endings the live rows have not held. */
const SIGHTING_FIXTURES: SightingRow[] = [
  {
    runId: "aa000001-0000-4000-8000-000000000001",
    batchId: "3ad70e55-0000-4000-8000-000000000002",
    query: "orthodontists in Midtown, Sacramento, CA",
    city: "Sacramento",
    neighborhood: "Midtown",
    rank: 3,
    seenAt: ago(6 * DAY),
    state: "completed",
    hasError: false,
    hasAbortedReason: false,
  },
  {
    runId: "aa000002-0000-4000-8000-000000000002",
    batchId: "3ad70e55-0000-4000-8000-000000000002",
    query: "orthodontists in Land Park, Sacramento, CA",
    city: "Sacramento",
    neighborhood: "Land Park",
    rank: 41,
    seenAt: ago(6 * DAY),
    state: "errored",
    hasError: true,
    hasAbortedReason: false,
  },
  {
    runId: "aa000003-0000-4000-8000-000000000003",
    batchId: null,
    query: "braces near Curtis Park, Sacramento, CA",
    city: "Sacramento",
    neighborhood: "Curtis Park",
    rank: null,
    seenAt: ago(2 * DAY),
    state: "stalled",
    hasError: false,
    hasAbortedReason: false,
  },
  {
    runId: "aa000004-0000-4000-8000-000000000004",
    batchId: "3ad70e55-0000-4000-8000-000000000003",
    query: "orthodontists in Arden-Arcade, Sacramento, CA",
    city: "Sacramento",
    neighborhood: "Arden-Arcade",
    rank: 12,
    seenAt: ago(HOUR),
    state: "aborted",
    hasError: false,
    hasAbortedReason: true,
  },
];

const SIGHTINGS_PAGE = {
  rows: SIGHTING_FIXTURES,
  total: SIGHTING_FIXTURES.length,
};

const NO_FILTERS = {
  q: null,
  web: null,
  socials: null,
  contacts: null,
  sweep: null,
  city: null,
};

/**
 * A fake key, and it has never been a credential.
 *
 * It is here because a redaction with nothing unsafe to chew on demonstrates nothing — and
 * because this repo is public, which is the reason the function exists at all.
 */
const FAKE_KEY = "AIzaSyFAKE0000000000000000000000000000";

const SCAR_FIXTURE = {
  error: `HTTP 400: {"error":{"code":400,"status":"INVALID_ARGUMENT","message":"Request contains an invalid argument.","details":[{"request":"https://places.googleapis.com/v1/places:searchText?key=${FAKE_KEY}&fields=places.id"}]}}`,
  abortedReason: null,
};

/** The two patterns, shown on strings short enough to read. */
const REDACTION_DEMO = [
  `?key=${FAKE_KEY}&fields=id`,
  "Authorization: Bearer sk-abcdef0123456789",
  `denied for ${FAKE_KEY}`,
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-hairline pt-6">
      <h2 className="text-xs font-medium tracking-widest text-text-3 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A bordered frame for showing a piece of chrome outside the place it normally lives. */
function Frame({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs text-text-3">{label}</p>
      <div className="overflow-hidden rounded-md border border-hairline">
        {children}
      </div>
    </div>
  );
}

/**
 * One rail fixture, drawn at both of its widths, side by side.
 *
 * The narrow one has its width PINNED — which is the whole reason the collapse is two container
 * queries and not one. This page is 64rem wide and can never satisfy a "wider than 64rem" query,
 * so if the narrow rendering were a property of the PAGE, one of these two could never be honest
 * and would have to be a drawing. It is a property of the rail instead: make a rail narrow and
 * it collapses, by the same rule that fires in the live shell.
 *
 * Both are the real component with the same fixture, so the pair is a comparison rather than two
 * screenshots that can drift.
 */
function RailFrame({
  label,
  pathname,
  chips,
}: {
  label: string;
  pathname: string;
  chips: React.ReactNode;
}) {
  // 30rem, because the wide rail's natural height is 448px and the label above it takes another
  // 26 — a frame shorter than its contents spills them onto the next row's label.
  return (
    <Frame label={label} className="h-[30rem]">
      <div className="flex h-full">
        <SidebarChrome
          className="h-full"
          nav={<NavLinksView pathname={pathname} />}
          standing={<SidebarStanding chips={chips} />}
        />
        <SidebarChrome
          className="h-full w-[var(--shell-rail-w-min)]"
          nav={<NavLinksView pathname={pathname} />}
          standing={<SidebarStanding chips={chips} />}
        />
      </div>
    </Frame>
  );
}

export default function KitchenSink() {
  // The chips read a live database in the bar above. Here they are fed fixed inputs, so
  // every rendering is on the page at once rather than whichever one today happens to be.
  const recently = new Date(Date.now() - 2 * HOUR);

  // The rail's four fixtures, rendered twice — once at each width. Defined once so the two
  // rows cannot drift into demonstrating different states at different widths.
  const railDemos = [
    {
      label: "a module is active — purple appears exactly once",
      pathname: "/sweeps",
      chips: (
        <ChipsView
          freshness={{ kind: "as-of", at: recently }}
          schema={{ kind: "match", version: EXPECTED_SCHEMA, appliedAt: recently }}
        />
      ),
    },
    {
      label: "no active module — this page. `/` redirects to /sweeps.",
      pathname: "/kitchen-sink",
      chips: (
        <ChipsView
          freshness={{ kind: "as-of", at: recently }}
          schema={{ kind: "match", version: EXPECTED_SCHEMA, appliedAt: recently }}
        />
      ),
    },
    {
      label: "the standing block before it answers",
      pathname: "/businesses",
      chips: <ChipsSkeleton />,
    },
    {
      label: "the database could not be reached",
      pathname: "/sweeps",
      chips: <ChipsView freshness={{ kind: "unknown" }} schema={{ kind: "unknown" }} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Kitchen sink"
        description="Every primitive, every state — grows with the system. If a component ships without its empty, loading, partial and failed renderings, it is not finished."
      />

      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <Section title="Surfaces & hairlines">
          <div className="flex gap-3">
            {surfaces.map((s) => (
              <div
                key={s.name}
                className={`h-16 flex-1 rounded-md border border-hairline ${s.cls} p-2`}
              >
                <span className="text-xs text-text-3">{s.name}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Text levels">
          <p className="text-text-1">text-1 — primary reading level</p>
          <p className="text-text-2">text-2 — supporting copy, ~70%</p>
          <p className="text-text-3">text-3 — metadata and labels, ~45%</p>
        </Section>

        <Section title="Identity (never state)">
          <div className="flex items-center gap-3">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <span className="text-sm font-medium text-brand">
              active nav item
            </span>
          </div>
        </Section>

        <Section title="Run state — one vocabulary, one rendering each">
          <div className="flex flex-wrap gap-2">
            {runStates.map(([state]) => (
              <StatusPill key={state} state={state} />
            ))}
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            {runStates.map(([state, meta]) => (
              <div key={state} className="contents">
                <dt className="text-text-2">{state}</dt>
                <dd className="text-text-3">{meta.note}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-text-3">
            <span className="text-text-2">The order is the precedence.</span> It
            is the view&rsquo;s own evaluation order, so a run carrying both an{" "}
            <code className="font-mono">error</code> and a{" "}
            <code className="font-mono">completed_at</code> reads as completed —
            a scar is not a status, and no later success ever clears one.
          </p>
          <p className="text-xs text-text-3">
            <span className="text-text-2">
              stalled has no color on purpose.
            </span>{" "}
            It is absent knowledge, not a fifth status — a hue would be a claim we
            cannot back. Absence of color means absence of knowledge, and the same
            pill serves a provider card that degraded to &ldquo;unknown&rdquo;.
          </p>
        </Section>

        <Section title="Sweep standing — the same question, one rung up">
          <div className="flex flex-wrap gap-2">
            {standings.map(([standing]) => (
              <SweepStandingPill key={standing} standing={standing} />
            ))}
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_auto_1fr]">
            {standings.map(([standing, meta]) => (
              <div key={standing} className="contents">
                <dt className="text-text-2">{meta.label}</dt>
                <dd className="text-text-3">{meta.outlook}</dd>
                <dd className="text-text-3">{meta.note}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-text-3">
            <span className="text-text-2">A run is aborted; the sweep is stopped.</span>{" "}
            Different words for different units, on purpose — a reader scanning a dense
            table should never have to work out which one a pill is talking about. The
            order above is the ranking, and the ranking is the whole decision: terminal
            beats in-flight, in-flight beats every ending, and not knowing beats a query
            that failed and was carried past.
          </p>
          <p className="text-xs text-text-3">
            <span className="text-text-2">The middle column is the one that matters.</span>{" "}
            Color says how bad; <code className="font-mono">outlook</code> says whether
            anything else is coming. <span className="text-text-2">unknown</span> covers
            two silences a row cannot tell apart and must not pretend to — a stalled run,
            and a run holding a state this build has never seen — so it gets no color,
            same as <span className="text-text-2">stalled</span> above.
          </p>
        </Section>

        <Section title="Identity is not status">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>default</Badge>
            <Badge variant="secondary">secondary</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="destructive">destructive</Badge>
            <span className="text-xs text-text-3">
              purple stays identity — never a state
            </span>
          </div>
        </Section>

        <Section title="Chart ramp (purple, then away)">
          <div className="flex gap-2">
            {chart.map((c) => (
              <div key={c} className={`h-8 w-16 rounded ${c}`} />
            ))}
          </div>
        </Section>

        <Section title="Pending states are first-class">
          <div className="grid gap-3 sm:grid-cols-2">
            <EmptyState
              title="No sweeps yet"
              hint="Say what would appear and how to cause it — an empty state that only says empty makes the operator guess whether the system is broken or idle."
            />
            <LoadingRows />
            <LowDataNotice n={3} noun="sweep" />
            <FailedState
              title="The provider refused this query"
              detail={
                "HTTP 429: {\n  \"error\": { \"status\": \"RESOURCE_EXHAUSTED\" }\n}"
              }
            />
          </div>
          <p className="text-xs text-text-3">
            A different axis from run state above: this is what the{" "}
            <span className="text-text-2">page</span> is doing, that is what the{" "}
            <span className="text-text-2">data</span> says. Both appear on the same
            screen.
          </p>
          <p className="text-xs text-text-3">
            The failed card&rsquo;s reason is behind a disclosure{" "}
            <span className="text-text-2">structurally</span>, not by convention.
            A provider&rsquo;s raw body can echo the request URL, and request URLs
            carry keys — so it can never reach a list cell or page prose, whatever
            a caller intends.
          </p>
        </Section>

        <Section title="Shell — the left rail, at both widths">
          <p className="text-xs text-text-3">
            each frame is the same rail twice — 13rem, then the 4.5rem it collapses to below
            64rem of app frame
          </p>
          <div className="flex flex-wrap gap-4">
            {railDemos.map((demo) => (
              <RailFrame key={demo.label} {...demo} />
            ))}
          </div>

          <p className="max-w-prose text-xs text-text-3">
            A left rail rather than a top bar, because this app is a set of views over one
            system and only a rail can say so on every screen — five modules and a standing
            block do not fit across the top without becoming a second navigation problem.{" "}
            <span className="text-text-2">Planned modules are drawn as planned</span>: &ldquo;not
            built&rdquo; is a different fact from &ldquo;empty&rdquo;, so they are named, dimmed,
            and not links — never a nav that implies discovery is the whole system. They stay
            drawn collapsed, with the heading traded for the hairline rule above them.
          </p>
          <p className="max-w-prose text-xs text-text-3">
            <span className="text-text-2">Two container queries, asking two questions.</span>{" "}
            One is policy — below 64rem of app frame the rail costs the dense table 4.5rem
            instead of 13rem. The other is rendering — a rail narrower than 8rem shows icons.
            Only the second reaches these components, which is why both halves of every frame
            above are the real rail and neither is a picture of one: this page is 64rem wide and
            could never satisfy the first. Nothing is deleted, either. Every label the rail stops
            showing is still in the DOM, so a nav row is still named &ldquo;Sweeps&rdquo; at both
            widths and its <code>title</code> stays a description rather than becoming the name
            by default — which is also the whole of the hover behaviour, and the whole of what a
            touch screen does not get.
          </p>
          <p className="max-w-prose text-xs text-text-3">
            <span className="text-text-2">What is not in these frames is the stickiness.</span>{" "}
            The live rail is capped at the viewport and stuck to its top, because a stretch flex
            item is otherwise as tall as the table beside it — 20242px on /businesses — and the
            standing block sits at its foot. That is a fact about the app frame rather than
            about the chrome: there is no scrollport inside a frame for a rail to stick to, so a
            demo here would be a second set of classes pretending to be these ones.
          </p>
          <p className="max-w-prose text-xs text-text-3">
            <span className="text-text-2">
              The collapsed rail&rsquo;s one loss is the right one.
            </span>{" "}
            A read we could not make has room for the absence of a colour and nothing else, so it
            keeps its hollow ring, its place in the order and its title, and never abbreviates
            into a word we cannot back. Drift keeps its amber dot and the version the database is
            actually at — that pair is the widest thing the standing block still has to fit, and
            it is what sets 4.5rem.
          </p>
        </Section>

        <Section title="Page header — room for exactly one primary action">
          <div className="space-y-4">
            <Frame label="with the one action">
              <PageHeader
                title="Sweeps"
                description="The index of every sweep discovery has run."
                action={<Button>Compose a sweep</Button>}
              />
            </Frame>
            <Frame label="without one — most pages">
              <PageHeader
                title="Businesses"
                description="Everything discovery has found, with the detail rail beside it."
              />
            </Frame>
          </div>
        </Section>

        <Section title="Freshness & schema chips">
          <div className="flex flex-wrap items-center gap-2">
            <FreshnessChip freshness={{ kind: "as-of", at: recently }} />
            <FreshnessChip freshness={{ kind: "no-runs" }} />
            <FreshnessChip freshness={{ kind: "unknown" }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SchemaChip
              schema={{
                kind: "match",
                version: EXPECTED_SCHEMA,
                appliedAt: recently,
              }}
            />
            <SchemaChip
              schema={{
                kind: "drift",
                version: "009_spend",
                expected: EXPECTED_SCHEMA,
              }}
            />
            <SchemaChip schema={{ kind: "unknown" }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChipsSkeleton />
          </div>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
            <div className="contents">
              <dt className="text-text-2">ordinary</dt>
              <dd className="text-text-3">
                no color. Green on &ldquo;nothing is wrong&rdquo; is noise, and a
                bar that is always lit stops being read.
              </dd>
            </div>
            <div className="contents">
              <dt className="text-text-2">drift</dt>
              <dd className="text-text-3">
                warn — the database has moved and the read-model may be describing
                a schema that no longer exists.
              </dd>
            </div>
            <div className="contents">
              <dt className="text-text-2">unknown</dt>
              <dd className="text-text-3">
                we could not ask. The hollow ring, same as a stalled run.
              </dd>
            </div>
            <div className="contents">
              <dt className="text-text-2">skeleton</dt>
              <dd className="text-text-3">
                still asking — which is not the same fact as unknown, and does not
                get unknown&rsquo;s rendering.
              </dd>
            </div>
          </dl>
          <p className="text-xs text-text-3">
            &ldquo;no sweeps yet&rdquo; is not &ldquo;unknown&rdquo;. We looked, and
            discovery has never run — the same three-state discipline that keeps
            &ldquo;never checked&rdquo; apart from &ldquo;checked, found
            nobody&rdquo;.
          </p>
        </Section>

        <Section title="Detail rail">
          <div className="space-y-4">
            <Frame label="unselected — the rail is present and visibly empty">
              <DetailLayout rail={<RailEmpty />}>
                <LoadingRows rows={5} />
              </DetailLayout>
            </Frame>
            <Frame label="loading a selection">
              <DetailLayout rail={<RailLoading />}>
                <EmptyState
                  title="The list, whatever it holds"
                  hint="The rail's state and the list's state are independent — one can fail while the other is fine."
                />
              </DetailLayout>
            </Frame>
            <Frame label="stale link — the rail degrades, the list does not">
              <DetailLayout rail={<RailNotFound />}>
                <EmptyState
                  title="The list, still intact"
                  hint="A selection that no longer exists is a rail-local problem."
                />
              </DetailLayout>
            </Frame>
            <Frame label="narrow — the rail stacks under the list" className="max-w-md">
              <DetailLayout rail={<RailEmpty />}>
                <EmptyState
                  title="The list"
                  hint="No sidebar, because the rail is already taking a side."
                />
              </DetailLayout>
            </Frame>
          </div>
        </Section>

        <Section title="Sweep index — the dense table">
          <div className="space-y-2">
            <SweepCount
              page={{ rows: SWEEP_FIXTURES, total: SWEEP_FIXTURES.length }}
            />
            <div className="rounded-md border border-hairline">
              <SweepTable
                page={{ rows: SWEEP_FIXTURES, total: SWEEP_FIXTURES.length }}
              />
            </div>
          </div>
          <p className="text-xs text-text-3">
            <span className="text-text-2">
              Rows two and three carry identical numbers, and that is the point.
            </span>{" "}
            The areas after an abort leave no rows at all, so a sweep that stopped and one
            still going hold the same count of runs, the same new, the same sightings.
            Shape cannot separate them — the rendering has to, three times over: the pill,
            the outlook under the timestamp, and the vermilion rule down the left of a row
            that stopped. Terminal has to look terminal.
          </p>
          <p className="text-xs text-text-3">
            <span className="text-text-2">
              &ldquo;7 of 12&rdquo; is saturation, never progress.
            </span>{" "}
            The only ratio on this page divides the rows by the rows. A batch has no size
            — no denominator, no progress bar, no &ldquo;12 of 20&rdquo; — because
            nothing in this database knows how many areas were planned. Row six is short
            by one: five counted states over six runs means one run holds a word this
            build has never seen, and it says <span className="text-text-2">1
            unrecognised</span> rather than reading as complete.
          </p>
          <div className="space-y-2">
            <p className="text-xs text-text-3">
              Truncated, which is the discipline every list statement here keeps:
            </p>
            <SweepCount page={{ rows: SWEEP_FIXTURES, total: 412 }} />
          </div>
        </Section>

        <Section title="Run detail — one sweep's queries">
          <div className="space-y-2">
            <RunCount page={RUN_PAGE} />
            <div className="rounded-md border border-hairline">
              <RunTable
                page={RUN_PAGE}
                basePath="/kitchen-sink"
                selected="aa000003-0000-4000-8000-000000000003"
              />
            </div>
          </div>
          <p className="text-xs text-text-3">
            <span className="text-text-2">
              Row four carries an error and is still completed.
            </span>{" "}
            <code className="font-mono">completed_at</code> is the authority — the{" "}
            <code className="font-mono">run_state</code> view tests it first, so a query
            that failed once and later succeeded reads as finished with the scar named
            beneath it. A scar is not a status, and no later success ever clears one. Put
            it beside row three, which is the same query with nothing to carry.
          </p>
          <p className="text-xs text-text-3">
            <span className="text-text-2">
              Row one returned 60 and reads <code className="font-mono">60+</code>.
            </span>{" "}
            Google caps a text search at sixty, so a full page is a floor and the area
            holds more — never chart it, never sum it. Row two returned 1 and reads{" "}
            <span className="text-text-2">thin</span>: the niche may not be there, or the
            query string in the first column is wrong. Row nine holds a state this build
            has never seen and says <span className="text-text-2">unrecognised</span>,
            with no colour.
          </p>
          <p className="text-xs text-text-3">
            <span className="text-text-2">Selection lives in the URL.</span> The purple
            rule marks the selected row — identity, not status; the vermilion rule on the
            sweep index means something entirely different and never appears here.
          </p>
        </Section>

        <Section title="Run detail — the abort notice">
          <div className="space-y-1 rounded-md border border-status-fail/40 bg-surface-1 p-3 text-xs">
            <p className="font-medium text-text-2">This sweep stopped here.</p>
            <p className="text-text-3">
              It aborted at{" "}
              <span className="font-mono text-text-2">
                orthodontists in Oak Park, Sacramento, CA
              </span>
              , and the areas after it left no rows at all — so this list is what ran, not
              what was planned.{" "}
              <span className="text-text-2 underline decoration-hairline underline-offset-4">
                Open that query
              </span>{" "}
              to read the reason.
            </p>
          </div>
          <p className="text-xs text-text-3">
            It names the query and never the reason: an abort reason is a scar and can
            carry a provider&rsquo;s response body, so its text stays behind the
            rail&rsquo;s disclosure. Keyed on the derived state rather than on{" "}
            <code className="font-mono">aborted_reason is not null</code> — a run that
            carries the scar and later completed stopped nothing.
          </p>
        </Section>

        <Section title="Run detail — the rail">
          {/* 20rem, because that is what `DetailLayout` gives the rail. A rail fixture shown at
              page width is a picture of the component rather than the component. */}
          <div className="flex flex-wrap items-start gap-3">
            <Frame
              label="a run, from the row the table already holds — no second read"
              className="w-80 max-w-full"
            >
              <div className="p-3">
                <RunRailFacts row={RUN_FIXTURES[6]!} />
              </div>
            </Frame>
            <Frame
              label="its scars — redacted, truncated, behind a disclosure"
              className="w-80 max-w-full"
            >
              <div className="p-3">
                <RunScarsView scars={SCAR_FIXTURE} />
              </div>
            </Frame>
            <div className="w-80 max-w-full space-y-3">
              <Frame label="asked, and there is none">
                <div className="p-3">
                  <RunScarsView scars={{ error: null, abortedReason: null }} />
                </div>
              </Frame>
              <Frame label="still asking / could not ask">
                <div className="space-y-2 p-3">
                  <RunScarsLoading />
                  <RunScarsFailed />
                </div>
              </Frame>
            </div>
          </div>
          <p className="text-xs text-text-3">
            <span className="text-text-2">
              &ldquo;No scars&rdquo; is not &ldquo;could not read&rdquo;.
            </span>{" "}
            Forty-two of forty-three runs are the third card: we asked, and the run
            recorded neither an error nor an abort reason. That is a fact about the run.
            The fourth is the other thing entirely — and it is why the scar read has its
            own boundary rather than sharing the page&rsquo;s.
          </p>
        </Section>

        <Section title="Redaction — the second layer">
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {REDACTION_DEMO.map((before) => (
              <div key={before} className="contents">
                <dt className="font-mono break-all text-text-3">{before}</dt>
                <dd className="font-mono break-all text-text-2">
                  {redactSecrets(before)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-text-3">
            <span className="text-text-2">
              The parameter name survives; the value does not.
            </span>{" "}
            &ldquo;The URL had a key in it&rdquo; is itself information, and an error
            stripped down to nothing is an error nobody can act on. Every key above is
            visibly fake and none has ever been a credential.
          </p>
          <p className="text-xs text-text-3">
            <span className="text-text-2">This is the second layer, not the first.</span>{" "}
            The writing tool already strips both patterns at the only place either column
            is written. This one exists anyway: rows predate that regex, it does not cover
            every shape a credential takes, and a public repo cannot rest a safety claim on
            a private repo&rsquo;s regex. Neither layer is allowed to assume the other ran.
          </p>
          <p className="text-xs text-text-3">
            <span className="text-text-2">Redact, then truncate.</span> The other order can
            sever a key and leave the front half on screen — the one failure mode where
            doing less work would have been safer. A cut that lands inside the placeholder
            drops the fragment, and the rail says how many characters it is not showing.
          </p>
        </Section>

        <Section title="Run detail — its pending states">
          <div className="grid gap-3 sm:grid-cols-2">
            <RunsLoading />
            <RunsFailed />
            <LowDataNotice n={3} noun="query" plural="queries" />
          </div>
          <p className="text-xs text-text-3">
            No empty card, deliberately: a batch exists because runs exist, so a sweep with
            no queries is not a state this page can reach. An id that matches nothing is a{" "}
            <span className="text-text-2">404</span> — the page awaits its read so the
            status line can say so, which is why the skeleton above belongs to the rail and
            to this page rather than to the table.
          </p>
        </Section>

        <Section title="Sweep index — its four pending states">
          <div className="grid gap-3 sm:grid-cols-2">
            <SweepsEmpty />
            <SweepsLoading />
            <LowDataNotice n={1} noun="sweep" />
            <SweepsFailed />
          </div>
          <p className="text-xs text-text-3">
            The same components the page renders, not a second set of words that can drift
            from them. <span className="text-text-2">Empty is not failed:</span> one says
            discovery has never recorded a run, the other says we could not ask — and the
            failed card carries no reason because there is none to carry. A connection
            error&rsquo;s message can echo the URL that produced it, so the log gets the
            error&rsquo;s name and the operator gets the card.
          </p>
        </Section>

        <Section title="Business facts — three states, not two">
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <p className="text-text-2">web presence</p>
              {WEB_PRESENCE_ORDER.map((value) => (
                <div key={value} className="flex items-baseline gap-3">
                  <div className="w-44 shrink-0">
                    <WebPresenceMark row={WEB_SAMPLES[value]} />
                  </div>
                  <span className="text-text-3">{WEB_PRESENCE[value].note}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-text-2">socials</p>
              {SOCIALS_ORDER.map((value) => (
                <div key={value} className="flex items-baseline gap-3">
                  <div className="w-44 shrink-0">
                    <SocialsMark row={SOCIALS_SAMPLES[value]} />
                  </div>
                  <span className="text-text-3">{SOCIALS[value].note}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-text-2">
                contacts — three states since 008, and a granted count is why
              </p>
              {CONTACTS_ORDER.map((value) => (
                <div key={value} className="flex items-baseline gap-3">
                  <div className="w-44 shrink-0">
                    <ContactsMark row={CONTACTS_SAMPLES[value]} />
                  </div>
                  <span className="text-text-3">{CONTACTS[value].note}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-text-2">rating</p>
              {RATINGS_ORDER.map((kind) => (
                <div key={kind} className="flex items-baseline gap-3">
                  <div className="w-44 shrink-0">
                    <RatingMark reading={RATING_SAMPLES[kind]} />
                  </div>
                  <span className="text-text-3">{RATINGS[kind].note}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="max-w-prose text-xs text-text-3">
            <span className="text-text-2">None of these is a status, so none of them is
            coloured.</span>{" "}
            Purple is identity, ok / warn / fail / info is severity, and &ldquo;this
            business has no website&rdquo; is neither — what separates them here is weight
            and glyph. The hollow ring appears exactly three times, and never on a fact:{" "}
            <span className="text-text-2">never looked</span> for socials,{" "}
            <span className="text-text-2">never looked</span> for contacts, and{" "}
            <span className="text-text-2">never rated</span>. Absence of colour is absence
            of knowledge — so <span className="text-text-2">no site</span> is plain text,
            because we looked at the payload and there was no URL, and{" "}
            <span className="text-text-2">none confirmed</span> is plain text, because
            somebody looked and found nobody.
          </p>
        </Section>

        <Section title="Business browser — the dense table">
          <BusinessCount page={{ rows: BUSINESS_FIXTURES, total: 1416 }} />
          <BusinessTable page={BUSINESS_PAGE} basePath="/kitchen-sink" selected="bb000002-0000-4000-8000-000000000002" />
          <p className="max-w-prose text-xs text-text-3">
            Six rows carrying what fourteen hundred live ones mostly do not. Row two is the{" "}
            <span className="text-text-2">off-platform</span> presence — there are two of
            those in the whole database, so scrolling would never find one. Row five holds
            a <span className="font-mono">javascript:</span> URL, which has never appeared
            live and is rendered as text rather than a link, because{" "}
            <span className="text-text-2">httpHref</span> is an allowlist. Row six has{" "}
            <span className="text-text-2">no sightings at all</span>: 293 live businesses
            are in this table without any run recorded as having found them. The two{" "}
            <span className="text-text-2">Mercer Orthodontics</span> rows are why the
            address sits under the name.
          </p>
        </Section>

        <Section title="Business browser — the filters">
          <BusinessFilterBar
            filters={NO_FILTERS}
            selected={null}
            cities={["Austin", "Houston"]}
            basePath="/kitchen-sink"
          />
          <BusinessFilterBar
            filters={{
              q: "law",
              web: "off-platform",
              socials: "none-confirmed",
              contacts: "found",
              sweep: "3ad70e55-0000-4000-8000-000000000002",
              city: "Austin",
            }}
            selected="bb000002-0000-4000-8000-000000000002"
            cities={null}
            basePath="/kitchen-sink"
          />
          <BusinessFiltersLoading />
          <p className="max-w-prose text-xs text-text-3">
            Links rather than a select, because a row of links shows all three states of a
            three-state vocabulary at once — which is the thing the vocabulary exists to
            teach. The second bar is every filter applied, with the city list{" "}
            <span className="text-text-2">degraded</span>: the options could not be read,
            so the control says which part is missing and stays clearable rather than
            disappearing. A selection rides through every one of these links, because
            narrowing the list and choosing a row are different questions.
          </p>
        </Section>

        <Section title="Business browser — its pending states">
          <div className="grid gap-3 sm:grid-cols-2">
            <BusinessesEmpty />
            <BusinessesFiltered />
            <BusinessesLoading />
            <BusinessesFailed />
          </div>
          <p className="max-w-prose text-xs text-text-3">
            <span className="text-text-2">Five, not four.</span> A dense list with filters
            has an extra one, and it is the one that gets spent wrongly:{" "}
            <span className="text-text-2">nothing matched</span> is not{" "}
            <span className="text-text-2">no businesses yet</span>. Telling an operator the
            pipeline is empty when it holds fourteen hundred rows behind a narrow filter is
            a lie the page would tell every day. The fifth is the rail&rsquo;s not-found,
            below.
          </p>
        </Section>

        <Section title="Business browser — the rail">
          <div className="flex flex-wrap gap-4">
            <Frame label="unselected" className="w-80">
              <RailEmpty />
            </Frame>
            <Frame label="stale ?business= — and the page is still 200" className="w-80">
              <RailNotFound />
            </Frame>
            <Frame label="loading" className="w-80">
              <RailLoading />
            </Frame>
          </div>

          <div className="flex flex-wrap gap-4">
            <Frame label="facts — off-platform, thin rating" className="w-80">
              <BusinessRailFacts row={BUSINESS_FIXTURES[1]!} />
            </Frame>
            <Frame label="facts — never looked at anything" className="w-80">
              <BusinessRailFacts row={BUSINESS_FIXTURES[2]!} />
            </Frame>
          </div>

          <div className="flex flex-wrap gap-4">
            <Frame label="sightings" className="w-80">
              <SightingsView page={SIGHTINGS_PAGE} />
            </Frame>
            <Frame label="sightings — none recorded" className="w-80">
              <SightingsView page={{ rows: [], total: 0 }} />
            </Frame>
            <Frame label="sightings — loading / failed" className="w-80">
              <div className="space-y-3">
                <SightingsLoading />
                <SightingsFailed />
              </div>
            </Frame>
          </div>

          <p className="max-w-prose text-xs text-text-3">
            The rail carries the four readings with no paragraph underneath explaining what
            one of them cannot say — 008 removed the reason there was one. The sightings
            list tags its <span className="text-text-2">first sighting</span>, which is exact
            rather than approximate: the link row is a bigserial, so &ldquo;first ever
            seen&rdquo; is a sequence comparison with no timestamps to tie, and that run
            holds the business&rsquo;s <span className="font-mono">new</span> credit
            permanently. A scar is named beside the pill and never instead of it — its text
            lives one link away, in the run&rsquo;s own rail.
          </p>
        </Section>

        <Section title="Login — the two questions">
          <div className="flex flex-wrap gap-4">
            <Frame label="authenticator — idle" className="w-72">
              <div className="p-3">
                <LoginFormView state={LOGIN_IDLE} preview />
              </div>
            </Frame>
            <Frame label="authenticator — checking" className="w-72">
              <div className="p-3">
                <LoginFormView state={LOGIN_IDLE} pending preview />
              </div>
            </Frame>
            <Frame label="fallback — asked for" className="w-72">
              <div className="p-3">
                <LoginFormView
                  state={{ mode: "fallback", notice: "code-sent" }}
                  preview
                />
              </div>
            </Frame>
            <Frame label="authenticator — no fallback configured" className="w-72">
              <div className="p-3">
                <LoginFormView state={LOGIN_IDLE} fallbackAvailable={false} preview />
              </div>
            </Frame>
          </div>

          <p className="max-w-prose text-xs text-text-3">
            Passwordless: six digits from an authenticator, and no password field to phish. The
            fallback is the same screen asking a different question, so a wrong turn costs a
            click rather than a navigation and the{" "}
            <span className="font-mono">next</span> the operator was heading for rides through
            every state in a hidden field. Purple appears exactly once, on the one primary
            action — never on an outcome.
          </p>
        </Section>

        <Section title="Login — every outcome it can report">
          <div className="grid gap-2 sm:grid-cols-2">
            {LOGIN_NOTICE_VALUES.map((notice) => (
              <div key={notice} className="space-y-1">
                <p className="font-mono text-xs text-text-3">{notice}</p>
                <LoginNoticeLine notice={notice} />
              </div>
            ))}
          </div>

          <p className="max-w-prose text-xs text-text-3">
            The same axis as everywhere else, on a screen that has no database behind it. A
            wrong code is a real negative answer and takes{" "}
            <span className="text-status-fail">fail</span>; a lapsed or spent challenge is
            recoverable and takes <span className="text-status-warn">warn</span>; a code on its
            way is <span className="text-status-info">info</span>. The three that carry{" "}
            <span className="text-text-2">no colour</span> are the ones where we do not know:
            the server has no secret it can read, Telegram never confirmed the message, or there
            is nowhere to send one. Absence of colour is absence of knowledge — the same rule
            that leaves <span className="font-mono">stalled</span> undecorated, and the copy here
            is the copy the login page renders rather than a second set that can drift.
          </p>
        </Section>
      </div>
    </>
  );
}
