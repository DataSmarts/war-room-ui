import Link from "next/link";

import {
  CONTACTS,
  CONTACTS_ORDER,
  SOCIALS,
  SOCIALS_ORDER,
  WEB_PRESENCE,
  WEB_PRESENCE_ORDER,
} from "@/components/discovery/business-facts";
import { LoadingRows } from "@/components/pending";
import { listDiscoveryCities } from "@/lib/discovery/queries";
import {
  businessFilterParams,
  hasBusinessFilter,
  type BusinessFilters,
} from "@/lib/discovery/sql";
import { cn } from "@/lib/utils";

/**
 * The six ways to narrow the list, all of them in the URL.
 *
 * **Links, not a form, for the four vocabularies** — and not to avoid JavaScript for its own
 * sake. A row of links shows every value of a three-state vocabulary at once, which is the thing
 * the vocabulary exists to teach: an operator who can see `own site · elsewhere · no site` side by
 * side has already learned that the middle one is not the last one. A `<select>` hides two of the
 * three behind a click.
 *
 * They also keep the URL clean. A GET form submits every control it holds, so `?q=&web=&city=`
 * would ride along in a link the operator meant to share. Only the name box needs a text field,
 * and it carries the other filters as hidden inputs so submitting it narrows rather than resets.
 *
 * `business` survives every one of these, because selection and narrowing are different
 * questions: the rail reads its subject by id, so a business stays open while the table moves
 * around it. Nothing here mutates anything — GET is the whole interaction.
 */

