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
  KitchenSinkLink,
  NavSkeleton,
  TopBarChrome,
} from "@/components/shell/top-bar";
import { RUN_STATES, RunState, StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const HOUR = 60 * 60 * 1000;

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

export default function KitchenSink() {
  // The chips read a live database in the bar above. Here they are fed fixed inputs, so
  // every rendering is on the page at once rather than whichever one today happens to be.
  const recently = new Date(Date.now() - 2 * HOUR);

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

        <Section title="Shell — the top bar">
          <div className="space-y-4">
            <Frame label="a route is active — purple appears exactly once">
              <TopBarChrome
                className="static"
                nav={<NavLinksView pathname="/sweeps" />}
                end={
                  <>
                    <ChipsView
                      freshness={{ kind: "as-of", at: recently }}
                      schema={{
                        kind: "match",
                        version: EXPECTED_SCHEMA,
                        appliedAt: recently,
                      }}
                    />
                    <KitchenSinkLink />
                  </>
                }
              />
            </Frame>

            <Frame label="no active route — this page, and the splash">
              <TopBarChrome
                className="static"
                nav={<NavLinksView pathname="/kitchen-sink" />}
                end={
                  <>
                    <ChipsView
                      freshness={{ kind: "as-of", at: recently }}
                      schema={{
                        kind: "match",
                        version: EXPECTED_SCHEMA,
                        appliedAt: recently,
                      }}
                    />
                    <KitchenSinkLink />
                  </>
                }
              />
            </Frame>

            <Frame label="the nav before it hydrates">
              <TopBarChrome
                className="static"
                nav={<NavSkeleton />}
                end={
                  <>
                    <ChipsSkeleton />
                    <KitchenSinkLink />
                  </>
                }
              />
            </Frame>

            <Frame
              label="narrow — it stacks and scrolls. No menu, no toggle, no JavaScript."
              className="max-w-xs"
            >
              <TopBarChrome
                className="static"
                nav={<NavLinksView pathname="/businesses" />}
                end={
                  <>
                    <ChipsView
                      freshness={{ kind: "as-of", at: recently }}
                      schema={{
                        kind: "match",
                        version: EXPECTED_SCHEMA,
                        appliedAt: recently,
                      }}
                    />
                    <KitchenSinkLink />
                  </>
                }
              />
            </Frame>
          </div>
          <p className="text-xs text-text-3">
            The narrow frame above is the{" "}
            <span className="text-text-2">real</span> narrow layout, not a picture
            of one: the bar responds to the width of its container, so a 20rem box
            reproduces a 20rem screen.
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
      </div>
    </>
  );
}
