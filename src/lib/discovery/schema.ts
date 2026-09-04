/**
 * The read-model: every relation this UI is allowed to see, column by column.
 *
 * One table, two consumers. TypeScript derives its row types from it, and `scripts/schema-check.mts`
 * asserts it against `information_schema` at push time — so the types cannot quietly stop
 * describing the database. A read-model in a public repo is a claim about a database nobody
 * reading the repo can see; the check is what makes the claim falsifiable.
 *
 * Types are Postgres `udt_name`, not `data_type`: `data_type` reports `text[]` as the useless
 * token `ARRAY`, while `udt_name` says `_text`. A trailing `!` means not-null.
 *
 * **No imports.** Bare `node` runs `schema-check.mts` against this file with nothing but type
 * stripping.
 *
 * This file describes the *database*. The shaped, aliased, cast rows a view actually consumes
 * are `queries.ts`'s business — see the `int8` note below for why the two are deliberately
 * different.
 */

/** The Postgres types the granted surface actually uses. */
type PgType =
  | "uuid"
  | "text"
  | "int4"
  | "int8"
  | "float8"
  | "timestamptz"
  | "_text";

type PgColumn = PgType | `${PgType}!`;

type Columns = Readonly<Record<string, PgColumn>>;

/**
 * What the `@neondatabase/serverless` driver actually hands back. Measured, not assumed.
 *
 * **`int8` maps to `string`, and that is the point** (trap §5.8). The driver returns bigint as a
 * string — `"60"`, not `60` — so a view's counts are typed `string` here and forgetting the
 * `::int` cast in SQL becomes a type error rather than a sixty rendered as the characters six and
 * nought. `queries.ts` casts, then types the result `number`; the gap between the two files is
 * the cast, stated.
 */
type TsOf<T extends PgType> = T extends "uuid" | "text" | "int8"
  ? string
  : T extends "int4" | "float8"
    ? number
    : T extends "timestamptz"
      ? Date
      : T extends "_text"
        ? string[]
        : never;

type TsOfColumn<C extends PgColumn> = C extends `${infer T extends PgType}!`
  ? TsOf<T>
  : C extends PgType
    ? TsOf<C> | null
    : never;

/**
 * The eight relations migration 006 and 007 grant to the `ui` role, and nothing else.
 *
 * Nullability on a **base table** is enforced by the check against `information_schema`.
 * Nullability on a **view** cannot be: `information_schema` reports every view column as
 * nullable, whatever the view's SQL guarantees. So a `!` on a view column is a claim read out of
 * the migration that created it — and the check backs it the only way a reader can, by asserting
 * the live rows hold no nulls there.
 */
