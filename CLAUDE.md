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
  Bump it in the change that adopts a migration; the left rail's chip shows `warn` for as
  long as it and the database's head migration disagree. That chip is the whole reason 006
  granted `schema_migrations`.
- No state mutation on GET. Validate URL schemes on anything operator-edited.
- Secrets: as many as the UI needs, provider keys included — in env, never committed,
  never logged. The blast radius is the `ui` role's grant, not the number of keys.

## The way in — passwordless, and what it knowingly accepts

Six digits from an authenticator. **There is no password anywhere in this repo** — no
`ADMIN_PASSWORD`, no credential compare, nothing to phish or reuse. When the phone is lost, a
one-time code goes to **Telegram**, which is the only delivery channel this system already has
and needs no new provider, domain or secret. `src/lib/auth/` holds all of it.

- **Two gates, and neither is optional.** `src/proxy.ts` reads the cookie and redirects — Next's
  own guide calls that an *optimistic* check and says it must not be the only one.
  `requireSession()` in `src/app/(shell)/layout.tsx` is the real one, in the render path of every
  view that reads Neon. Add a route outside `(shell)` and you have added a door.
- **Fail closed, always.** `sign("")` is a valid signature under a key everybody knows, so an
  unset secret that fell through as `undefined` would turn the login into a doorway while every
  test still passed. `secrets.ts` is the only module that reads `process.env`; absent or under 32
  characters reads as `null`, `null` denies every route, and the log says which one is missing —
  never its value. **Never give a secret a fallback value.**
- **Everything else takes its secrets as parameters.** `token.ts`, `totp.ts` and `sessions.ts`
  are pure, which is what lets `node --test` check the crypto against RFC 6238's own vectors with
  no server, no clock and no environment. Keep them that way.
- **The fallback's attempt counter is advisory, and the file says so.** State the client holds is
  state the client can rewind: replaying a saved `attempts: 0` cookie restores the count, and no
  signature can prevent it because that cookie is one we really signed. What bounds guessing is
  the code's ~38 bits inside a 10-minute window. **Do not "harden" the five** — it is not the
  number doing the work. If that ever stops being enough, the answer is a table and a write grant
  in the private repo's migration sequence, not a bigger constant here.
- **A TOTP code verifies twice inside its own 30-second window.** Replay protection needs
  persistence the `ui` role does not have. Accepted: the code is typed by the operator over TLS,
  so the exposure is a shoulder-surfed code inside 30 seconds.
- **What the design accepts, on the record:** the authenticator secret is the *only* factor, and
  possession of the Telegram chat is a complete bypass of it. That was chosen deliberately over
  password + TOTP. It is a decision, not an oversight — do not "fix" it by adding a password.
- **A code is never logged, never returned to the browser, never stored.** The challenge cookie
  carries an HMAC of it, domain-separated from the token signature. Telegram failures log the
  error's **name only** — the bot token sits in the request URL, so a message would carry the
  credential into the log. Same rule as `db.ts`, same reason.
- Sign-out is a **form, not a link**: no state mutation on GET, and a prefetch must never be able
  to sign the operator out.
- **The login's vocabulary is `LoginNotice`** (`lib/auth/notices.ts`), paired with a severity once
  in `components/auth/login-form.tsx` — the same two-file split as `run_state` and
  `sweepStanding`. Three notices carry **no colour**: `unconfigured`, `delivery-unknown` and
  `fallback-unavailable` are absent knowledge, not negative answers. A wrong code is `fail`; a
  lapsed or spent challenge is `warn`.
- Enrol with `node scripts/totp-enrol.mts`. It prints and **writes nothing** — a script that
  helpfully wrote the secret into a file would be one `git add -A` from publishing the only
  factor guarding real firms' names and addresses.

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
  `socials_checked_at` set with all four URLs null renders **"none confirmed"**, never
  "none" — "never looked" and "looked, found nobody" are different facts, and the schema
  keeps them apart on purpose. `contacts_checked_at` says the same, and since migration 008
  it can be read the same way: see `checkState` (contacts) below.
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

## A business's facts — four readings, and not one of them a status

`/businesses` is the other half of discovery: not what was asked, but what came back. Four
readings, each decided once in `derive.ts` and paired with a rendering once in
`business-facts.tsx` — the same two-file split `run_state` and `sweepStanding` keep, for the
same reason. **No view re-derives one and no view invents a word for one.**

| reading | values | renders as |
| -- | -- | -- |
| `webPresence` | `site` · `off-platform` · `none` | the domain · the URL + `elsewhere` · `no site` |
| `checkState` (socials) | `found` · `none-confirmed` · `never-looked` | the platforms · `none confirmed` · **hollow** |
| `checkState` (contacts) | `found` · `none-confirmed` · `never-looked` | `2 contacts` · `none confirmed` · **hollow** |
| `ratingReading` | `rated` · `thin` · `unrated` | `4.8 · 214 reviews` · dimmed + `thin` · **hollow** |

- **None of these is a status, so none of them gets a colour.** Purple is identity,
  ok/warn/fail/info is severity, and "this business has no website" is neither — what
  separates them is weight and glyph. The hollow ring appears exactly three times and
  **never on a fact**: `never looked` (socials), `never looked` (contacts), `never rated`.
  `no site` and `none confirmed` are plain text, because somebody looked.
