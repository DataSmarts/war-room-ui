import { EmptyState } from "@/components/pending";
import { DetailLayout, RailEmpty } from "@/components/shell/detail-rail";
import { PageHeader } from "@/components/shell/page-header";

// A placeholder, and it has to say so. The read layer exists — DAT-93 shipped it — but this
// page does not call it, and "no businesses" would be a claim about a database nothing here
// asked. Not built, not empty, not unknown: three different facts, and this app spends a
// different word on each. The rail is real so the two-column shape that justified a top bar
// over a sidebar is real too, rather than promised.
export default function BusinessesPage() {
  return (
    <>
      <PageHeader
        title="Businesses"
        description="Everything discovery has found, with the detail rail beside it."
      />
      <DetailLayout rail={<RailEmpty />}>
        <EmptyState
          title="Not built yet"
          hint="Nothing on this page has asked the database anything — so this is a placeholder, not an empty result and not a read that failed. The dense list, its filters and the rail's body arrive with the business browser. Web presence and socials will render as three states each, not two: a page on someone else's platform is not 'no website', and a check that found nobody is 'none confirmed', never 'none'."
        />
      </DetailLayout>
    </>
  );
}
