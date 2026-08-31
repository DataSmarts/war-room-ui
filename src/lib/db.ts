import { neon } from "@neondatabase/serverless";

/**
 * The connection, and deliberately nothing else.
 *
 * The read layer proper — the typed read-model, the lying column names aliased at the
 * boundary, the `::int` casts the views' bigints need, the push-time schema check — is its
 * own slice. This file exists only so the shell's chips can be true rather than decorative.
 *
 * Null rather than a throw when DATABASE_URL is absent: a missing URL degrades the chips to
 * "unknown" and takes nothing else down with it. A read degrades; it never blocks a page.
 *
 * The role behind this URL holds SELECT and nothing else. That is the design, not a
 * convention — do not work around it.
 */
const url = process.env.DATABASE_URL;

export const sql = url ? neon(url) : null;
