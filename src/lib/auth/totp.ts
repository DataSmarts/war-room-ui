/**
 * TOTP — RFC 6238, hand-rolled on Web Crypto.
 *
 * Hand-rolled for the same reason the token is: it is sixty lines of well-specified arithmetic,
 * it has published test vectors that pin every one of them, and pulling a package in would put
 * a dependency between this repo and the one thing standing in front of real firms' names and
 * addresses. `totp.test.ts` runs the RFC's own Appendix B vectors, so this is checked against
 * the specification rather than against itself.
 *
 * **HMAC-SHA1, deliberately, and it is not a weakness here.** Every authenticator app speaks
 * SHA-1 and most speak nothing else; HMAC-SHA1 has no practical break, and the collision
 * attacks that retired bare SHA-1 do not apply to it. Changing this would produce codes no
 * phone can generate.
 *
 * Pure, like `token.ts`: the secret is a parameter, `nowSeconds` is a parameter, and the tests
 * need no clock and no environment.
 */

// Full specifier, like `sql.ts` importing `./derive.ts`: this module is in bare node's import
// graph (`totp.test.ts`, `scripts/totp-enrol.mts`), and Node's ESM resolver will not guess an
// extension. Application code Next alone loads stays extensionless.
import { constantTimeEqual, secretsEqual } from "./token.ts";

export const TOTP_DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;

/**
 * One step either side of now — the RFC's own recommendation, and the smallest window that
 * survives a phone whose clock has drifted a few seconds and an operator who started typing at
 * 29.5 seconds past. Widening it multiplies the codes valid at any instant; it is not free.
 */
export const TOTP_SKEW_STEPS = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * RFC 4648 base32, the encoding every authenticator's QR code carries.
 *
 * Padding and the spaces enrolment UIs like to group the secret with are ignored; anything
 * else is `null` rather than silently skipped, because a secret that decodes to *something*
 * after dropping the characters it did not understand is a secret that will disagree with the
 * phone and give no clue why.
 */
export function decodeBase32(secret: string): Uint8Array<ArrayBuffer> | null {
  const cleaned = secret.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (cleaned.length === 0) return null;

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = value * 32 + index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push(Math.floor(value / 2 ** bits) & 0xff);
      value %= 2 ** bits;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * The other direction, for enrolment.
 *
 * Here rather than in the script so the encoder and the decoder are tested against each other —
 * a secret that cannot be read back by the code that verifies with it is a secret that enrols
 * cleanly and never works. No padding: authenticators do not want it, and `decodeBase32` strips
 * it anyway.
 */
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = value * 256 + byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[Math.floor(value / 2 ** bits) % 32];
      value %= 2 ** bits;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value * 2 ** (5 - bits)) % 32];
  }
  return out;
}

/** 20 bytes — the length RFC 4226 specifies for the shared secret, and what every authenticator
 *  expects from a SHA-1 TOTP enrolment. */
export const TOTP_SECRET_BYTES = 20;

export function generateSecret(): string {
  return encodeBase32(crypto.getRandomValues(new Uint8Array(TOTP_SECRET_BYTES)));
}

/** The counter as 8 bytes, big-endian. Built with arithmetic rather than bitwise ops or a
 *  BigInt: `&` coerces to int32 and would truncate, and a BigInt literal is not available at
 *  this compile target. */
function counterBytes(counter: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8);
  let value = Math.floor(counter);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = value % 256;
    value = Math.floor(value / 256);
  }
  return bytes;
}

async function hmacSha1(
  keyBytes: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
}

/**
 * HOTP (RFC 4226 §5.3) — the dynamic truncation every TOTP is built on.
 *
 * The low nibble of the last byte picks where in the digest to read from, and the top bit of
 * that 4-byte window is masked off so the result is positive on platforms that read it as a
 * signed integer. Both are the specification, not defensive coding.
 */
