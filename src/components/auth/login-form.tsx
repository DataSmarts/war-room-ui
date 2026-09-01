import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type LoginNotice, type LoginState } from "@/lib/auth/notices";
import { cn } from "@/lib/utils";

/**
 * The login screen's one rendering — split from its action, like every other view here.
 *
 * `SweepTable` takes rows and `SweepIndex` awaits them; `LoginFormView` takes a state and
 * `LoginForm` wires the action to it. That split is what lets `/kitchen-sink` show a rejected
 * code, a lapsed challenge and a Telegram that would not answer, without needing a wrong code,
 * a ten-minute wait or a broken bot token to produce one. A state that can only be seen by
 * breaking something is a state nobody ever looks at.
 *
 * The copy is exported for the same reason: the sink renders the words this page renders,
 * rather than a second set that can drift away from them.
 */

/** The four severities and the deliberate absence of one — `Badge`'s status variants, exactly
 *  as `status-pill.tsx` names them. */
type Severity = "ok" | "warn" | "fail" | "info" | "unknown";

/**
 * Where a notice is paired with a severity, and nowhere else.
 *
 * Keyed on `LoginNotice`, so a word added to the vocabulary without a rendering stops compiling
 * — the same guarantee `RUN_STATES` gives.
 *
 * **Three of these carry no colour.** `unconfigured`, `delivery-unknown` and
 * `fallback-unavailable` are absent knowledge: the server was never given a secret, or was
 * never told the message arrived, or has nowhere to send one. A colour would be a claim we
 * cannot back — the same reason `stalled` has none. A wrong code is a real negative answer and
 * gets `fail`; a challenge that lapsed or ran out is recoverable and gets `warn`.
 */
export const LOGIN_NOTICES: Record<
  LoginNotice,
  { variant: Severity; label: string; detail: string }
> = {
  "wrong-code": {
    variant: "fail",
    label: "rejected",
    // Deliberately says nothing about *which* code. This notice is reachable from both
    // questions, and "check the authenticator" is wrong advice on the screen asking for a
    // Telegram code. What to do next belongs to the subtitle, which knows the mode.
    detail: "That code is not valid.",
  },
  "malformed-code": {
    variant: "fail",
    label: "rejected",
    detail: "An authenticator code is six digits.",
  },
  unconfigured: {
    variant: "unknown",
    label: "cannot check",
    detail:
      "This deploy has no authenticator secret it can read, so no code can be checked. The server log says which one is missing.",
  },
  "code-sent": {
    variant: "info",
    label: "sent",
    detail: "A code is on its way to Telegram. It is good for ten minutes.",
  },
  "delivery-unknown": {
    variant: "unknown",
    label: "not confirmed",
    detail:
      "Telegram did not confirm the message. If it arrives anyway, the code below still works.",
  },
  "no-challenge": {
    variant: "warn",
    label: "no code pending",
    detail: "This browser is not holding a code we sent. Ask for a new one.",
  },
  "challenge-expired": {
    variant: "warn",
    label: "expired",
    detail: "That code has lapsed. Ask for a new one.",
  },
  "challenge-spent": {
    variant: "warn",
    label: "spent",
    detail: "Too many wrong answers for that code. Ask for a new one.",
  },
  "fallback-unavailable": {
    variant: "unknown",
    label: "unavailable",
    detail: "No Telegram destination is configured, so a fallback code cannot be sent.",
  },
};

export function LoginNoticeLine({ notice }: { notice: LoginNotice }) {
  const { variant, label, detail } = LOGIN_NOTICES[notice];
  return (
    <div
      role="alert"
      className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface-1 p-2.5"
    >
      <Badge variant={variant}>{label}</Badge>
      <p className="text-xs text-text-3">{detail}</p>
    </div>
  );
}

/**
 * What to do next — and it lives here, with the field, rather than on the page.
 *
 * The page's header is rendered once and cannot know which question is being asked, so a
 * subtitle up there goes stale the moment the fallback opens: "six digits from the
 * authenticator" printed above a box wanting eight characters from Telegram. Keyed on the mode,
 * beside the input it describes, it cannot.
 */