export const READ_MODEL = {
  /** 001, `batch_id` from 002, `updated_at` + `aborted_reason` from 007. */
  runs: {
    id: "uuid!",
    query: "text!",
    niche: "text",
    neighborhood: "text",
    city: "text",
    country: "text",
    // The geocoded bias centre of the *area*, not of any business.
    lat: "float8",
    lng: "float8",
    // Raw results across all pages, before dedupe — so this is always >= businesses_matched.
    // A full page is a ceiling, not a count: see `resultCount` in derive.ts.
    results_returned: "int4!",
    next_page_token: "text",
    completed_at: "timestamptz",
    // Scars, not statuses (§5.5). Both survive a later success, and both can carry a provider's
    // response body verbatim — a Google error body can echo a request URL, and request URLs
    // carry `key=`. Modelled so the check can see them; never selected by a list query.
    error: "text",
    created_at: "timestamptz!",
    batch_id: "uuid",
    // The heartbeat. Written only inside the transaction where a page commits, so it means
    // "the last page that landed" and can never mean "the last time we tried".
    updated_at: "timestamptz!",
    aborted_reason: "text",
  },

  /** 001. Per-query accounting, derived — a counter can disagree with the rows it counts. */
  run_accounting: {
    run_id: "uuid!",
    query: "text!",
    niche: "text",
    city: "text",
    neighborhood: "text",
    results_returned: "int4!",
    // bigint. All four arrive as strings; all four need `::int` in SQL.
    businesses_matched: "int8!",
    businesses_new: "int8!",
    businesses_known: "int8!",
    // Lies twice over (§5.9): it counts `website_uri`, so an off-platform presence is in it, and
    // it is evaluated *now* rather than at sweep time, so two screenshots of the same historical
    // run legitimately disagree. Renamed at the boundary in queries.ts, never here — this file
    // says what the database calls things.
    businesses_with_website: "int8!",
    completed_at: "timestamptz",
    created_at: "timestamptz!",
  },

  /** 007. The state of a run, concluded from facts. The only place that decision is made. */
  run_state: {
    run_id: "uuid!",
    // One of `RUN_STATE_VALUES` — narrowed by `runStateOf`, never re-derived.
    state: "text!",
    updated_at: "timestamptz!",
  },

  /** 001. This run returned this business. Nothing is ever updated. */
  run_businesses: {
    // bigserial, so "first time ever seen" is min(id) — exact, no timestamp ties to break.
    id: "int8!",
    run_id: "uuid!",
    business_id: "uuid!",
    rank: "int4",
    seen_at: "timestamptz!",
  },

  /**
   * 001, extended by 003 and 004. **Twenty of twenty-three columns.**
   *
   * `places_raw`, `socials_raw` and `contacts_raw` are withheld at the grant, so `select *` on
   * this table is refused outright. That refusal is the mechanism keeping the payloads withheld —
   * every query must name its columns, and that friction is intended.
   */
  businesses: {
    id: "uuid!",
    google_place_id: "text!",
    name: "text!",
    // Three states, not two, and it takes both columns to tell them apart (§5.3). See
    // `webPresence` in derive.ts.
    website_uri: "text",
    website_domain: "text",
    formatted_address: "text",
    national_phone: "text",
    international_phone: "text",
    rating: "float8",
    user_rating_count: "int4",
    price_level: "text",
    types: "_text!",
    created_at: "timestamptz!",
    updated_at: "timestamptz!",
    facebook_url: "text",
    instagram_url: "text",
    x_url: "text",
    linkedin_url: "text",
    // Set even when the check found nothing, so "never looked" stays distinguishable from
    // "looked, found nobody" (§5.4). See `checkState` in derive.ts.
    socials_checked_at: "timestamptz",
    contacts_checked_at: "timestamptz",
  },

  /**
   * 008. How many contacts a business has — and not one thing about who they are.
   *
   * `contacts` stays in `UNGRANTED` below, and that pairing is the entire safety argument: the
   * view runs with its owner's rights, so SELECT here grants nothing on the table underneath it.
   * The check asserts both halves on every push — this relation visible, that one not.
   *
   * What the count buys is the third state. `contacts_checked_at` says an enrichment ran; this
   * says whether it found anyone, and between them `checkState` answers for contacts exactly what
   * it already answers for socials. 296 live businesses were looked at and had nobody, which is a
   * fact about them and not a gap in our data — before 008 this half could not tell them apart
   * from the 590 that do.
   *
   * There is no row for a business with no contacts; `BUSINESS_COLUMNS` coalesces to 0.
   */
  business_contact_counts: {
    business_id: "uuid!",
    // Cast to int4 in the view on purpose. Left as the count's own bigint it would arrive as a
    // string (§5.8) and `> 0` would be a compile error rather than a wrong reading.
    contacts: "int4!",
    // Counted through `graded_contacts`, where 004 keeps the three-source provenance rule. Granted
    // and modelled so a screen that wants it needs no migration; nothing selects it today.
    graded: "int4!",
  },

  /** 001. Granted so the shell can say which migration this UI was built against. */
  schema_migrations: {
    version: "text!",
    applied_at: "timestamptz!",
  },

  /**
   * 005. **Four of five columns, and every row is a personal email address.**
   *
   * `raw` is withheld — it is the provider's bounce or unsubscribe event verbatim. Account-level
   * and permanent: it survives campaigns and offers, because "never again" is about the person,
   * not the pitch. Read-only here in every sense; writing it belongs to the mirror and to the
   * operator's stop command.
   */
  suppression: {
    email: "text!",
    reason: "text!",
    source: "text!",
    suppressed_at: "timestamptz!",
  },

  /**
   * 005. The pre-send question, answered across both eras — and the one granted relation that
   * carries personal email addresses row for row.
   *
   * Granting the view grants nothing on `campaign_memberships`, `contacts` or `legacy_exports`
   * underneath it: no view in this schema is `security_invoker`. A screen wants "has this
   * business been contacted", which is a boolean; it does not want the address, and until the
   * login lands this deploy is a public URL.
   *
   * `business_id` is nullable on purpose — legacy rows LEFT JOIN `businesses` on
   * `website_domain`, so an address whose business was never re-discovered surfaces unattached.
   */
  contacted_businesses: {
    business_id: "uuid",
    email: "text!",
    campaign: "text!",
    exported_at: "timestamptz!",
    // 'war_room' or 'legacy'.
    source: "text!",
  },
} as const satisfies Readonly<Record<string, Columns>>;