export async function hotpCode(
  key: Uint8Array<ArrayBuffer>,
  counter: number,
  digits: number = TOTP_DIGITS,
): Promise<string> {
  const digest = await hmacSha1(key, counterBytes(counter));
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    (digest[offset] & 0x7f) * 2 ** 24 +
    digest[offset + 1] * 2 ** 16 +
    digest[offset + 2] * 2 ** 8 +
    digest[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totpCounter(atSeconds: number, stepSeconds: number = TOTP_STEP_SECONDS): number {
  return Math.floor(atSeconds / stepSeconds);
}

/** The code a correctly-configured authenticator is showing at `atSeconds`. Exported for the
 *  tests and the enrolment script — never called to compare against a submission, which is
 *  `verifyTotp`'s job precisely because the comparison has to be constant-time. */
export async function totpCode(params: {
  key: Uint8Array<ArrayBuffer>;
  atSeconds: number;
  stepSeconds?: number;
  digits?: number;
}): Promise<string> {
  return hotpCode(
    params.key,
    totpCounter(params.atSeconds, params.stepSeconds ?? TOTP_STEP_SECONDS),
    params.digits ?? TOTP_DIGITS,
  );
}

export type TotpRejection = "unconfigured" | "malformed" | "wrong";

export type TotpResult = { readonly ok: true } | { readonly ok: false; readonly reason: TotpRejection };

/**
 * Verify a submitted code against every step in the skew window.
 *
 * **Every candidate is compared, with no early exit.** Returning the moment one matches would
 * make the response time say *which* window matched — a small leak, but the cheap fix is to
 * accumulate and it costs two extra HMACs on a page nobody hits in a loop.
 *
 * `unconfigured` is not a rejection of the operator: it means `ADMIN_TOTP_SECRET` is absent or
 * unreadable, and the caller must render it as such rather than as a wrong code. Telling
 * someone their correct code is wrong, when the truth is that the server was never set up, is
 * the same collapse this repo refuses everywhere else — absent knowledge is not a negative
 * answer.
 */
export async function verifyTotp(params: {
  secret: string;
  code: string;
  nowSeconds: number;
  skewSteps?: number;
  stepSeconds?: number;
  digits?: number;
}): Promise<TotpResult> {
  const digits = params.digits ?? TOTP_DIGITS;
  const stepSeconds = params.stepSeconds ?? TOTP_STEP_SECONDS;
  const skew = params.skewSteps ?? TOTP_SKEW_STEPS;

  const key = decodeBase32(params.secret);
  if (!key || key.length === 0) return { ok: false, reason: "unconfigured" };

  // Shape only, and the shape is public: a submission that is not `digits` digits cannot be a
  // code, and rejecting it here spends no crypto and leaks nothing a form's own `pattern`
  // attribute does not already say.
  const submitted = params.code.trim();
  if (!new RegExp(`^\\d{${digits}}$`).test(submitted)) {
    return { ok: false, reason: "malformed" };
  }

  const counter = totpCounter(params.nowSeconds, stepSeconds);
  const candidates = await Promise.all(
    Array.from({ length: skew * 2 + 1 }, (_, i) =>
      hotpCode(key, counter - skew + i, digits),
    ),
  );

  let matched = false;
  for (const candidate of candidates) {
    matched = (await secretsEqual(submitted, candidate)) || matched;
  }

  return matched ? { ok: true } : { ok: false, reason: "wrong" };
}

/**
 * The `otpauth://` URI an authenticator's QR code encodes.
 *
 * Here rather than in `scripts/totp-enrol.mts` so the enrolment string is built by the same
 * module that verifies what the phone produces from it — a label or digit count that drifts
 * between the two is a secret that enrols cleanly and never works.
 */
export function otpauthUri(params: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.account)}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** Re-exported so the enrolment script can prove a freshly generated secret round-trips before
 *  the operator is asked to scan it. */
export { constantTimeEqual };
