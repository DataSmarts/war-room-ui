import { Badge } from "@/components/ui/badge";
import { RUN_STATE_VALUES, type RunState } from "@/lib/discovery/derive";

/**
 * The run-state vocabulary's one rendering.
 *
 * The vocabulary itself lives in `lib/discovery/derive.ts`, next to the code that narrows the
 * view's text into it — it is a fact about the database, and the read layer is what has to
 * recognise it. What lives here is the pairing of each word with a severity, keyed on that type
 * so the two cannot drift: adding a state without a rendering stops compiling.
 *
 * Listed in the `run_state` view's own evaluation order, so this file reads against the SQL
 * rather than offering a second opinion about it. **That order is itself the answer to a
 * trap**: `completed` is tested first, so a run carrying both an `error` and a
 * `completed_at` reads as completed. `error` and `aborted_reason` are scars — neither is
 * cleared by a later success, and neither is a status.
 *
 * The mapping lives here and only here. A view writes `<StatusPill state={row.state} />`
 * and cannot pair the wrong word with the wrong severity.
 *
 * Severity is the colour axis, the word is the state: degraded (one query lost) is warn,
 * stopped (the sweep died) is fail. `stalled` gets no colour at all — it is absent
 * knowledge, and a hue would be a claim we cannot back.
 */
export const RUN_STATES: Record<
  RunState,
  { variant: "ok" | "warn" | "fail" | "info" | "unknown"; note: string }
> = {
  completed: { variant: "ok", note: "finished — even when error is set" },
  aborted: { variant: "fail", note: "the sweep stopped here, and recorded why" },
  errored: { variant: "warn", note: "this query failed; the sweep carried on" },
  running: { variant: "info", note: "a page landed in the last 10 min" },
  stalled: { variant: "unknown", note: "no ending, no reason, nothing moved" },
};

export type { RunState };

export const RUN_STATE_ORDER: readonly RunState[] = RUN_STATE_VALUES;

export function StatusPill({
  state,
  className,
}: {
  state: RunState;
  className?: string;
}) {
  return (
    <Badge variant={RUN_STATES[state].variant} className={className}>
      {state}
    </Badge>
  );
}
