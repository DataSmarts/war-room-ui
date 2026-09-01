/**
 * Mint an authenticator secret, or show the one already configured.
 *
 *     node scripts/totp-enrol.mts           # mint a new secret, print it to paste into .env.local
 *     node scripts/totp-enrol.mts --show    # print the otpauth:// URI for the configured secret
 *
 * Both modes print the code the secret is producing right now, so the phone can be checked
 * against the server before anyone relies on it.
 *
 * `--show` is the one that matters after setup: the secret is already in `.env.local`, and this
 * is how it gets onto a replacement phone without minting a new one and invalidating the old.
 *
 * **It writes no file, and that is not incidental.** This repo is public. A script that helpfully
 * dropped the secret into `.env.local` would be one `git add -A` away from publishing the single
 * factor guarding 712 firms' names, addresses and phone numbers. `.env.local` is edited
 * deliberately, and `./encrypt-env.sh` is what puts it beyond git's reach.
 *
 * Nothing here is imported by the app — it is the one caller of `generateSecret`.
 */

import env from "@next/env";

import {
  decodeBase32,
  generateSecret,
  otpauthUri,
  TOTP_STEP_SECONDS,
  totpCode,
} from "../src/lib/auth/totp.ts";

const show = process.argv.includes("--show");
const ACCOUNT = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]) ?? "admin";
const ISSUER = "WAR ROOM";

let secret: string;

if (show) {
  // Same loader `schema-check.mts` uses, so this reads exactly what `next dev` reads rather
  // than a second opinion about which file wins.
  env.loadEnvConfig(process.cwd());
  const configured = process.env.ADMIN_TOTP_SECRET?.trim();
  if (!configured) {
    console.error(
      "ADMIN_TOTP_SECRET is not set. Run without --show to mint one, then put it in .env.local.",
    );
    process.exit(1);
  }
  secret = configured;
} else {
  secret = generateSecret();
}

// Round-trip before it is offered: a secret the verifier cannot read back would enrol cleanly on
// the phone and then reject every code it produced, with nothing on screen to say why.
const key = decodeBase32(secret);
if (!key) {
  console.error(
    show
      ? "ADMIN_TOTP_SECRET is set but is not valid base32 — the login cannot check any code against it."
      : "Generated a secret that will not decode — refusing to hand it over.",
  );
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const code = await totpCode({ key, atSeconds: now });
const secondsLeft = TOTP_STEP_SECONDS - (now % TOTP_STEP_SECONDS);
const uri = otpauthUri({ secret, account: ACCOUNT, issuer: ISSUER });

if (!show) {
  console.log(`
  Paste into .env.local (and into the Vercel project env), never into a file git can see:

    ADMIN_TOTP_SECRET=${secret}
`);
}

console.log(`
  Add to an authenticator — scan this, or type the secret in by hand:

    ${uri}

  For a QR in the terminal, if qrencode is installed:

    node scripts/totp-enrol.mts --show | grep otpauth | xargs qrencode -t ANSIUTF8

  Right now that secret is showing:  ${code}   (for another ${secondsLeft}s)

  Check the app agrees with that code before you rely on it. It is the only way in —
  the Telegram fallback is the only way back if it is lost.
`);
