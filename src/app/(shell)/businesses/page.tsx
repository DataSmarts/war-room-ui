import { Suspense } from "react";

import {
  BusinessFilterBarLive,
  BusinessFiltersLoading,
} from "@/components/discovery/business-filters";
import { BusinessRail } from "@/components/discovery/business-rail";
import {
  BusinessCount,
  BusinessesEmpty,
  BusinessesFailed,
  BusinessesFiltered,
  BusinessesLoading,
  BusinessTable,
} from "@/components/discovery/business-table";
import { LowDataNotice } from "@/components/pending";
import {
  DetailLayout,
  RailEmpty,
  RailLoading,
} from "@/components/shell/detail-rail";
import { PageHeader } from "@/components/shell/page-header";
import { listBusinesses } from "@/lib/discovery/queries";
import {
  businessFilterParams,
  hasBusinessFilter,
  parseBusinessFilters,
  type BusinessFilters,
} from "@/lib/discovery/sql";

/**
 * Everything discovery has found, and the rail for the one that is selected.
 *
 * **This page streams, and never calls `notFound()` — the two facts are the same fact.** The rule
 * `/sweeps/[id]` keeps exists because Next returns a real 404 only for a non-streamed response,
 * so behind a `<Suspense>` a `notFound()` answers 200 with 404 markup and a stale link reports
 * success. There the id *is* the page's subject, so there is nothing honest to paint before it
 * resolves. Here the subject is the list; the id is a query parameter beside it, and a
 * `?business=` matching nothing is a fact about the rail, not about the page. 200 with the table
 * intact and `RailNotFound` in the margin is the true answer, so the boundaries cost nothing.
 *
 * Five pending states, each on its real trigger: `{ ok: false }` is *unknown*, no rows with no
 * filters is *empty*, no rows **with** filters is *nothing matched* — a different fact, and the
 * one a dense list gets wrong most often — the fallback is *loading*, and a handful of businesses
 * is too few to generalise from.
 */

const BASE_PATH = "/businesses";

/** Below this the list is a few rows, not a population to reason across (§5.14). */
const LOW_DATA_MAX = 3;

export default async function BusinessesPage({
  searchParams,
}: PageProps<"/businesses">) {
  const params = await searchParams;
  const filters = parseBusinessFilters(params);

  const raw = typeof params.business === "string" ? params.business.trim() : "";
  const selected = raw === "" ? null : raw;

  return (
    <>
      <PageHeader
        title="Businesses"
        description="Everything discovery has found, with the detail rail beside it."
      />
      <DetailLayout
        rail={
          selected === null ? (
            <RailEmpty />
          ) : (
            // Keyed on the id: picking a different business should say "still asking" rather
            // than leave the previous one on screen under a new selection.
            <Suspense key={selected} fallback={<RailLoading />}>
              <BusinessRail id={selected} />
            </Suspense>
          )
        }
      >
        <div className="space-y-3">
          <Suspense fallback={<BusinessFiltersLoading />}>
            <BusinessFilterBarLive
              filters={filters}
              selected={selected}
              basePath={BASE_PATH}
            />
          </Suspense>

          {/* Keyed on the filters, so a narrowed list never paints the old rows underneath the
              new chips. The skeleton means still asking — it is not the hollow ring. */}
          <Suspense
            key={businessFilterParams(filters).toString()}
            fallback={<BusinessesLoading />}
          >
            <BusinessIndex filters={filters} selected={selected} />
          </Suspense>

          {/* Permanent, and outside both boundaries: true whatever the reads did. These are the
              three things a reader will otherwise infer wrongly from the table above. */}
          <p className="max-w-prose text-xs text-text-3">
            <span className="text-text-2">Three states, not two.</span> A page on someone
            else&rsquo;s platform is a real web presence and not &ldquo;no site&rdquo;; a
            socials or contacts check that found nobody is{" "}
            <span className="text-text-2">none confirmed</span>, which is a fact about the
            business rather than a gap in ours — the contacts count comes from a view that
            hands this deploy a number and never a name. And a rating always carries its
            review count, because a 5.0 from four reviews is a sample, not a score.
          </p>
        </div>
      </DetailLayout>
    </>
  );
}

async function BusinessIndex({
  filters,
  selected,
}: {
  filters: BusinessFilters;
  selected: string | null;
}) {
  const businesses = await listBusinesses(filters);

  if (!businesses.ok) return <BusinessesFailed />;

  const page = businesses.value;
  if (page.rows.length === 0) {
    // Empty and filtered-to-nothing are different facts, and spending one on the other tells an
    // operator the pipeline is empty when it holds fourteen hundred rows behind a narrow filter.
    return hasBusinessFilter(filters) ? <BusinessesFiltered /> : <BusinessesEmpty />;
  }

  return (
    <div className="space-y-3">
      <BusinessCount page={page} />
      <BusinessTable
        page={page}
        basePath={BASE_PATH}
        filters={filters}
        selected={selected ?? undefined}
      />
      {/* Only when nothing is filtered. `total` is the *filtered* count here, and a narrow
          filter returning two rows is not low data — it is a narrow filter. Saying "too few to
          read a trend from" about it would caveat the operator's own question. */}
      {!hasBusinessFilter(filters) && page.total <= LOW_DATA_MAX ? (
        <LowDataNotice n={page.total} noun="business" plural="businesses" />
      ) : null}
    </div>
  );
}
