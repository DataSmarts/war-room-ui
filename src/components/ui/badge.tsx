import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

// Shared by every status variant. The dot is a ::before, so a caller writes
// <Badge variant="fail">aborted</Badge> and cannot pair the wrong dot with the wrong word.
const STATUS_PILL =
  "gap-1.5 border-hairline bg-surface-1 px-2.5 font-normal text-text-2 " +
  "before:size-1.5 before:shrink-0 before:rounded-full before:content-['']"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",

        // Status pills. The whole pill stays near-monochrome and the colour is confined
        // to a 6px dot — that restraint is the design language, and it keeps a dense
        // table from turning into a christmas tree. Never `default` (purple) for a
        // state: purple is identity. See CLAUDE.md § Honest state.
        ok: `${STATUS_PILL} before:bg-status-ok`,
        warn: `${STATUS_PILL} before:bg-status-warn`,
        fail: `${STATUS_PILL} before:bg-status-fail`,
        info: `${STATUS_PILL} before:bg-status-info`,
        // Absent knowledge, not a fifth colour: the dot is a hollow ring and the label
        // drops to the metadata text level. The slot is visibly present and visibly
        // empty — a `stalled` run, or a provider card that degraded to "unknown".
        unknown: `${STATUS_PILL} text-text-3 before:border before:border-status-unknown`,
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