/** The URL this control would produce, with one axis changed and the selection kept. */
function href(
  basePath: string,
  filters: BusinessFilters,
  patch: Partial<BusinessFilters>,
  selected: string | null,
): string {
  const params = businessFilterParams({ ...filters, ...patch });
  if (selected) params.set("business", selected);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function FilterLink({
  children,
  active,
  title,
  href: to,
}: {
  children: React.ReactNode;
  active: boolean;
  title?: string;
  href: string;
}) {
  return (
    <Link
      href={to}
      scroll={false}
      title={title}
      aria-current={active ? "true" : undefined}
      // Purple is identity, and a chosen filter is a selection rather than a state — the same
      // reason the selected row carries a brand rule and the active nav link is brand.
      className={cn(
        "rounded px-1.5 py-0.5 transition-colors",
        active ? "text-brand" : "text-text-3 hover:text-text-2",
      )}
    >
      {children}
    </Link>
  );
}

function FilterRow<T extends string>({
  label,
  values,
  labels,
  current,
  param,
  basePath,
  filters,
  selected,
}: {
  label: string;
  values: readonly T[];
  labels: (value: T) => { label: string; note?: string };
  current: T | null;
  param: keyof BusinessFilters;
  basePath: string;
  filters: BusinessFilters;
  selected: string | null;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
      <span className="mr-1 text-text-3">{label}</span>
      <FilterLink
        active={current === null}
        href={href(basePath, filters, { [param]: null } as Partial<BusinessFilters>, selected)}
      >
        any
      </FilterLink>
      {values.map((value) => {
        const { label: word, note } = labels(value);
        return (
          <FilterLink
            key={value}
            active={current === value}
            title={note}
            href={href(
              basePath,
              filters,
              { [param]: value } as Partial<BusinessFilters>,
              selected,
            )}
          >
            {word}
          </FilterLink>
        );
      })}
    </div>
  );
}

export function BusinessFilterBar({
  filters,
  selected,
  cities,
  basePath,
}: {
  filters: BusinessFilters;
  /** Carried through every link so narrowing never closes the rail. */
  selected: string | null;
  /** `null` means the city list could not be read — the control says so and stays clearable. */
  cities: string[] | null;
  basePath: string;
}) {
  const active = hasBusinessFilter(filters);

  return (
    <div className="space-y-2 rounded-md border border-hairline bg-surface-1 p-3 text-xs">
      {/* The one control that needs typing. Hidden inputs only for filters that are actually
          set, so a submit produces the same short URL a link would. */}
      <form method="get" action={basePath} className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="name contains…"
          aria-label="Filter by business name"
          className="min-w-0 flex-1 rounded border border-hairline bg-surface-2 px-2 py-1 text-text-1 placeholder:text-text-3 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        />
        {filters.web ? <input type="hidden" name="web" value={filters.web} /> : null}
        {filters.socials ? (
          <input type="hidden" name="socials" value={filters.socials} />
        ) : null}
        {filters.contacts ? (
          <input type="hidden" name="contacts" value={filters.contacts} />
        ) : null}
        {filters.city ? <input type="hidden" name="city" value={filters.city} /> : null}
        {filters.sweep ? <input type="hidden" name="sweep" value={filters.sweep} /> : null}
        {selected ? <input type="hidden" name="business" value={selected} /> : null}
        <button
          type="submit"
          className="rounded border border-hairline px-2 py-1 text-text-2 transition-colors hover:text-text-1"
        >
          search
        </button>
      </form>

      <FilterRow
        label="web presence"
        values={WEB_PRESENCE_ORDER}
        labels={(value) => WEB_PRESENCE[value]}
        current={filters.web}
        param="web"
        basePath={basePath}
        filters={filters}
        selected={selected}
      />

      <FilterRow
        label="socials"
        values={SOCIALS_ORDER}
        labels={(value) => SOCIALS[value]}
        current={filters.socials}
        param="socials"
        basePath={basePath}
        filters={filters}
        selected={selected}
      />

      {/* Same vocabulary as socials, and it only has a row here because 008 granted the count
          the third value is derived from. Before that there was no middle value to show. */}
      <FilterRow
        label="contacts"
        values={CONTACTS_ORDER}
        labels={(value) => CONTACTS[value]}
        current={filters.contacts}
        param="contacts"
        basePath={basePath}
        filters={filters}
        selected={selected}
      />

      {cities === null ? (
        // Degraded, and it says which part: the list of options is missing, not the filter.
        <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
          <span className="mr-1 text-text-3">city</span>
          <span className="text-text-3">
            {filters.city ? `${filters.city} — ` : ""}the city list could not be read
          </span>
          {filters.city ? (
            <FilterLink
              active={false}
              href={href(basePath, filters, { city: null }, selected)}
            >
              clear
            </FilterLink>
          ) : null}
        </div>
      ) : (
        <FilterRow
          label="city"
          values={cities}
          labels={(value) => ({ label: value })}
          current={filters.city}
          param="city"
          basePath={basePath}
          filters={filters}
          selected={selected}
        />
      )}

      {(filters.sweep || active) && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-hairline pt-2">
          {filters.sweep ? (
            <span className="text-text-3">
              found by sweep{" "}
              <Link
                href={`/sweeps/${filters.sweep}`}
                className="font-mono text-text-2 decoration-hairline underline-offset-4 hover:underline"
              >
                {filters.sweep.slice(0, 8)}
              </Link>{" "}
              <FilterLink
                active={false}
                href={href(basePath, filters, { sweep: null }, selected)}
              >
                clear
              </FilterLink>
            </span>
          ) : null}
          {active ? (
            <Link
              // Every filter dropped, the selection kept — the two are different questions.
              href={
                selected
                  ? `${basePath}?${new URLSearchParams({ business: selected }).toString()}`
                  : basePath
              }
              scroll={false}
              className="text-text-3 transition-colors hover:text-text-2"
            >
              clear all filters
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function BusinessFiltersLoading() {
  return <LoadingRows rows={3} />;
}

/**
 * The live half: one tiny read for the city options.
 *
 * Its own boundary on the page rather than the table's, and deliberately unkeyed — the controls
 * must not blink out every time one of them is used. The table's boundary *is* keyed, because
 * showing the previous rows under a filter chip that already changed would be the one lie a
 * filter bar can tell.
 */
export async function BusinessFilterBarLive({
  filters,
  selected,
  basePath,
}: {
  filters: BusinessFilters;
  selected: string | null;
  basePath: string;
}) {
  const cities = await listDiscoveryCities();
  return (
    <BusinessFilterBar
      filters={filters}
      selected={selected}
      cities={cities.ok ? cities.value : null}
      basePath={basePath}
    />
  );
}
