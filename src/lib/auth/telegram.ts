import "server-only";

/**
 * The fallback's delivery channel — one `sendMessage` call, degrading to unknown.
 *
 * Telegram rather than email because it is the only channel this system already has: the bot
 * token and the chat id are in the environment, they already carry operational notifications,
 * and the alternative was a new provider, a new secret and a verified sending domain for a
 * message that goes to exactly one person.
 *
 * **Two rules from elsewhere in the repo apply here without modification.**
 *
 * `src/lib/db.ts` rule 4 — *the error's name and nothing more*. It is not a style preference
 * here: the bot token sits in the request path, so a fetch failure's message can carry the
 * credential straight into a log line, and Telegram's own error bodies quote the request. The
 * name is `TypeError` or `TimeoutError`, and that is all any log gets.
 *
 * And the provider rule — a card that could not reach its provider renders *unknown*, with no
 * colour, and never blocks the page. A delivery that failed is absent knowledge: we do not
 * know that the message did not arrive, only that we were not told it did.
 */

/** Long enough for a slow API, short enough that the operator is not left watching a spinner
 *  wonder whether to press it again. */
const TIMEOUT_MS = 8_000;

export type Delivery =
  | { readonly sent: true }
  /** Never a reason string. Whatever went wrong is between us and the log — the screen says
   *  "could not send", because that is the whole of what the operator can act on. */
  | { readonly sent: false };

function minutes(seconds: number): string {
  const value = Math.round(seconds / 60);
  return `${value} minute${value === 1 ? "" : "s"}`;
}

export function codeMessage(code: string, ttlSeconds: number): string {
  return [
    "WAR ROOM sign-in code",
    "",
    code,
    "",
    `Valid for ${minutes(ttlSeconds)}. If you did not ask for this, someone has your sign-in page open.`,
  ].join("\n");
}

export async function sendCode(params: {
  botToken: string;
  chatId: string;
  code: string;
  ttlSeconds: number;
}): Promise<Delivery> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${params.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: params.chatId,
          text: codeMessage(params.code, params.ttlSeconds),
          // The code is not prose. Left unformatted so Telegram cannot decide that part of it
          // is markup and render it away.
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      },
    );

    // Telegram answers 200 with `{ ok: false }` for a wrong chat id, so the status alone is not
    // the answer. The body is read for that one boolean and never for its description, which
    // quotes the request back.
    if (!response.ok) {
      console.error("[auth/telegram] send failed: HTTP", response.status);
      return { sent: false };
    }

    const body: unknown = await response.json();
    const acknowledged =
      typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === true;

    if (!acknowledged) {
      console.error("[auth/telegram] send failed: not acknowledged");
      return { sent: false };
    }

    return { sent: true };
  } catch (err) {
    console.error(
      "[auth/telegram] send failed:",
      err instanceof Error ? err.name : "non-error thrown",
    );
    return { sent: false };
  }
}
