import Link from "next/link";

import {
  ContactsMark,
  RatingMark,
  SocialsMark,
  WebPresenceMark,
} from "@/components/discovery/business-facts";
import { EmptyState, FailedState, LoadingRows } from "@/components/pending";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  businessFilterParams,
  NO_BUSINESS_FILTERS,
  type BusinessFilters,
  type BusinessRow,
  type Page,
} from "@/lib/discovery/sql";
import { cn } from "@/lib/utils";

/**
 * Everything discovery has found, with nothing fetched.
 *
 * Rows come in as a prop, the same split `sweep-table.tsx` and `run-table.tsx` keep, and here it
 * earns its keep more than anywhere else: of 1416 live businesses, **two** have an off-platform
 * presence. A view whose rare states can only be seen with the right rows in the database is a
 * view whose rare states never get looked at, so `/kitchen-sink` renders all of them from
 * fixtures.
 *
 * Every cell's rendering comes from `business-facts.tsx`. Nothing here decides what a fact looks
 * like, which is what stops the table and the rail from disagreeing about the same business.
 */

/** Picking a row keeps the filters. Selection and narrowing are separate questions. */
function hrefFor(basePath: string, filters: BusinessFilters, id: string): string {
  const params = businessFilterParams(filters);
  params.set("business", id);
  return `${basePath}?${params.toString()}`;
}

const NUM = "text-right tabular-nums text-text-1";

function BusinessTableRow({
  row,
  basePath,
  filters,
  selected,
}: {
  row: BusinessRow;
  basePath: string;
  filters: BusinessFilters;
  selected: boolean;
}) {
  return (
    <TableRow
      aria-current={selected ? "true" : undefined}
      className={cn(selected && "bg-surface-1")}
    >
      <TableCell
        className={cn(
          "border-l-2",
          selected ? "border-l-brand" : "border-l-transparent",
        )}
      >
        {/* Forty-nine names in this table are shared by more than one business, so the address
            is not decoration — it is what tells two rows apart. `scroll` stays off so picking a
            row does not throw the reader back to the top. */}
        <Link
          href={hrefFor(basePath, filters, row.id)}
          scroll={false}
          className="text-text-1 decoration-hairline underline-offset-4 hover:underline"
        >
          {row.name}
        </Link>
        {row.formattedAddress ? (
          <div className="mt-0.5 text-xs text-text-3">{row.formattedAddress}</div>
        ) : null}
      </TableCell>

      <TableCell className="max-w-56">
        <WebPresenceMark row={row} />
      </TableCell>

      <TableCell>
        <SocialsMark row={row} />
      </TableCell>

      <TableCell>
        <ContactsMark row={row} />
      </TableCell>

      <TableCell>
        <RatingMark reading={row.rating} />
      </TableCell>

      <TableCell
        className={NUM}
        title="how many queries have ever returned it — zero means it reached this database without a sweep finding it"
      >
        {row.sightings}
      </TableCell>
    </TableRow>
  );
}

export function BusinessTable({
  page,
  basePath,
  filters = NO_BUSINESS_FILTERS,
  selected,
}: {
  page: Page<BusinessRow>;
  /** Where a row's link points, so selection lands back on this same list. */
  basePath: string;
  /** Carried into every row's href, so picking one does not silently widen the list. */
  filters?: BusinessFilters;
  selected?: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="border-l-2 border-l-transparent">Business</TableHead>
          <TableHead title="three states: its own domain, a page on someone else's platform, or none at all">
            Web presence
          </TableHead>
          <TableHead title="three states: found, looked and found nobody, or never looked">
            Socials
          </TableHead>
          <TableHead title="three states: how many were found, looked and found nobody, or never looked">
            Contacts
          </TableHead>
          <TableHead title="always with its review count — a 5.0 from four reviews is a sample, not a score">
            Rating
          </TableHead>
          <TableHead className="text-right">Sightings</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {page.rows.map((row) => (
          <BusinessTableRow
            key={row.id}
            row={row}
            basePath={basePath}
            filters={filters}
            selected={row.id === selected}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * "1416 businesses", or what the LIMIT left of them (§9).
 *
 * The ceiling is said out loud rather than paged around. This app cannot add an index and must be
 * honest about the ceiling instead of routing around it — and at these volumes the filters are
 * the navigation.
 */
export function BusinessCount({ page }: { page: Page<BusinessRow> }) {
  const { rows, total } = page;
  return (
    <p className="text-xs text-text-3">
      {rows.length < total
        ? `showing ${rows.length} of ${total} businesses — narrow with a filter`
        : `${total} ${total === 1 ? "business" : "businesses"}`}
    </p>
  );
}

// The page's own pending states, exported so the kitchen sink shows the copy an operator meets.

export function BusinessesLoading() {
  return <LoadingRows rows={8} />;
}

/** No filters, no rows: discovery has never recorded a business. */
export function BusinessesEmpty() {
  return (
    <EmptyState
      title="No businesses yet"
      hint="We asked, and discovery has never recorded one — no sweep has returned a result. This is an answer, not a gap: run a sweep in the operating half and they land here."
    />
  );
}

/**
 * Filters, no rows — and a different fact from an empty table.
 *
 * Spending "no businesses yet" on this would tell an operator the pipeline is empty when it holds
 * fourteen hundred rows and their filter is simply narrow.
 */
export function BusinessesFiltered() {
  return (
    <EmptyState
      title="Nothing matched"
      hint="There are businesses here — none of them match every filter at once. Widen or clear one; the selection in the rail is unaffected."
    />
  );
}

export function BusinessesFailed() {
  return (
    <FailedState title="Could not read the business list. The database did not answer." />
  );
}
