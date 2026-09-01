import { Badge } from "@/components/ui/badge";
import {
  RUN_STATE_VALUES,
  SWEEP_STANDING_VALUES,
  type RunState,
  type SweepStanding,
} from "@/lib/discovery/derive";

/**
 * Where a word is paired with a severity — for both vocabularies, and nowhere else.
 *
 * The words themselves live in `lib/discovery/derive.ts`: `RunState` because it is what the
 * `run_state` view emits and the read layer is what has to recognise it, `SweepStanding` because
 * ranking five counts into one word is a decision that must be made once. What lives *here* is
 * only the pairing with a colour, keyed on those types so the two cannot drift: adding a word
 * without a rendering stops compiling.
 *
 * Severity is the colour axis in both. Nothing here is ever purple — purple is identity.
 */

/** The four severities and the deliberate absence of one. `Badge`'s status variants, exactly. */
type Severity = "ok" | "warn" | "fail" | "info" | "unknown";

/**
 * The run-state vocabulary's one rendering.
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
 * Severity is the colour axis, the word is the state: one query lost is warn, the sweep
 * stopped is fail. `stalled` gets no colour at all — it is absent knowledge, and a hue
 * would be a claim we cannot back.
 */
export const RUN_STATES: Record<RunState, { variant: Severity; note: string }> = {
  completed: { variant: "ok", note: "finished — even when error is set" },
  aborted: { variant: "fail", note: "the sweep stopped here, and recorded why" },
  errored: { variant: "warn", note: "this query failed; the sweep carried on" },
  running: { variant: "info", note: "a page landed in the last 10 min" },
  stalled: { variant: "unknown", note: "no ending, no reason, nothing moved" },
};

export type { RunState, SweepStanding };

export const RUN_STATE_ORDER: readonly RunState[] = RUN_STATE_VALUES;

/**
 * Nullable on purpose. `runStateOf` returns null for a word this build has never seen, which is
 * schema drift rather than a sixth state — and the rendering for it is decided here, beside the
 * vocabulary, rather than branched in each view. The sweep index already prints the same word
 * when a batch's counts fall short of its runs; this is that word for a single row.
 *
 * No colour, for the reason every `unknown` in this app has none: we do not know what it means,
 * and a hue would be a claim we cannot back.
 */
export function StatusPill({
  state,
  className,
}: {
  state: RunState | null;
  className?: string;
}) {
  if (state === null) {
    return (
      <Badge
        variant="unknown"
        className={className}
        title="the run_state view emitted a word this build does not recognise — check the schema chip"
      >
        unrecognised
      </Badge>
    );
  }
  return (
    <Badge variant={RUN_STATES[state].variant} className={className}>
      {state}
    </Badge>
  );
}

/**
 * A whole sweep's standing — the second vocabulary, one rung up from a run.
 *
 * The severities are the same four plus the same absence, because they answer the same question
 * about a bigger unit: `stopped` is the sweep's `aborted`, `degraded` is its `errored`. What is
 * **not** the same is the word, and that is the point — a run is aborted, the sweep that holds it
 * stopped, and a reader looking at a dense table should never have to work out which unit a pill
 * is talking about.
 *
 * `unknown` covers two different silences that a row cannot tell apart and must not pretend to:
 * a stalled run, and a run whose state is a word this build does not recognise. Both mean the
 * same thing to a reader — we cannot say — so both get the hollow ring and no colour.
 *
 * `outlook` is the second axis, and it is the one that does the real work in a list. A colour
 * says how bad; `outlook` says **whether anything else is coming** — and that is the difference
 * a sweep index cannot afford to blur, because a stopped sweep and a live one hold the same
 * number of rows and the same numbers in them (§5.6). Terminal must look terminal.
 *
 * The order below is the ranking `sweepStanding` applies, so this file reads against that
 * function rather than offering a second opinion about it.
 */
export const SWEEP_STANDINGS: Record<
  SweepStanding,
  {
    variant: Severity;
    label: string;
    /** Is anything else coming? The three honest answers, and no fourth. */
    outlook: "final" | "still moving" | "nothing since";
    note: string;
  }
> = {
  stopped: {
    variant: "fail",
    label: "stopped",
    outlook: "final",
    note: "it hit an abort and recorded why — nothing more is coming",
  },
  "in-flight": {
    variant: "info",
    label: "in flight",
    outlook: "still moving",
    note: "a page landed in the last 10 min; no conclusion is final yet",
  },
  degraded: {
    variant: "warn",
    label: "degraded",
    outlook: "final",
    note: "every query ended; at least one failed, and the sweep carried on",
  },
  settled: {
    variant: "ok",
    label: "settled",
    outlook: "final",
    note: "every query completed",
  },
  unknown: {
    variant: "unknown",
    label: "unknown",
    outlook: "nothing since",
    note: "nothing has moved, or a run holds a state this build cannot read",
  },
};

export const SWEEP_STANDING_ORDER: readonly SweepStanding[] = SWEEP_STANDING_VALUES;

export function SweepStandingPill({
  standing,
  className,
}: {
  standing: SweepStanding;
  className?: string;
}) {
  const { variant, label } = SWEEP_STANDINGS[standing];
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
