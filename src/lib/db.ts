import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { connection } from "next/server";

/**
 * The connection, and the one contract every read goes through.
 *
 * The role behind this URL holds SELECT and nothing else. That is the design, not a convention —
 * do not work around it.
 *
 * `import "server-only"` is the second half of the same idea: this module reads `DATABASE_URL` at
 * module scope, and a client component that imported it would be a build error rather than a
 * discovery. Next ships the type declaration, so nothing needs installing.
 */
const url = process.env.DATABASE_URL;

/**
 * Deliberately not exported. Every caller goes through `read()`, which is what makes the four
 * rules below structural instead of something each query module has to remember.
 */
const sql = url ? neon(url) : null;

export type Sql = NeonQueryFunction<false, false>;

/**
 * A read that either answered or did not — and never a third thing that looks like both.
 *
 * `{ ok: false }` is *unknown*: we could not ask, or asking failed. An empty `value` is a real
 * answer meaning nothing is there. Collapsing the two is the same lie as rendering a business
 * nobody ever checked as having no contacts, so the type refuses to let a caller do it.
 *
 * Loading is neither of these. That is what the page is doing, and it lives in a `<Suspense>`
 * fallback — a skeleton means *still asking*, the hollow ring means *asked, and could not find
 * out*.
 */
export type Read<T> = { ok: true; value: T } | { ok: false };

/**
 * Run one read, and degrade rather than blocking or throwing.
 *
 * Four rules, in order, each of which the repo has a reason for:
 *
 * 1. `connection()` first. Without it the query runs during the prerender and the answer is
 *    frozen into the bundle — a page baked at build time reports the moment it was built,
 *    forever. Invisible under `next dev`, where every page is rendered on demand; visible only in
 *    production, which is the worst place to find out. Cache Components is off, so this is the
 *    marker rather than `io()`.
 * 2. No URL is not a crash. It degrades to unknown and takes nothing else down with it.
 * 3. A failure is caught, never thrown. A read degrades; it never blocks a page.
 * 4. **The error's name and nothing more.** A connection failure's message can echo the URL that
 *    produced it, and a query failure's can carry a provider body out of `runs.error`. Secrets and
 *    PII never reach a log — so the log gets `NeonDbError`, and the operator gets the chip.
 *
 * `label` is ours, never the database's: it names the call site so a log line is traceable
 * without quoting anything the database said.
 */
export async function read<T>(
  label: string,
  run: (sql: Sql) => Promise<T>,
): Promise<Read<T>> {
  await connection();

  if (!sql) return { ok: false };

  try {
    return { ok: true, value: await run(sql) };
  } catch (err) {
    console.error(
      `[${label}] read failed:`,
      err instanceof Error ? err.name : "non-error thrown",
    );
    return { ok: false };
  }
}
