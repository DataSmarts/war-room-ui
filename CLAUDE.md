# WAR ROOM UI — agent instructions

Public repo. The **view half** of a two-repo system: dashboards over a Postgres
database (Neon). The operating half — workflows, tools, schema, migrations — lives in
a private repo. **This repo is written knowing it is public**: no campaign prose, no
targeting logic, no provider keys, no operational know-how. Ever.

## Architecture rules

- **MVC-thin.** Model = typed queries over Neon. View = the dashboards — this is
  where the craft budget goes. Controller = a path that queries the DB or a provider,
  shapes, renders. No service layer, no repositories-as-a-program.
- **This repo never migrates the database** and never defines schema. It carries a
  typed read-model of the tables it displays, refreshed when the schema moves.
- **It never mutates money or outbound state.** Its Postgres role has SELECT plus
  writes only on harmless tables (review verdicts, notes, request rows). Do not work
  around the role; it is the design.
- Requests for work are rows, not APIs: write a request row; the operating half
  picks it up.
- Provider mirror cards degrade to "unknown" and never block a page.
- No state mutation on GET. Validate URL schemes on anything operator-edited.
- Secrets: exactly two, in env (`DATABASE_URL` for the restricted role, an
  auth-cookie secret). Never committed, never logged.

## Design language (enforced by `src/app/globals.css` — read it)

- Dark-first, dark-only for now. Near-black base, elevated surfaces one notch
  lighter, low-alpha hairlines over shadows, three text levels.
- **Purple is identity** — brand, active nav, the ONE primary action per page header,
  focus ring. Never used to encode state.
- **Color only means status**: ok / warn / fail (vermilion) / info. Everything else
  stays near-monochrome — that restraint is what makes it look expensive.
- Chart ramp: purple then away (teal, cyan, amber, rose). Recharts by default, visx
  as escape hatch, the funnel hand-rolled in SVG.
- Density over air. Dense tables with status pills + a persistent right-hand detail
  rail; selection lives in the URL.
- **Pending states are first-class**: a pipeline app is mostly empty / loading /
  partial / failed. Every view ships all of them. Low-data honesty — a 3-point line
  never draws a confident trend.
- Every new primitive and every state lands on `/kitchen-sink` in the same change.

## Conventions

- Next.js App Router, TS strict, Tailwind v4 tokens in `globals.css` — components
  consume tokens, never raw colors.
- shadcn/ui (radix base): components are copied in under `src/components/ui/` and
  themed by the token layer only.
- Keep it small. This app looks at things; the thinking happens elsewhere.

@AGENTS.md
