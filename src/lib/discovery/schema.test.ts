import assert from "node:assert/strict";
import { test } from "node:test";

import {
  READ_MODEL,
  UNGRANTED,
  VIEWS,
  WITHHELD,
  type Relation,
  type Row,
} from "./schema.ts";

/**
 * The read-model checked against itself, offline.
 *
 * `schema:check` is the real assertion, but it needs a network and a credential. This is the half
 * that does not: a typo in a type token, a relation named in two lists that contradict each
 * other, or a mapping that stopped saying bigints arrive as strings — all caught before anyone
 * connects to anything, and all things that would otherwise surface as a confusing mismatch
 * against a database that is perfectly fine.
 */

const PG_TYPES = new Set([
  "uuid",
  "text",
  "int4",
  "int8",
  "float8",
  "timestamptz",
  "numeric",
  "_text",
]);

const relations = Object.keys(READ_MODEL) as Relation[];

test("every column names a Postgres type this repo knows how to read", () => {
  for (const relation of relations) {
    const columns = READ_MODEL[relation] as Readonly<Record<string, string>>;
    assert.ok(
      Object.keys(columns).length > 0,
      `${relation} — a modelled relation with no columns`,
    );
    for (const [column, spec] of Object.entries(columns)) {
      const bare = spec.endsWith("!") ? spec.slice(0, -1) : spec;
      assert.ok(
        PG_TYPES.has(bare),
        `${relation}.${column} — ${JSON.stringify(spec)} is not a udt_name this repo maps. ` +
          `Note it is udt_name, not data_type: text[] is "_text", never "ARRAY".`,
      );
    }
  }
});

test("VIEWS names only relations the model actually holds", () => {
  for (const view of VIEWS) {
    assert.ok(relations.includes(view), `${view} — listed as a view but not modelled`);
  }
});

test("a withheld column is never also a modelled one", () => {
  for (const { relation, column } of WITHHELD) {
    const columns = READ_MODEL[relation as Relation] as
      | Readonly<Record<string, string>>
      | undefined;
    assert.ok(columns, `${relation} — withheld from a relation that is not modelled`);
    assert.ok(
      !(column in columns!),
      `${relation}.${column} — withheld at the grant and modelled as readable. ` +
        `One of the two is wrong, and the grant is not the one that can be wrong.`,
    );
  }
});

test("an ungranted relation is never also a modelled one", () => {
  for (const relation of UNGRANTED) {
    assert.ok(
      !relations.includes(relation as Relation),
      `${relation} — listed as ungranted and modelled as readable`,
    );
  }
});

test("the driver's types, pinned — bigint arrives as a string", () => {
  // Compile-time assertions. If `TsOf` ever stops mapping int8 to string, this file stops
  // building, and the `::int` casts in sql.ts stop being load-bearing by accident rather than by
  // decision. Trap §5.8: the view's counts come back as "60", not 60.
  const bigintCount: Row<"run_accounting">["businesses_matched"] = "60";
  const smallintCount: Row<"runs">["results_returned"] = 60;
  const nullableInstant: Row<"runs">["completed_at"] = null;
  const instant: Row<"runs">["created_at"] = new Date(0);
  const textArray: Row<"businesses">["types"] = ["lawyer"];
  const nullableText: Row<"businesses">["website_domain"] = null;

  assert.equal(typeof bigintCount, "string");
  assert.equal(typeof smallintCount, "number");
  assert.equal(nullableInstant, null);
  assert.ok(instant instanceof Date);
  assert.ok(Array.isArray(textArray));
  assert.equal(nullableText, null);
});
