import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const surfaces = [
  { name: "background", cls: "bg-background" },
  { name: "surface-1", cls: "bg-surface-1" },
  { name: "surface-2", cls: "bg-surface-2" },
];

// The run-state vocabulary and its one rendering. CLAUDE.md § Honest state is the source
// of truth; this row is where you check it still reads right. Five states, five distinct
// renderings — severity is the color axis, the word is the state.
const runStates = [
  { state: "completed", variant: "ok" as const, note: "finished — even when error is set" },
  { state: "running", variant: "info" as const, note: "a page landed in the last 10 min" },
  { state: "errored", variant: "warn" as const, note: "this query failed; the sweep carried on" },
  { state: "aborted", variant: "fail" as const, note: "the sweep stopped here, and recorded why" },
  { state: "stalled", variant: "unknown" as const, note: "no ending, no reason, nothing moved" },
];

const chart = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-hairline pt-6">
      <h2 className="text-xs font-medium uppercase tracking-widest text-text-3">{title}</h2>
      {children}
    </section>
  );
}

export default function KitchenSink() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-text-1">Kitchen sink</h1>
        <p className="text-xs text-text-3">every primitive, every state — grows with the system</p>
      </header>

      <Section title="Surfaces & hairlines">
        <div className="flex gap-3">
          {surfaces.map((s) => (
            <div key={s.name} className={`h-16 flex-1 rounded-md border border-hairline ${s.cls} p-2`}>
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
          <span className="text-sm font-medium text-brand">active nav item</span>
        </div>
      </Section>

      <Section title="Run state — one vocabulary, one rendering each">
        <div className="flex flex-wrap gap-2">
          {runStates.map((s) => (
            <Badge key={s.state} variant={s.variant}>
              {s.state}
            </Badge>
          ))}
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
          {runStates.map((s) => (
            <div key={s.state} className="contents">
              <dt className="text-text-2">{s.state}</dt>
              <dd className="text-text-3">{s.note}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-text-3">
          <span className="text-text-2">stalled has no color on purpose.</span> It is absent
          knowledge, not a fifth status — a hue would be a claim we cannot back. Absence of
          color means absence of knowledge, and the same pill serves a provider card that
          degraded to &ldquo;unknown&rdquo;.
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-hairline bg-surface-1 p-3 text-xs text-text-3">
            empty — say what would appear and how to cause it
          </div>
          <div className="rounded-md border border-hairline bg-surface-1 p-3">
            <div className="h-2 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="mt-2 h-2 w-1/2 animate-pulse rounded bg-surface-2" />
          </div>
          <div className="rounded-md border border-hairline bg-surface-1 p-3 text-xs text-text-2">
            partial — 3 points is not a trend
          </div>
          <div className="rounded-md border border-status-fail/40 bg-surface-1 p-3 text-xs text-text-2">
            failed — the reason, verbatim
          </div>
        </div>
        <p className="text-xs text-text-3">
          A different axis from run state above: this is what the{" "}
          <span className="text-text-2">page</span> is doing, that is what the{" "}
          <span className="text-text-2">data</span> says. Both appear on the same screen.
        </p>
      </Section>
    </main>
  );
}