export const LOGIN_SUBTITLES: Record<LoginState["mode"], string> = {
  authenticator: "Six digits from the authenticator, as it is showing now. There is no password.",
  fallback: "The eight characters sent to Telegram. Good for ten minutes.",
};

const FIELD =
  "w-full rounded-md border border-hairline bg-background px-3 py-2 text-center font-mono " +
  "text-lg tracking-[0.4em] text-text-1 outline-none transition-colors " +
  "placeholder:text-text-3 placeholder:tracking-normal " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The two questions, on one screen.
 *
 * Not two routes: the fallback is the same screen asking for a different code, so a wrong turn
 * costs a click rather than a navigation — and the `next` the operator was heading for rides
 * through every one of them in a hidden field, exactly as the filters carry a selection through
 * on `/businesses`.
 *
 * `preview` is for `/kitchen-sink`: it makes every button inert so the sink can render each
 * state without a form that submits itself somewhere. Nothing else about the rendering changes,
 * because a picture of a disabled form is not a picture of this form.
 */
export function LoginFormView({
  state,
  pending = false,
  next,
  fallbackAvailable = true,
  preview = false,
  action,
}: {
  state: LoginState;
  pending?: boolean;
  next?: string;
  /** False when no Telegram destination is configured — the way out is not offered rather than
   *  offered and then refused. */
  fallbackAvailable?: boolean;
  preview?: boolean;
  action?: (formData: FormData) => void;
}) {
  const fallback = state.mode === "fallback";
  const buttonType = preview ? "button" : "submit";

  return (
    <form action={action} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <p className="text-xs text-text-3">{LOGIN_SUBTITLES[state.mode]}</p>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text-2">
          {fallback ? "Code from Telegram" : "Authenticator code"}
        </span>
        <input
          // `key` so switching mode gives a genuinely new field rather than one carrying the
          // six digits that just failed into a box that wants eight characters.
          key={state.mode}
          name="code"
          className={cn(FIELD, fallback && "tracking-[0.3em] uppercase")}
          autoComplete="one-time-code"
          autoFocus={!preview}
          required
          spellCheck={false}
          {...(fallback
            ? { inputMode: "text" as const, maxLength: 8, placeholder: "8 characters" }
            : {
                inputMode: "numeric" as const,
                maxLength: 6,
                pattern: "\\d{6}",
                placeholder: "6 digits",
              })}
        />
      </label>

      {state.notice ? <LoginNoticeLine notice={state.notice} /> : null}

      {/* Purple, once. The one primary action on the page — identity, never state. */}
      <Button
        type={buttonType}
        name="intent"
        value={fallback ? "submit-fallback" : "submit-code"}
        disabled={pending}
      >
        {pending ? "Checking…" : "Sign in"}
      </Button>

      {/*
        `formNoValidate` on every one of these, and it is not a detail.

        The code field is `required`, which is right for the button that submits a code — and
        fatal for the ones that do not. Without this the browser refuses to submit an empty
        form, so "Lost your authenticator?" silently does nothing for exactly the person it
        exists for: the one who cannot produce a code. Caught in a browser, not in a test; a
        constraint on one control quietly disabling another is not visible from either end.
      */}
      <div className="flex items-center justify-center gap-3 border-t border-hairline pt-3">
        {fallback ? (
          <>
            <Button
              type={buttonType}
              name="intent"
              value="request-fallback"
              formNoValidate
              variant="ghost"
              size="xs"
              disabled={pending}
            >
              Send another code
            </Button>
            <span className="text-text-3">·</span>
            <Button
              type={buttonType}
              name="intent"
              value="use-authenticator"
              formNoValidate
              variant="ghost"
              size="xs"
              disabled={pending}
            >
              Use the authenticator
            </Button>
          </>
        ) : fallbackAvailable ? (
          <Button
            type={buttonType}
            name="intent"
            value="request-fallback"
            formNoValidate
            variant="ghost"
            size="xs"
            disabled={pending}
          >
            Lost your authenticator?
          </Button>
        ) : (
          // Not offered rather than offered and refused: with no destination configured there
          // is nowhere for a code to go, and a button that always fails is worse than no button.
          <p className="text-xs text-text-3">No fallback is configured on this deploy.</p>
        )}
      </div>
    </form>
  );
}
