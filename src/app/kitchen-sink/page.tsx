import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const surfaces = [
  { name: "background", cls: "bg-background" },
  { name: "surface-1", cls: "bg-surface-1" },
  { name: "surface-2", cls: "bg-surface-2" },
];

const statuses = [
  { name: "ok", cls: "bg-status-ok" },
  { name: "warn", cls: "bg-status-warn" },
  { name: "fail", cls: "bg-status-fail" },
  { name: "info", cls: "bg-status-info" },
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

      <Section title="Status ramp (the only meaningful color)">
        <div className="flex gap-2">
          {statuses.map((s) => (
            <span
              key={s.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2.5 py-0.5 text-xs text-text-2"
            >
              <span className={`size-1.5 rounded-full ${s.cls}`} />
              {s.name}
            </span>
          ))}
          <Badge variant="destructive">destructive</Badge>
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
      </Section>
    </main>
  );
}
