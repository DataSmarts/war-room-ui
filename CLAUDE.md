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
- **A database read degrades the same way.** Anything read in a *layout* sits behind its
  own `<Suspense>` and calls `connection()` first — without the boundary it blocks every
  navigation, and without `connection()` it is baked into a prerender and reports the
  moment it was built, forever. A read that fails renders `unknown` and the page renders
  anyway. Catch and log the error's **name only**: a connection failure's message can echo
  the URL that produced it.
- **Loading is not unknown.** A skeleton means *still asking*; the hollow ring means
  *asked, and could not find out*. Same distinction as a view's loading vs a run's
  `running` — never spend one on the other.
- **`EXPECTED_SCHEMA` in `src/lib/shell-status.ts` is what this UI was built against.**
  Bump it in the change that adopts a migration; the top bar shows `warn` for as long as it
  and the database's head migration disagree. That chip is the whole reason 006 granted
  `schema_migrations`.
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
  - **One statement may name those columns**: `selectRunScars`, which reads one run. Every
    list statement returns `has_error` / `has_aborted_reason` as booleans instead, and that
    is the mechanism, not fastidiousness — a query that cannot select the column cannot leak
    it, whatever a future view does with the row. Do not widen `RUN_COLUMNS` to "save a
    round trip".
  - **Nothing renders a scar without `readScar`.** It redacts, *then* truncates — the other
    order can sever a key and leave the front half on screen — and states how much it cut.
    This is a **second** layer: `places_sweep.py` already strips `key=` and `AIza…` at the
    write. Neither layer may assume the other ran, because rows predate that regex and it
    does not cover every credential shape. `containsSecret` is the canary; keep it passing.
  - A view says a scar **exists** (`carries an error`, beside the pill and never instead of
    it). The rail is the only place its text is asked for.
- **The run is the unit of measurement. A batch is a grouping, not a thing with
  progress.** "Lawyers in California, top 50 neighborhoods" is composed in the operating
  half as one query per area and lands as 50 `runs` rows sharing a `batch_id` — a uuid,
  not a table. Group by it when a screen wants to; never render "12 of 20" or a progress
  bar over it. There is no denominator because a batch has no size, by design.
- A run's `running` is not a view's *loading*. One is what the data says, the other is
  what the page is doing, and both appear on the same screen.

## A sweep's standing — the second word, one rung up

A sweep is a `batch_id` grouping runs, so one row of the index holds five state counts and
needs one word. Ranking them is a **rendering** decision — the read layer returns the five
numbers precisely so it does not have to hold an opinion. That opinion is made once, in
`sweepStanding` (`derive.ts`), and paired with a severity once, in `status-pill.tsx`.
**No view re-ranks it**, exactly as no view re-derives `run_state`.

| standing | when | renders as |
| -- | -- | -- |
| `stopped` | any run `aborted` — terminal, and it outranks everything | fail |
| `in-flight` | any run `running` — no ending here is final yet | info |
| `unknown` | any run `stalled`, **or** the counts do not add up to `queries` | **no colour** |
| `degraded` | any run `errored`; every query ended, the sweep carried on | warn |
| `settled` | every run `completed` | ok |

- **A run is `aborted`; the sweep that holds it is `stopped`.** Different words for
  different units, deliberately — nobody scanning a dense table should have to work out
  which unit a pill is talking about.
- **Terminal has to look terminal, because shape cannot say it.** The areas after an abort
  leave no rows at all, so a stopped sweep and a live one hold the same run count and the
  same numbers inside it. `/sweeps` separates them three times over: the pill, an outlook
  line under the timestamp (`final` / `still moving` / `nothing since`), and a vermilion
  rule down the left of a stopped row.
- **The counts must add up.** A run whose `state` is a word this build does not recognise
  falls into none of the five, so the row prints `1 unrecognised` and the standing drops to
  `unknown` — never a row that reads as complete while it is short by one.

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
- **A view is split from its fetch**: `SweepTable` takes rows, `SweepIndex` awaits them.
  That is what lets `/kitchen-sink` render the states the database has never produced —
  and a view that can only be seen with the right rows in the database is a view whose
  rare states never get looked at. Its pending states are exported too, so the sink shows
  the copy the page renders rather than a second set of words that can drift.
- **URLs.** `/` is a routing fact, not a page: `next.config.ts` redirects it to `/sweeps`.
  `/sweeps/<id>` takes **either** a `batch_id` or, for an unbatched one-off, a `run_id` —
  `listSweepRuns` and `getRun` already answer both, and the sweep index links to it that way.
- **A 404 has to answer 404.** Next returns a real 404 only for a *non-streamed* response, so
  a page whose subject is an id (`/sweeps/[id]`) awaits its own read instead of sitting behind
  `<Suspense>` — otherwise `notFound()` answers 200 with 404 markup, and a stale link reports
  success. That is the same collapse `isUuid` exists to prevent. The loading state moves to
  whatever on the page has its own read; there is a `not-found.tsx` so the 404 renders inside
  the shell rather than as Next's OS-themed default.
- Keep it small. This app looks at things; the thinking happens elsewhere.

@AGENTS.md
