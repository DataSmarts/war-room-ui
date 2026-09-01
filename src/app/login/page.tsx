import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/shell/top-bar";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/auth/sessions";
import { sessionSecret, telegramTarget } from "@/lib/auth/secrets";

import { LoginPanel } from "./login-panel";

export const metadata: Metadata = {
  title: "Sign in · War Room",
};

/**
 * The one page outside the shell.
 *
 * A sibling of `(shell)` rather than a child, which is the reason that route group exists —
 * `(shell)/layout.tsx` says so in its own comment. No top bar, no freshness chips, and no
 * database read: this page has nothing to tell an operator who has not signed in yet, and a
 * login screen that queries Neon is a login screen that can be made to fail by the database.
 *
 * It is also the one route the proxy's matcher exempts, so everything here has to hold on its
 * own.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Already signed in and looking at the login: send them on. Cheap, and it turns a confusing
  // dead end — a form that works and appears to do nothing — into a navigation.
  const secret = sessionSecret();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (secret && token) {
    const session = await readSession({
      token,
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    if (session.valid) redirect("/sweeps");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="w-full max-w-xs space-y-5">
        {/* No subtitle here: what to type depends on which question the form is asking, and
            this header is rendered once and never hears about the switch. It lives in
            `LoginFormView`, beside the field it describes. */}
        <header className="space-y-2">
          <Wordmark />
          <h1 className="text-sm font-medium text-text-1">Sign in</h1>
        </header>

        <LoginPanel next={next} fallbackAvailable={telegramTarget() !== null} />
      </section>
    </main>
  );
}