- **Contacts is three states because 008 granted a count, never a row.** It used to be two,
  and the reason it could not be three is worth keeping: `contacts` is ungranted to the `ui`
  role (§6) — it holds decision-makers' names and addresses — so "none confirmed" was a
  positive claim this half had no evidence for. The fix was the data, not a convention.
  `business_contact_counts` is a view over `contacts` granted to `ui`; it hands over
  `business_id`, `contacts` and `graded` as integers and nothing else, and it works because
  no view in this schema is `security_invoker`. **`contacts` itself is still ungranted and
  stays that way** — `schema:check` asserts the count is visible and the table is not, on
  every push. Do not widen it to a name, an email or a list.
- **Both halves of the contacts reading are load-bearing.** `checkState(checkedAt, count > 0)`,
  never one column alone. A contacts run that met nothing but provider errors does not stamp
  `contacts_checked_at`, so zero-with-a-timestamp is *looked, found nobody* (296 live
  businesses) and zero-without-one is *never got an answer* (530). A test asserts each column
  changes an answer the other cannot.
- **A rating is never drawn as a shape.** No stars, no bar, no meter, for either kind — a
  filled shape is a confidence claim. `RATING_CONFIDENCE_MIN` is 10, and it is *ours*, not
  Google's: probe the boundary in tests, never assert the number the way
  `PLACES_TEXT_SEARCH_CAP` is asserted. 188 live businesses are 5.0 on under ten reviews.
- **`website_domain` is never recomputed here.** The shared-platform host list lives in the
  operating half and has already outgrown what the reference documents; a domain parsed in
  this repo would disagree with the column beside it.
- **Every provider URL becomes an `href` only through `httpHref`** — an allowlist of
  `http:`/`https:`, because a browser strips tabs out of a scheme and any denylist loses.
  Five columns are provider-supplied (`website_uri` + four socials). A rejected URL is still
  *shown*; it is just not clickable.
- **The `web`, `socials` and `contacts` filter predicates in `BUSINESSES_SQL` are those two
  functions transcribed into SQL** — the one duplicated decision in the repo, because 1416
  rows are narrowed in the database. It cannot be designed away, so `schema:check` proves all
  three agree on live rows for every value of both vocabularies, and a drift refuses the push.
  Contacts is its own transcription, not socials' by association: same vocabulary, different
  pair of columns.
- **Zero sightings is a real answer, not a broken row.** 293 live businesses have no
  `run_businesses` link at all — they were written before the first run existed. §3.4's
  `sum(businesses_new) = count(businesses)` holds over the businesses *discovery* created,
  not over the table.

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
- **A width is a property of the box, never of the viewport.** Responsive behaviour here is a
  container query — that is what lets `/kitchen-sink` render a narrow rail *inside a small
  frame* instead of a drawing of one. The shell uses two, answering different questions:
  `shell-narrow` is **policy** (how wide the app frame is, and therefore what the rail may cost
  the table), `rail-narrow` is **rendering** (how wide the rail is, and therefore what fits).
  Only the second may appear in `sidebar.tsx` / `nav-links.tsx` / `chips.tsx`; the single
  `shell-narrow:` class lives in `Sidebar`, because the sink renders `SidebarChrome` from
  *inside* the shell and has to be able to pin a width and be believed. Both thresholds and
  their arithmetic are in `globals.css`. Two consequences: an element can never query its own
  container — `rail-narrow:` on the `<aside>` that *carries* `@container/rail` silently does
  nothing, which is why the rail's padding is the same at both widths — and the shell wrapper is
  now the containing block for `position: fixed`, so a future modal must portal to
  `document.body`.
- **Collapsing hides; it never deletes.** Every label the rail stops showing stays in the DOM as
  `sr-only`, so a nav row is still named "Sweeps" at both widths and `title` stays a description
  rather than becoming the name by default. `hidden` is only for a *second rendering of the same
  fact* — both copies `aria-hidden`, the name pinned once with `aria-label`. Collapsed, the one
  thing that loses its words and keeps only its shape is the hollow ring: absent knowledge has
  room for the absence of a colour and never for a word we cannot back.
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
- **A query parameter is not the route's subject, and the rule above does not reach it.**
  `/businesses?business=<id>` streams behind `<Suspense>` and **never calls `notFound()`**:
  the page is the list, the id is a selection beside it, and a stale one is a fact about the
  rail. It degrades to `RailNotFound` with the table intact and the response honestly 200.
  Read the two rules together — the question is always *what is this page about*, never
  *where did the id come from*.
- **Filters live in the URL and narrow in the database.** They are links, not a form, for
  any fixed vocabulary — a row of links shows all three states at once, which is the thing
  a three-state vocabulary exists to teach. Selection rides through every one of them:
  narrowing the list and picking a row are different questions, so the rail reads its
  subject by id and stays open while the table moves. Every list still `LIMIT`s and still
  says "showing N of M" (§9).
- Keep it small. This app looks at things; the thinking happens elsewhere.

@AGENTS.md