export type Relation = keyof typeof READ_MODEL;

/** A raw row, exactly as the driver hands it back — bigints included. */
export type Row<R extends Relation> = {
  // The `satisfies` above already guarantees every value is a `PgColumn`; the intersection is
  // what tells the mapped type so.
  [K in keyof (typeof READ_MODEL)[R]]: TsOfColumn<
    (typeof READ_MODEL)[R][K] & PgColumn
  >;
};

/**
 * Relations backed by a view. `information_schema` reports their columns as nullable whatever
 * the SQL guarantees, so the check proves a view's `!` against live rows instead.
 */
export const VIEWS: ReadonlySet<Relation> = new Set([
  "run_accounting",
  "run_state",
  "contacted_businesses",
  "business_contact_counts",
]);

/**
 * Columns the grant withholds, which must therefore be **invisible** rather than merely unread.
 *
 * Every one is an unmodeled third-party payload holding PII we never chose to store in a column.
 * The check asserts they do not appear in `information_schema` at all — which is a statement
 * about the role, not about our habits.
 *
 * **009 withheld three more, and they belong here the day their relations are modelled.**
 * `lead_research.raw` is a sixth payload; `outreach_queue.email` and `.name` are a *person*, and
 * the reason the queue was granted 17 of its 19 columns rather than whole — a screen can read it
 * without `contacts` becoming readable through it, which is `contacted_businesses`' mechanism
 * pointed the other way. They are left out here only because a withheld column naming a relation
 * this repo does not model asserts nothing while reading as though it did, and the test beside
 * this file says so. Whoever models the queue adds all three in the same change.
 */
export const WITHHELD: ReadonlyArray<{ relation: string; column: string }> = [
  { relation: "businesses", column: "places_raw" },
  { relation: "businesses", column: "socials_raw" },
  { relation: "businesses", column: "contacts_raw" },
  { relation: "suppression", column: "raw" },
];

/**
 * Relations that exist in this database and must stay invisible to the `ui` role.
 *
 * Four, since 009 — and the six that left this list left it the way 006 said they would: "no
 * screen reads them yet. Each is one line in a later migration on the day one does." `campaigns`,
 * `composed_sequences`, `artifacts`, `lead_research`, `research_artifacts` and `outreach_queue`
 * are readable now. **What did not move is the write.** `exported_at` is still the placement
 * claim, the receipt pair and the three `instantly_status` columns still belong to the push and
 * the mirror, and `composed_sequences.cleared_by` still authorises a real send — this half reads
 * all of it and writes none of it, and there is no INSERT, UPDATE or DELETE anywhere in its grant.
 *
 * `campaign_memberships` stayed dark on 006's own argument one table over: `outreach_queue`
 * answers what a screen asks of it, and the table adds `contact_id` — a key into `contacts` —
 * and `instantly_status_raw`, a provider blob of the kind `WITHHELD` above names four times.
 *
 * `contacts` is the one this list is asked about most, so state it here: 008 granted a *count*
 * over it and the table stayed exactly this dark; 009 granted a *queue* over it and withheld the
 * two columns that would have undone that. Three views now answer questions about `contacts`
 * without a row of it ever being readable, and the day any of them is quietly replaced by a grant
 * on the table, this line is the one that should have stopped it.
 *
 * Asserting the list from outside the migration that wrote it is the point: this is the blast
 * radius, checked by the half it was drawn around.
 */
export const UNGRANTED: readonly string[] = [
  "campaign_memberships",
  "contacts",
  "graded_contacts",
  "legacy_exports",
];
