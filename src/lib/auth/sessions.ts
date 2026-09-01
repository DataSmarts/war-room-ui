/**
 * The two cookies, and what each one is allowed to claim.
 *
 * Both are `token.ts` tokens with different payloads, which is the whole reason the fallback
 * was cheap to build: there is one signature construction to get right, one to test, and the
 * second cookie is a payload schema rather than a second security mechanism.
 *
 * | cookie | says | lives |
 * | -- | -- | -- |
 * | `session` | this browser signed in, at `iat`, until `exp` | 7 days |
 * | `fallback` | a code was sent to Telegram; here is its hash, its expiry and how many wrong answers it has taken | 10 minutes |
 *
 * **The challenge cookie is the fallback's entire state.** The `ui` role holds SELECT and
 * nothing else, and this repo never migrates the database — so there is nowhere to persist a
 * pending code, and the cookie carries the expiry and the attempt count itself.
 *
 * The cookie never carries the code. It carries an HMAC of it under the same secret that signs
 * the token, domain-separated so the two uses of that secret cannot be made to collide.
 *
 * **What the attempt counter is, exactly — because it is easy to credit it with more than it
 * does.** State the client holds is state the client can rewind: an attacker who keeps a copy
 * of the `attempts: 0` cookie and replays it gets a fresh count every time, and no signature
 * can stop that, because the cookie they are replaying is one we really did sign. Raising the
 * count is therefore **advisory** — it stops a person fumbling a code, not someone scripting
 * one. `sessions.test.ts` asserts that replay works, so the limit is never mistaken for a
 * bound it cannot enforce.
 *
 * **The real bound is the code and the clock**, and they are sized for it: 8 characters from a
 * 28-character alphabet is a bit over 38 bits, inside a 10-minute window, reachable only by
 * whoever holds a challenge cookie at all. Guessing it needs something like 10^9 attempts per
 * second sustained against a serverless function to be worth starting. That is the number
 * doing the work here — not the five.
 */

// Full specifier — see the note in `totp.ts`. `sessions.test.ts` runs this under bare node.
import {
  base64UrlEncode,
  constantTimeEqual,
  hmacSha256,
  secretsEqual,
  sign,
  verify,
} from "./token.ts";

const encoder = new TextEncoder();

export const SESSION_COOKIE_NAME = "session";

/**
 * Seven days, not lead-finder's thirty.
 *
 * The donor's session stood behind a password a human had to remember and type; this one
 * stands behind six digits already on the operator's phone, so the cost of asking again is a
 * few seconds. On a public URL rendering real firms' names, addresses and phone numbers, that
 * is the cheaper side of the trade.
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export const CHALLENGE_COOKIE_NAME = "fallback";

/** Long enough for a notification to arrive and be typed; short enough that a challenge left
 *  open on a walked-away-from laptop is not a standing invitation. */
export const CHALLENGE_TTL_SECONDS = 60 * 10;

/**
 * Five wrong answers and the challenge is spent — the operator asks for a new code, which
 * means a new Telegram message they would notice.
 *
 * Advisory, not a bound: see the note at the top of this file. It is the number that turns a
 * mistyped code into "ask for another one" instead of an endless form.
 */
export const CHALLENGE_MAX_ATTEMPTS = 5;

/** Shared by both cookies. `secure` is off outside production only because `next dev` serves
 *  http://localhost, where a secure cookie is never sent back. */
export function cookieOptions(maxAge: number, isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

// ---------------------------------------------------------------------------- session

export interface SessionPayload {
  readonly sub: "admin";
  readonly iat: number;
  readonly exp: number;
}

export type SessionRejection = "malformed" | "bad-signature" | "expired";

export type SessionState =
  | { readonly valid: true; readonly payload: SessionPayload }
  | { readonly valid: false; readonly reason: SessionRejection };

function isFiniteInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

function parseSession(raw: unknown): SessionPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.sub !== "admin") return null;
  if (!isFiniteInt(candidate.iat) || candidate.iat < 0) return null;
  if (!isFiniteInt(candidate.exp) || candidate.exp < 0) return null;
  return { sub: "admin", iat: candidate.iat, exp: candidate.exp };
}

