import { EmptyState } from "@/components/pending";
import { PageHeader } from "@/components/shell/page-header";

// The list itself lands with the read layer; the route exists now so the shell has a real
// destination to make active.
export default function SweepsPage() {
  return (
    <>
      <PageHeader
        title="Sweeps"
        description="The index of every sweep discovery has run."
      />
      <div className="p-4">
        <EmptyState
          title="No sweep list yet"
          hint="This view arrives with the read layer. It will show one row per batch — city, niche, when the first run was recorded, how many queries it holds, returned / new / known, and the roll-up of its runs' states. Never a denominator and never a progress bar: a batch is a grouping, not a thing with a size."
        />
      </div>
    </>
  );
}
