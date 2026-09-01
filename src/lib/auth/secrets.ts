/**
 * The only module in `src/lib/auth/` that reads the environment — and the place the whole thing
 * fails closed.
 *
 * `token.ts`, `totp.ts` and `sessions.ts` take every secret as a parameter, which is what lets
 * `node --test` verify the crypto with no environment at all. That purity has to end somewhere,
 * and it ends here, in three functions with one rule between them.
 *
 * **The rule: a missing secret is never an empty string.** `sign("")` is a perfectly good
 * signature under a key everybody knows, so an unset `SESSION_SECRET` that fell through as
 * `undefined` would not break the login — it would quietly turn it into a doorway, on a public
 * URL, and every test would still pass. That is the failure mode this module exists to make
 * impossible: absent reads as `null`, `null` denies, and the deny is loud in the log.
 *
 * The three answers are separate on purpose, because they fail differently:
 *
 * - no `SESSION_SECRET` → nothing can be signed or trusted; every route denies.
 * - no `ADMIN_TOTP_SECRET` → sessions still verify, but nobody can sign in; the form says so.
 * - no Telegram pair → sign-in works, the fallback does not; the link is not offered.
 */

/**
 * `openssl rand -base64 32` gives 44 characters. The floor is well under that and exists to
 * catch a placeholder — `""`, `"changeme"`, a truncated paste — rather than to grade entropy,
 * which a length cannot do anyway.
 */
const MIN_SESSION_SECRET_LENGTH = 32;

function present(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The key both cookies are signed with. `null` means every gate in the app must deny — see
 * `proxy.ts` and `requireSession`.
 */
export function sessionSecret(): string | null {
  const value = present(process.env.SESSION_SECRET);
  if (!value) {
    console.error("[auth] SESSION_SECRET is not set — every route denies");
    return null;
  }
  if (value.length < MIN_SESSION_SECRET_LENGTH) {
    // Never log the value, obviously; the length is not the secret and is what makes this
    // actionable.
    console.error(
      `[auth] SESSION_SECRET is ${value.length} characters, under the ${MIN_SESSION_SECRET_LENGTH} required — every route denies`,
    );
    return null;
  }
  return value;
}

/** The base32 secret shared with the authenticator app. `scripts/totp-enrol.mts` mints it. */
export function totpSecret(): string | null {
  return present(process.env.ADMIN_TOTP_SECRET);
}

export interface TelegramTarget {
  readonly botToken: string;
  readonly chatId: string;
}

/**
 * Both halves or neither. A bot token with no chat id cannot deliver anything, and offering a
 * fallback that silently goes nowhere is worse than not offering one — the operator would sit
 * waiting for a message that was never addressed.
 */
export function telegramTarget(): TelegramTarget | null {
  const botToken = present(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = present(process.env.TELEGRAM_CHAT_ID);
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
