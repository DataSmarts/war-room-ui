import { EmptyState } from "@/components/pending";
import { DetailLayout, RailEmpty } from "@/components/shell/detail-rail";
import { PageHeader } from "@/components/shell/page-header";

// The list lands with the read layer, and the rail's body with the browser that fills it.
// Both are here now so the two-column shape that justified a top bar over a sidebar is real
// rather than promised.
export default function BusinessesPage() {
  return (
    <>
      <PageHeader
        title="Businesses"
        description="Everything discovery has found, with the detail rail beside it."
      />
      <DetailLayout rail={<RailEmpty />}>
        <EmptyState
          title="No business list yet"
          hint="This view arrives with the read layer. Web presence and socials will render as three states each, not two — a page on someone else's platform is not 'no website', and a check that found nobody is 'none confirmed', never 'none'."
        />
      </DetailLayout>
    </>
  );
}
