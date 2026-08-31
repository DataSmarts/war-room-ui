# WAR ROOM UI — agent instructions

Public repo. The **view half** of a two-repo system: dashboards over a Postgres
database (Neon). The operating half — workflows, tools, schema, migrations — lives in
a private repo. **This repo is written knowing it is public**: nothing is committed that
isn't safe to publish — no campaign prose, no targeting logic, no secrets, no
operational know-how. Ever.

**Read the system reference before touching code.** What the database holds and what it
means — the read-model table by table, every vocabulary's exact values, and the numbered
traps that make a plausible query wrong — lives in one Linear document:
<https://linear.app/datasmarts/document/war-room-system-reference-f4abcb36e965>

It is deliberately in the tracker rather than in either repo, because it describes both
halves. Update it before closing any issue that learned something durable.
`WAR_ROOM.md` in the private repo is a **retired** seed doc; where the two disagree, the
Linear document wins.

## Architecture rules

- **MVC-thin.** Model = typed queries over Neon. View = the dashboards — this is
  where the craft budget goes. Controller = a path that queries the DB or a provider,
  shapes, renders. Layers are allowed where the work wants them: a dashboard over ~15
  tables wants typed query modules, not a repository pattern.
- **This repo never migrates the database** and never defines schema. New tables for UI
  needs are fine on request — they ship in the private repo's single migration sequence,
  never a second one here.
- **It never mutates money or outbound state.** Today the role has SELECT and nothing
  else (migration 006); each future write grant ships in the migration that creates the
  table it writes to. Never granted, ever: `exported_at`, the Instantly receipt and
  status columns, membership INSERT, `composed_sequences.cleared_by`, and `suppression`.
  Do not work around the role; it is the design.
- Requests for work are rows, not APIs: write a request row; the operating half picks it
  up. **Those tables do not exist yet** — this is the pattern, not the present tense.
- Provider cards call the provider **live** and degrade to "unknown". They never block a
  page.
- No state mutation on GET. Validate URL schemes on anything operator-edited.
- Secrets: as many as the UI needs, provider keys included — in env, never committed,
  never logged. The blast radius is the `ui` role's grant, not the number of keys.

## Honest state — the read-model's one vocabulary

Discovery has **no status column** and never will: a process cannot write its own death
certificate, so a row that claims `running` is exactly the row nothing updated when the
process was killed. `run_state` (migration 007) concludes a state from facts instead.
**Every view reads `state` from that view** — never re-derives the predicates, never
renders `runs.error` as a status.

| state | means | renders as |
| -- | -- | -- |
| `completed` | it finished — **even when `error` is set**; `completed_at` is the authority | ok |
| `running` | a page landed within the last 10 minutes | info |
| `errored` | this one query failed; the sweep carried on | warn |
| `aborted` | the sweep stopped here and recorded why, in `aborted_reason` | fail |
| `stalled` | no ending, no reason, nothing has moved — a process died silently | **no colour** |

Severity is the colour axis, the word is the state: degraded (one area lost) is `warn`,
stopped (the sweep died) is `fail`. `<Badge variant="warn">errored</Badge>` — the pairing
lives in `badge.tsx` and on `/kitchen-sink`, not in each view.

- **`stalled` gets no colour.** Not ok, not warn, not fail, not info: it is *absent
  knowledge*, and any colour would be a claim we cannot back. **Absence of colour means
  absence of knowledge.** The same rendering serves a provider card that degraded to
  "unknown".
- **`results_returned = 60` is saturation, never a count.** Google caps one text search
  at 60, so an area returning exactly 60 holds *more* than 60 and you got the 60 it
  ranked highest. Never chart it, never sum it, never call it a total. 0–2 means the
  wording is off — check the query text before blaming the area.
- **Three states, not two.** `website_uri` set with `website_domain` null is a
  shared-platform presence (linktr.ee, a Facebook page), not "no website".
  `socials_checked_at` / `contacts_checked_at` set with nothing found renders
  **"none confirmed"**, never "none" — "never looked" and "looked, found nobody" are
  different facts, and the schema keeps them apart on purpose.
- **`error` and `aborted_reason` are scars, not statuses.** Neither is cleared by a
  later success, and both can carry a provider's raw response body. Keep them behind a
  disclosure — never in a list cell, never in metadata, never in a log.
- **Never render a denominator for a sweep.** There is no `batches` table; the planned
  area count died with the session that composed the grid. "12 of 20 areas" is
  unanswerable, so no progress bars.
- A run's `running` is not a view's *loading*. One is what the data says, the other is
  what the page is doing, and both appear on the same screen.

## Design language (enforced by `src/app/globals.css` — read it)

- Dark-first, dark-only for now. Near-black base, elevated surfaces one notch
  lighter, low-alpha hairlines over shadows, three text levels.
- **Purple is identity** — brand, active nav, the ONE primary action per page header,
  focus ring. Never used to encode state.
- **Color only means status**: ok / warn / fail (vermilion) / info — plus the deliberate
  absence of one, for unknown. Everything else stays near-monochrome — that restraint is
  what makes it look expensive.
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
- shadcn/ui (radix base): components are copied in under `src/components/ui/` and themed
  by the token layer. A component may also gain variants that encode a vocabulary from
  this file — `Badge`'s status set is the one that exists — but never raw colors, and
  never a variant that puts purple on a state.
- Keep it small. This app looks at things; the thinking happens elsewhere.

@AGENTS.md
