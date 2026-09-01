import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { readSession, SESSION_COOKIE_NAME } from "@/lib/auth/sessions";
import { sessionSecret } from "@/lib/auth/secrets";

/**
 * The front door.
 *
 * `proxy.ts`, not `middleware.ts`: Next 16 renamed it, and the rename is the whole of the
 * change — see `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
 *
 * **This is an optimistic check, and Next's own documentation insists on the word.** It reads
 * the cookie and nothing else — no database, because it runs on every route including
 * prefetches — so it is a redirect, not an authorisation. The check that actually protects the
 * data is `requireSession()` in `src/app/(shell)/layout.tsx`, close to the reads, where the
 * guide says security checks belong. Two gates, and the one here exists so an unsigned visitor
 * gets a login page instead of a rendered shell.
 *
 * Everything is behind it, `/kitchen-sink` included. The sink renders the states of views that
 * show real firms' names and addresses, and "it is only a development surface" is not a reason
 * to leave a door open on a public deploy.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  const secret = sessionSecret();
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // Fails closed, and the order says so: with no secret there is nothing to verify against, so
  // the answer is the redirect rather than an unchecked `next()`. `sessionSecret()` has already
  // said why in the log.
  if (secret && token) {
    const session = await readSession({
      token,
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    if (session.valid) return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);

  // Where they were going, so signing in lands there instead of on the front page. Only the
  // path — `resolveNext` in the action is what decides whether it is safe to follow, because
  // this value has been round-tripped through the browser by then.
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname + search);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  /**
   * Everything except the login itself and the assets the login page is made of.
   *
   * No `api` exemption: this repo has no API routes, and adding the pattern pre-emptively would
   * carve out a hole for the first one somebody adds. lead-finder's matcher exempted its
   * Telegram webhook because it had one; there is nothing here to exempt.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login).*)"],
};