export async function createSession(params: {
  secret: string;
  nowSeconds: number;
  ttlSeconds?: number;
}): Promise<string> {
  const iat = params.nowSeconds;
  return sign(params.secret, {
    sub: "admin",
    iat,
    exp: iat + (params.ttlSeconds ?? SESSION_TTL_SECONDS),
  } satisfies SessionPayload);
}

export async function readSession(params: {
  token: string;
  secret: string;
  nowSeconds: number;
}): Promise<SessionState> {
  const result = await verify({
    token: params.token,
    secret: params.secret,
    parse: parseSession,
  });
  if (!result.valid) return result;
  if (result.payload.exp <= params.nowSeconds) {
    return { valid: false, reason: "expired" };
  }
  return result;
}

// ---------------------------------------------------------------------------- challenge

interface ChallengePayload {
  readonly kind: "fallback";
  readonly hash: string;
  readonly exp: number;
  readonly attempts: number;
}

/** Domain-separated: the secret signs tokens *and* hashes codes, and a construction where one
 *  could be replayed as the other is a bug waiting for someone cleverer than us. */
async function hashCode(secret: string, code: string): Promise<string> {
  return base64UrlEncode(await hmacSha256(encoder.encode(secret), `fallback-code:${code}`));
}

function parseChallenge(raw: unknown): ChallengePayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.kind !== "fallback") return null;
  if (typeof candidate.hash !== "string" || candidate.hash.length === 0) return null;
  if (!isFiniteInt(candidate.exp) || candidate.exp < 0) return null;
  if (!isFiniteInt(candidate.attempts) || candidate.attempts < 0) return null;
  return {
    kind: "fallback",
    hash: candidate.hash,
    exp: candidate.exp,
    attempts: candidate.attempts,
  };
}

export async function createChallenge(params: {
  secret: string;
  code: string;
  nowSeconds: number;
  ttlSeconds?: number;
}): Promise<string> {
  return sign(params.secret, {
    kind: "fallback",
    hash: await hashCode(params.secret, params.code),
    exp: params.nowSeconds + (params.ttlSeconds ?? CHALLENGE_TTL_SECONDS),
    attempts: 0,
  } satisfies ChallengePayload);
}

export type ChallengeRejection =
  | "absent"
  | "malformed"
  | "bad-signature"
  | "expired"
  | "exhausted"
  | "wrong";

/**
 * `token` is the re-signed cookie the caller must write back.
 *
 * Present only when a wrong answer left attempts on the challenge. On `exhausted` and
 * `expired` it is absent, and the caller clears the cookie instead — a spent challenge is
 * deleted rather than kept around counting.
 */
export type ChallengeAnswer =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: ChallengeRejection;
      readonly token?: string;
      readonly attemptsLeft?: number;
    };

/**
 * Answer a challenge, and say what the cookie should become.
 *
 * Expiry is checked before the code is compared, so a stale challenge costs no crypto and
 * gives a wrong answer nothing to learn from. The comparison itself is `secretsEqual` over the
 * two hashes rather than a `===`, for the same reason the TOTP path uses it.
 */
export async function answerChallenge(params: {
  token: string | undefined;
  secret: string;
  code: string;
  nowSeconds: number;
}): Promise<ChallengeAnswer> {
  if (!params.token) return { ok: false, reason: "absent" };

  const result = await verify({
    token: params.token,
    secret: params.secret,
    parse: parseChallenge,
  });
  if (!result.valid) return { ok: false, reason: result.reason };

  const challenge = result.payload;
  if (challenge.exp <= params.nowSeconds) return { ok: false, reason: "expired" };
  if (challenge.attempts >= CHALLENGE_MAX_ATTEMPTS) return { ok: false, reason: "exhausted" };

  const submitted = await hashCode(params.secret, params.code);
  if (await secretsEqual(submitted, challenge.hash)) {
    return { ok: true };
  }

  const attempts = challenge.attempts + 1;
  if (attempts >= CHALLENGE_MAX_ATTEMPTS) {
    return { ok: false, reason: "exhausted" };
  }

  return {
    ok: false,
    reason: "wrong",
    token: await sign(params.secret, { ...challenge, attempts } satisfies ChallengePayload),
    attemptsLeft: CHALLENGE_MAX_ATTEMPTS - attempts,
  };
}

/** Re-exported so `sessions.test.ts` can prove a re-signed challenge is still a valid token
 *  rather than reaching into `token.ts` for it. */
export { constantTimeEqual };
