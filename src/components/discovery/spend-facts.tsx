import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { formatUsd, spendReading, sumUsd, type SpendReading } from "@/lib/discovery/derive";
import type { SpendRow, SweepRow } from "@/lib/discovery/sql";

/**
 * Where a spend fact is paired with a rendering — and nowhere else.
 *
 * The third file of its kind, after `status-pill.tsx` (run state, sweep standing) and
 * `business-facts.tsx` (the four business readings). Same reason each time: `derive.ts` decides
 * the word, this decides the mark, and a table, a rail and a kitchen sink cannot then arrive at
 * three different vocabularies for one fact.
 *
 * **Money is a fact, not a status, so none of this takes a colour.** Purple is identity;
 * ok / warn / fail / info is severity. "This sweep cost $1.65" is neither — it is not good, not
 * bad, and not a thing to act on. What it spends instead is weight and alignment.
 *
 * The one badge here is the hollow ring, and it means what it means everywhere else in this app:
 * absent knowledge. A sweep with no ledger rows is not a sweep that spent nothing — it is one
 * that ran before 010 existed, and the requests it made left nothing a query could count.
 */

/**
 * What was bought, in words.
 *
 * A lookup rather than a split on the colon: the vocabulary is appended to, never reordered, and
 * an unknown sku must render as itself rather than as a half of itself. The same shape
 * `instantly_status` needs for its `status_*` fallback (§4).
 */
const SKU_LABELS: Readonly<Record<string, string>> = {
  "places:text_search": "text search",
  "geocoding:geocode": "geocoding",
};

export function skuLabel(sku: string): string {
  return SKU_LABELS[sku] ?? sku;
}

/** Absent knowledge, and the only badge on this page. Absence of colour means absence of it. */
function Hollow({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <Badge variant="unknown" title={title}>
      {children}
    </Badge>
  );
}

/**
 * The copy for each reading, in one place so the table and the rail cannot drift.
 *
 * `unrecorded` says *not recorded*, never *nothing*, and never `$0.00`. That sentence is the
 * whole reason this vocabulary has two values instead of a nullable number.
 */
export const SPEND_READINGS: Readonly<
  Record<SpendReading, { blurb: string }>
> = {
  recorded: {
    blurb: "The ledger holds every request this sweep made.",
  },
  unrecorded: {
    blurb:
      "No ledger rows. This sweep ran before migration 010, so what it spent was never written down — which is not the same as having spent nothing.",
  },
};

/**
 * One sweep's spend, for a table cell.
 *
 * Two lines: the money, and what it bought. `requests` rather than `attempts` on the second line
 * because the money follows the first — but where the two disagree, the cell says so, since a
 * sweep that tried four times and paid for three is exactly the row worth noticing.
 */
export function SpendCell({ spend }: { spend: SweepRow["spend"] }) {
  const reading = spendReading(spend.attempts);

  if (reading === "unrecorded") {
    return <Hollow title={SPEND_READINGS.unrecorded.blurb}>not recorded</Hollow>;
  }

  const unbilled = spend.attempts - spend.requests;

  return (
    <div>
      <div className="tabular-nums text-text-1">{formatUsd(spend.costUsd)}</div>
      <div className="mt-0.5 text-xs text-text-3">
        {spend.requests} request{spend.requests === 1 ? "" : "s"}
        {unbilled > 0 ? (
          <span
            title="Requests that were issued and that we could not confirm Google charged for. On the ledger, out of the money."
          >
            {" · "}
            {unbilled} unbilled
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One sweep's spend split by what was bought — the rail's answer.
 *
 * The split is the point rather than a nicety. §5.11's complaint about `results_returned` has two
 * halves: it undercounts text searches, *and* it cannot see geocoding at all. A single total
 * would answer the first and quietly leave the second looking answered too.
 */
export function SpendSplit({ rows }: { rows: SpendRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <Hollow>not recorded</Hollow>
        <p className="text-xs text-text-3">{SPEND_READINGS.unrecorded.blurb}</p>
      </div>
    );
  }

  // `sumUsd` adds as integers — see derive.ts. A total is the one number on this page that this
  // component could get wrong on its own, so it does not do the arithmetic.
  const total = sumUsd(rows.map((row) => row.costUsd));

  return (
    <div className="space-y-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-3">
            <th className="pb-1 text-left font-normal">bought</th>
            <th className="pb-1 text-right font-normal" title="requests issued">
              tried
            </th>
            <th className="pb-1 text-right font-normal" title="believed charged for">
              billed
            </th>
            <th className="pb-1 text-right font-normal">list price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sku}>
              <td className="py-0.5 text-text-2">{skuLabel(row.sku)}</td>
              <td className="py-0.5 text-right tabular-nums text-text-3">{row.attempts}</td>
              <td className="py-0.5 text-right tabular-nums text-text-2">{row.requests}</td>
              <td className="py-0.5 text-right tabular-nums text-text-1">
                {formatUsd(row.costUsd)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-hairline">
            <td className="pt-1 text-text-3" colSpan={3}>
              total
            </td>
            <td className="pt-1 text-right tabular-nums text-text-1">{formatUsd(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
