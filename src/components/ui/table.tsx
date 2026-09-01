import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The dense table, themed by the token layer.
 *
 * shadcn's primitive with its palette classes replaced by ours — hairlines instead of borders,
 * the three text levels instead of `foreground`/`muted-foreground`, `surface-1` for the row
 * hover. No raw colors and no status: a table is chrome, and every hue on it arrives inside a
 * `Badge` a cell chose to render.
 *
 * `Table` brings its own `overflow-x-auto` container, so a table too wide for its column
 * scrolls **inside its own box**. That is not a detail: without it a dense table makes the whole
 * page scroll sideways at narrow widths, which moves the top bar and the header along with it.
 *
 * Cells align to the top rather than the middle. A dense row here carries a second line — an id
 * under a name, a state roll-up under a pill — and middle-aligned neighbours next to a two-line
 * cell read as though they had drifted.
 */

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-hairline", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-hairline transition-colors hover:bg-surface-1",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "px-3 py-2 text-left align-bottom text-xs font-medium whitespace-nowrap text-text-3",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-3 py-2 align-top text-text-2", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 text-left text-xs text-text-3", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow };
