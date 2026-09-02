import Link from "next/link";
import { Suspense } from "react";

import {
  ContactsMark,
  RatingMark,
  SocialsMark,
  WebPresenceMark,
} from "@/components/discovery/business-facts";
import { EmptyState, FailedState, LoadingRows } from "@/components/pending";
import {
  RailField,
  RailNotFound,
  RailValue,
} from "@/components/shell/detail-rail";
import { StatusPill } from "@/components/status-pill";
import { getBusiness, listSightings } from "@/lib/discovery/queries";
import type { BusinessRow, Page, SightingRow } from "@/lib/discovery/sql";
import { absoluteTime, relativeTime } from "@/lib/time";

/**
 * Everything known about the selected business, and every query that ever returned it.
 *
 * Split by what it costs, the same way `run-rail.tsx` is. The **facts** are one read by id — by
 * id rather than found in the table, so the selection survives a filter that would have hidden
 * the row. The **sightings** are a second statement, issued only because something is selected,
 * and they stream in behind their own boundary.
 *
 * A stale `?business=` lands on `RailNotFound` and the page stays 200. That is not a weaker
 * version of what `/sweeps/[id]` does — it is the correct answer to a different question. There
 * the id *is* the page's subject, so a missing one is a 404; here the page is the list, and the
 * list is fine.
 */

/** Open the sweep with this run selected, or the one-off run on its own. */
function sweepHref(row: SightingRow): string {
  return row.batchId ? `/sweeps/${row.batchId}?run=${row.runId}` : `/sweeps/${row.runId}`;
}

/** Which scars the run carries — named, never quoted, exactly as the run table says it. */
function scarNames(row: SightingRow): string | null {
  const names = [
    row.hasError ? "an error" : null,
    row.hasAbortedReason ? "an abort reason" : null,
  ].filter(Boolean);
  return names.length ? `carries ${names.join(" and ")}` : null;
}

export function BusinessRailFacts({ row }: { row: BusinessRow }) {
  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-1.5">
        <p className="text-text-3">the business, as Google records it</p>
        <p className="rounded bg-surface-2 p-2 text-[11px] break-words text-text-1">
          {row.name}
        </p>
      </div>

      <dl className="space-y-1">
        <RailField label="address">
          <RailValue>{row.formattedAddress}</RailValue>
        </RailField>
        <RailField label="phone">
          <RailValue>{row.nationalPhone}</RailValue>
        </RailField>
        <RailField label="international">
          <RailValue>{row.internationalPhone}</RailValue>
        </RailField>
      </dl>

      <dl className="space-y-1">
        <RailField
          label="web presence"
          title="three states: its own domain, a page on someone else's platform, or none at all"
        >
          <WebPresenceMark row={row} wrap />
        </RailField>
        <RailField
          label="socials"
          title="three states: found, looked and found nobody, or never looked"
        >
          <SocialsMark row={row} />
        </RailField>
        <RailField
          label="contacts"
          title="three states: found, looked and found nobody, or never looked"
        >
          <ContactsMark row={row} />
        </RailField>
        <RailField
          label="rating"
          title="always with its review count — a 5.0 from four reviews is a sample, not a score"
        >
          <RatingMark reading={row.rating} />
        </RailField>
      </dl>

      <dl className="space-y-1">
        <RailField
          label="place id"
          title="identity — a business five queries returned is one row, keyed on this"
        >
          <span className="font-mono text-[11px] break-all">{row.googlePlaceId}</span>
        </RailField>
        <RailField
          label="first recorded"
          title="when the row was first written. The sightings below are the authority on when it was seen"
        >
          <span title={absoluteTime(row.createdAt)}>{relativeTime(row.createdAt)}</span>
        </RailField>
        <RailField
          label="last written"
          title="a re-sighting overwrote its name or rating, or an enrichment check landed — not necessarily a sighting"
        >
          <span title={absoluteTime(row.updatedAt)}>{relativeTime(row.updatedAt)}</span>
        </RailField>
      </dl>
    </div>
  );
}

/**
 * Every query that ever returned this business, oldest first.
 *
 * The first row is tagged, and the tag is exact rather than approximate: `run_businesses.id` is a
 * bigserial, so "first ever seen" is a sequence comparison with no timestamps to tie. That run is
 * the one holding this business's `businesses_new` credit, permanently — a later sighting never
 * takes it back.
 *
 * A scar is named beside the pill and never instead of it. The text is one link away, in the run's
 * own rail, which is the only place that asks for it.
 */
export function SightingsView({ page }: { page: Page<SightingRow> }) {
  if (page.rows.length === 0) {
    return (
      <EmptyState
        title="No sightings"
        hint="We asked: no run is recorded as having returned this business. It is here without a sweep having found it — written before the runs it would have been linked to, or brought in from the era before them. That is a fact about how it arrived, not a gap in this page."
      />
    );
  }

  return (
    // `text-xs` to match the facts above it: two blocks of the same rail at two sizes read as
    // two components, and they are one.
    <div className="space-y-2 text-xs">
      <p className="text-text-3">
        {page.rows.length < page.total
          ? `showing ${page.rows.length} of ${page.total} sightings`
          : `${page.total} ${page.total === 1 ? "sighting" : "sightings"}`}
      </p>

      <ol className="space-y-2">
        {page.rows.map((row, index) => {
          const scars = scarNames(row);
          return (
            <li key={row.runId} className="space-y-1 border-t border-hairline pt-2">
              <Link
                href={sweepHref(row)}
                className="block font-mono text-[11px] break-words text-text-2 decoration-hairline underline-offset-4 hover:underline"
              >
                {row.query}
              </Link>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-text-3">
                <StatusPill state={row.state} />
                {row.rank !== null ? (
                  <span title="1-based Places position, continuous across pages">
                    rank {row.rank}
                  </span>
                ) : null}
                <span title={absoluteTime(row.seenAt)}>{relativeTime(row.seenAt)}</span>
                {index === 0 ? (
                  <span
                    className="text-text-2"
                    title="the earliest link row for this business — the run that earned it as new, permanently"
                  >
                    first sighting
                  </span>
                ) : null}
              </div>
              {scars ? <div className="text-text-3">{scars}</div> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function SightingsLoading() {
  return <LoadingRows rows={3} />;
}

export function SightingsFailed() {
  return (
    <FailedState title="Could not read this business's sightings. The database did not answer." />
  );
}

/** The live half. Always inside its own Suspense — see `BusinessRail`. */
export async function Sightings({ businessId }: { businessId: string }) {
  const result = await listSightings(businessId);
  if (!result.ok) return <SightingsFailed />;
  return <SightingsView page={result.value} />;
}

export function BusinessRailFailed() {
  return <FailedState title="Could not read this business. The database did not answer." />;
}

/**
 * The rail, from an id in the URL.
 *
 * Three outcomes and three different words for them: the read failed (*unknown* — we could not
 * ask), the id matched nothing (*not found* — we asked, and a stale link is the likely reason),
 * or the business is here. `getBusiness` already turns a malformed id into the second rather than
 * the first, so a hand-edited URL never reports a database problem.
 */
export async function BusinessRail({ id }: { id: string }) {
  const result = await getBusiness(id);
  if (!result.ok) return <BusinessRailFailed />;
  if (!result.value) return <RailNotFound />;

  return (
    <div className="space-y-4">
      <BusinessRailFacts row={result.value} />
      <Suspense fallback={<SightingsLoading />}>
        <Sightings businessId={result.value.id} />
      </Suspense>
    </div>
  );
}
