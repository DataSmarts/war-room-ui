"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  answerChallenge,
  CHALLENGE_COOKIE_NAME,
  CHALLENGE_TTL_SECONDS,
  cookieOptions,
  createChallenge,
  createSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/sessions";
import { LOGIN_IDLE, type LoginState } from "@/lib/auth/notices";
import { isProduction, sessionSecret, telegramTarget, totpSecret } from "@/lib/auth/secrets";
import { sendCode } from "@/lib/auth/telegram";
import { normaliseCode, randomCode } from "@/lib/auth/token";
import { verifyTotp } from "@/lib/auth/totp";

/**
 * Everything the login screen can do — through one action, dispatching on `intent`.
 *
 * One action rather than three because `useActionState` binds exactly one, and three would mean
 * three independent states on a screen that has one. The buttons carry
 * `name="intent"`, so which one was pressed arrives in the same `FormData` as the code, and the
 * whole screen is a single state machine with a single pending flag.
 *
 * A `"use server"` module may only export async functions, so the state shape lives in
 * `@/lib/auth/notices` — which is also what lets `/kitchen-sink` render every outcome without
 * importing a server action.
 *
 * Nothing here is reachable on GET. These are actions, invoked by POST, and the only state any
 * of them mutates is a cookie on the caller's own browser.
 */

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Same-origin paths only.
 *
 * Lifted verbatim from lead-finder, regex included: `^\/(?![/\\])` admits `/sweeps` and refuses
 * `//evil.example` and `/\evil.example`, both of which browsers read as protocol-relative URLs.
 * Without it the `next` parameter turns this into an open redirect — a link showing a genuine
 * War Room login that lands somewhere else once it succeeds.
 */
function resolveNext(raw: FormDataEntryValue | null): string {
  if (typeof raw === "string" && /^\/(?![/\\])/.test(raw)) {
    return raw;
  }
  return "/sweeps";
}

/** The one place a session is ever created, shared by both ways in. */
async function grantSession(secret: string, formData: FormData): Promise<never> {
  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    await createSession({ secret, nowSeconds: nowSeconds() }),
    cookieOptions(SESSION_TTL_SECONDS, isProduction()),
  );
  // The challenge has done its job, or was never used. Either way it does not outlive the
  // sign-in it was issued for.
  store.delete(CHALLENGE_COOKIE_NAME);
  redirect(resolveNext(formData.get("next")));
}

async function submitAuthenticator(secret: string, formData: FormData): Promise<LoginState> {
  const totp = totpSecret();
  if (!totp) return { mode: "authenticator", notice: "unconfigured" };

  const result = await verifyTotp({
    secret: totp,
    code: String(formData.get("code") ?? ""),
    nowSeconds: nowSeconds(),
  });

  if (result.ok) return grantSession(secret, formData);

  switch (result.reason) {
    case "unconfigured":
      // The secret is set but unreadable — not base32, or empty once decoded. Not the
      // operator's mistake, and telling them their correct code is wrong would be a lie.
      return { mode: "authenticator", notice: "unconfigured" };
    case "malformed":
      return { mode: "authenticator", notice: "malformed-code" };
    default:
      return { mode: "authenticator", notice: "wrong-code" };
  }
}

async function submitFallback(secret: string, formData: FormData): Promise<LoginState> {
  const store = await cookies();
  const answer = await answerChallenge({
    token: store.get(CHALLENGE_COOKIE_NAME)?.value,
    secret,
    code: normaliseCode(String(formData.get("code") ?? "")),
    nowSeconds: nowSeconds(),
  });

  if (answer.ok) return grantSession(secret, formData);

  // A challenge with tries left is written back; a spent or lapsed one is deleted rather than
  // left on the browser counting, because the way forward is a new code and a stale cookie only
  // makes the next attempt fail differently.
  if (answer.token) {
    store.set(
      CHALLENGE_COOKIE_NAME,
      answer.token,
      cookieOptions(CHALLENGE_TTL_SECONDS, isProduction()),
    );
  } else {
    store.delete(CHALLENGE_COOKIE_NAME);
  }

  switch (answer.reason) {
    case "expired":
      return { mode: "fallback", notice: "challenge-expired" };
    case "exhausted":
      return { mode: "fallback", notice: "challenge-spent" };
    case "absent":
    case "malformed":
    case "bad-signature":
      // All three mean one thing to the person in front of it: this browser is not holding a
      // challenge we issued. Which of the three it was is our problem, not theirs.
      return { mode: "fallback", notice: "no-challenge" };
    default:
      return { mode: "fallback", notice: "wrong-code" };
  }
}

/**
 * Mint a code, hash it into the challenge cookie, and send the plaintext to Telegram — once.
 *
 * The code is never returned to the browser, never logged and never stored: what the cookie
 * carries is an HMAC of it.
 */
async function requestFallback(secret: string): Promise<LoginState> {
  const target = telegramTarget();
  if (!target) return { mode: "authenticator", notice: "fallback-unavailable" };

  const code = randomCode();
  const delivery = await sendCode({
    botToken: target.botToken,
    chatId: target.chatId,
    code,
    ttlSeconds: CHALLENGE_TTL_SECONDS,
  });

  // The challenge is set either way, deliberately. Telegram answering "no" is not proof the
  // message did not arrive — only that we were not told it did — and a code that turns up on
  // the phone should still work. The screen says so with no colour, and the field is there to
  // type into.
  const store = await cookies();
  store.set(
    CHALLENGE_COOKIE_NAME,
    await createChallenge({ secret, code, nowSeconds: nowSeconds() }),
    cookieOptions(CHALLENGE_TTL_SECONDS, isProduction()),
  );

  return { mode: "fallback", notice: delivery.sent ? "code-sent" : "delivery-unknown" };
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const secret = sessionSecret();
  // Fails closed, and says the same thing to the operator as an unreadable TOTP secret: the
  // server cannot answer. `sessionSecret()` has already said why in the log.
  if (!secret) return { mode: "authenticator", notice: "unconfigured" };

  switch (formData.get("intent")) {
    case "request-fallback":
      return requestFallback(secret);
    case "use-authenticator":
      return LOGIN_IDLE;
    case "submit-fallback":
      return submitFallback(secret, formData);
    default:
      return submitAuthenticator(secret, formData);
  }
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  store.delete(CHALLENGE_COOKIE_NAME);
  redirect("/login");
}
