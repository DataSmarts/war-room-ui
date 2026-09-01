/**
 * What the login screen is allowed to say — the vocabulary, decided once.
 *
 * Same split the rest of the repo keeps: the words live here, and the pairing with a severity
 * lives in exactly one component (`src/components/auth/login-form.tsx`), keyed on this type so
 * adding a word without a rendering stops compiling. `derive.ts` and `status-pill.tsx` are the
 * pattern being followed.
 *
 * Pure — no `server-only`, no environment, no React. The server action decides which of these
 * happened; the form decides how each one looks; `/kitchen-sink` renders all of them without
 * needing a wrong code, an expired challenge or a broken bot token to produce one.
 *
 * **Three of these carry no colour, and it is the same reason every time.** `unconfigured` and
 * `delivery-unknown` are absent knowledge — the server was never given a secret, or was never
 * told the message arrived — and a colour would be a claim we cannot back. A wrong code is a
 * real negative answer and gets `fail`; a spent or lapsed challenge is recoverable and gets
 * `warn`. The distinction is the same one `stalled` turns on.
 */

export const LOGIN_NOTICE_VALUES = [
  "wrong-code",
  "malformed-code",
  "unconfigured",
  "code-sent",
  "delivery-unknown",
  "no-challenge",
  "challenge-expired",
  "challenge-spent",
  "fallback-unavailable",
] as const;

export type LoginNotice = (typeof LOGIN_NOTICE_VALUES)[number];

/**
 * Which field the form is asking for.
 *
 * Not two pages: the fallback is the same screen with a different question, so a wrong turn
 * costs a click rather than a navigation and the operator never loses the `next` they were
 * heading for.
 */
export const LOGIN_MODE_VALUES = ["authenticator", "fallback"] as const;

export type LoginMode = (typeof LOGIN_MODE_VALUES)[number];

/**
 * What the action hands back to the form.
 *
 * Deliberately not the attempt count. The challenge does allow five tries and the honest
 * operator really does get five — but the number is advisory (see `sessions.ts`), and putting
 * it on screen invites reading it as a rate limit, which it is not. "That code is wrong" is the
 * whole of what the person typing can act on.
 */
export interface LoginState {
  readonly mode: LoginMode;
  readonly notice: LoginNotice | null;
}

export const LOGIN_IDLE: LoginState = { mode: "authenticator", notice: null };
