/**
 * The signed token — one construction, two cookies.
 *
 * `payload.signature`, both base64url, HMAC-SHA256 over the payload segment. Lifted from
 * lead-finder's `src/lib/services/auth.ts` with its zod schema replaced by a hand-written
 * parse: this repo validates by hand everywhere else (`derive.ts`, `shell-status.ts`), and one
 * dependency for one object shape is not a trade worth making.
 *
 * Two properties live here rather than in the callers, and both are load-bearing:
 *
 * 1. **Nothing in this module reads `process.env`.** Every secret arrives as a parameter, so
 *    `node --test` verifies the crypto with no server, no bundler and no environment — the same
 *    reason `derive.ts` takes rows instead of fetching them. `proxy.ts` and the server action
 *    are the only two places that read a secret out of the environment.
 * 2. **Web Crypto only, never `node:crypto`.** This has to compile for whatever runtime Next
 *    hands `proxy.ts`, and it keeps `src/lib/db.ts` — which is `server-only` — out of the
 *    import graph entirely.
 *
 * What is *not* here: expiry. Integrity is one question and freshness is another, and
 * `sessions.ts` needs to tell an expired challenge apart from one that ran out of attempts.
 * This module answers "did we sign this, unmodified" and stops.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `null` rather than a throw: every caller here is handling attacker-controlled input, and a
 *  rejected token is an ordinary answer rather than an exceptional one. */
export function base64UrlDecode(text: string): Uint8Array | null {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** No early exit, and a length mismatch answers before the loop — the lengths compared here are
 *  digest lengths, which are public. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hmacSha256(
  keyBytes: Uint8Array<ArrayBuffer>,
  message: string,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/**
 * Compare two secrets without leaking their contents *or* their lengths through timing.
 *
 * Double-HMAC under a key generated fresh for this call: the digests are equal-length whatever
 * the inputs were, so `constantTimeEqual` never takes its early return, and an attacker cannot
 * precompute against a key they have not seen. Web Crypto has no timing-safe primitive — this
 * is lead-finder's `verifyCredentials` trick, kept because the reasoning behind it is the same
 * here even though the thing being compared is now a code rather than a password.
 */
export async function secretsEqual(submitted: string, expected: string): Promise<boolean> {
  const ephemeralKey = crypto.getRandomValues(new Uint8Array(32));
  const [a, b] = await Promise.all([
    hmacSha256(ephemeralKey, submitted),
    hmacSha256(ephemeralKey, expected),
  ]);
  return constantTimeEqual(a, b);
}

export async function sign(secret: string, payload: object): Promise<string> {
  const payloadSegment = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacSha256(encoder.encode(secret), payloadSegment);
  return `${payloadSegment}.${base64UrlEncode(signature)}`;
}

export type TokenFailure = "malformed" | "bad-signature";

export type TokenVerification<T> =
  | { readonly valid: true; readonly payload: T }
  | { readonly valid: false; readonly reason: TokenFailure };

/**
 * Verify, then parse — never the other way round.
 *
 * The signature is checked against the raw payload *segment*, before a byte of it is handed to
 * `JSON.parse`. Parsing first would mean running attacker-controlled input through the parser
 * and the caller's validator to decide whether it was worth authenticating, which is exactly
 * the surface a signature exists to close. Same shape of rule as `readScar` redacting before it
 * truncates: the operations commute in the happy case and not in the one that matters.
 *
 * `parse` returns `null` for a payload this build does not recognise — a shape from an older
 * cookie, or a valid signature over something unexpected — and that lands as `malformed`
 * rather than being trusted for having been signed.
 */
export async function verify<T>(params: {
  token: string;
  secret: string;
  parse: (raw: unknown) => T | null;
}): Promise<TokenVerification<T>> {
  const parts = params.token.split(".");
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return { valid: false, reason: "malformed" };
  }
  const [payloadSegment, signatureSegment] = parts;

  const provided = base64UrlDecode(signatureSegment);
  if (!provided) return { valid: false, reason: "malformed" };

  const expected = await hmacSha256(encoder.encode(params.secret), payloadSegment);
  if (!constantTimeEqual(provided, expected)) {
    return { valid: false, reason: "bad-signature" };
  }

  const payloadBytes = base64UrlDecode(payloadSegment);
  if (!payloadBytes) return { valid: false, reason: "malformed" };

  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(payloadBytes));
  } catch {
    return { valid: false, reason: "malformed" };
  }

  const payload = params.parse(raw);
  if (payload === null) return { valid: false, reason: "malformed" };

  return { valid: true, payload };
}

/**
 * The fallback code's alphabet: base32 without `I`, `L`, `O` or `U`.
 *
 * `I`/`L`/`O` because the operator reads this off a phone and types it into a browser, and a
 * code that can be mistyped by someone who read it correctly wastes one of five attempts. `U`
 * because dropping it is what keeps the accidental English out of an 8-character string.
 *
 * 28 characters, so 8 of them carry just over 38 bits — and the code is only reachable by
 * whoever holds the challenge cookie, which is where the real narrowing happens.
 */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".replace(/[ILOU]/g, "");

export const FALLBACK_CODE_LENGTH = 8;

/**
 * Rejection sampling, not modulo.
 *
 * `byte % 28` would make the first four characters of the alphabet meaningfully likelier than
 * the rest — a real bias, discarded here for the cost of a few extra random bytes.
 */
export function randomCode(length: number = FALLBACK_CODE_LENGTH): string {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = "";
  while (code.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte >= limit) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === length) break;
    }
  }
  return code;
}

/** What the operator typed, made comparable: case and the spaces they may have typed around it
 *  are not part of the secret. Never applied to a TOTP code, which is digits or nothing. */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}
