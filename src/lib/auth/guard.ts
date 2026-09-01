import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { readSession, SESSION_COOKIE_NAME } from "./sessions";
import { sessionSecret } from "./secrets";

/**
 * The second gate, and the one that actually protects the data.
 *
 * `proxy.ts` is an *optimistic* check — Next's own authentication guide uses that word and says
 * plainly that proxy "should not be your only line of defense", because the majority of
 * security checks belong as close as possible to the data source. This is that check: it runs
 * inside `src/app/(shell)/layout.tsx`, in the render path of every view that reads the database,
 * where a matcher pattern cannot be the thing standing between a stranger and 712 firms' names,
 * addresses and phone numbers.
 *
 * One file, and it closes the gap the documentation names.
 *
 * **`redirect()`, not `notFound()`.** A missing session is not a missing page — the route is
 * real, the reader is not signed in, and sending them to the login with nothing to say is the
 * honest answer. This is the same "what is this page about" question `/sweeps/[id]` answers
 * differently: there the id *is* the subject, so a bad one is a 404.
 *
 * Fails closed. No secret means nothing can be verified, so nothing is served.
 */
export async function requireSession(): Promise<void> {
  const secret = sessionSecret();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (secret && token) {
    const session = await readSession({
      token,
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    if (session.valid) return;
  }

  redirect("/login");
}
