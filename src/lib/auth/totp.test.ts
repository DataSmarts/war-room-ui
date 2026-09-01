import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeBase32,
  encodeBase32,
  generateSecret,
  otpauthUri,
  TOTP_SECRET_BYTES,
  TOTP_SKEW_STEPS,
  TOTP_STEP_SECONDS,
  totpCode,
  totpCounter,
  verifyTotp,
} from "./totp.ts";

/**
 * Checked against the specification, not against itself.
 *
 * The vectors below are RFC 6238 Appendix B verbatim — the same seed and the same expected
 * codes every other TOTP implementation is tested with. That is the point of hand-rolling it:
 * an implementation with published vectors is one where "it agrees with my phone" can be
 * proven before there is a phone.
 *
 * Runs on `node --test` with nothing but type stripping — no server, no clock, no environment.
 * `nowSeconds` is a parameter for exactly this reason. The explicit `./totp.ts` extension is
 * Node's ESM resolver, not a style choice.
 */

/** "12345678901234567890" — the RFC's 20-byte ASCII seed, base32-encoded. */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("decodeBase32 recovers the RFC's ASCII seed", () => {
  const key = decodeBase32(RFC_SECRET);
  assert.ok(key);
  assert.equal(new TextDecoder().decode(key), "12345678901234567890");
});

// RFC 6238 Appendix B, the SHA-1 rows. The 6-digit code is the 8-digit one truncated, because
// HOTP is `binary % 10^digits` — so asserting both proves the truncation too.
const RFC_VECTORS: { at: number; eight: string; six: string }[] = [
  { at: 59, eight: "94287082", six: "287082" },
  { at: 1111111109, eight: "07081804", six: "081804" },
  { at: 1111111111, eight: "14050471", six: "050471" },
  { at: 1234567890, eight: "89005924", six: "005924" },
  { at: 2000000000, eight: "69279037", six: "279037" },
  { at: 20000000000, eight: "65353130", six: "353130" },
];

for (const vector of RFC_VECTORS) {
  test(`RFC 6238 vector at T=${vector.at}`, async () => {
    const key = decodeBase32(RFC_SECRET);
    assert.ok(key);
    assert.equal(await totpCode({ key, atSeconds: vector.at, digits: 8 }), vector.eight);
    assert.equal(await totpCode({ key, atSeconds: vector.at }), vector.six);
  });
}

test("a leading zero survives — the code is a string, never a number", async () => {
  const key = decodeBase32(RFC_SECRET);
  assert.ok(key);
  const code = await totpCode({ key, atSeconds: 1111111109 });
  assert.equal(code, "081804");
  assert.equal(code.length, 6);
});

// The whole point of the ±1 window, and the boundary either side of it. A drifted phone clock
// inside one step is accepted; two steps out is not, because widening this multiplies the
// codes valid at any instant.
const NOW = 1_767_225_600; // an arbitrary fixed instant; nothing here reads a real clock

const SKEW_CASES: { label: string; offsetSteps: number; accepted: boolean }[] = [
  { label: "this step", offsetSteps: 0, accepted: true },
  { label: "one step behind", offsetSteps: -1, accepted: true },
  { label: "one step ahead", offsetSteps: +1, accepted: true },
  { label: "two steps behind", offsetSteps: -2, accepted: false },
  { label: "two steps ahead", offsetSteps: +2, accepted: false },
];

for (const kase of SKEW_CASES) {
  test(`skew — a code from ${kase.label} is ${kase.accepted ? "accepted" : "refused"}`, async () => {
    const key = decodeBase32(RFC_SECRET);
    assert.ok(key);
    const code = await totpCode({
      key,
      atSeconds: NOW + kase.offsetSteps * TOTP_STEP_SECONDS,
    });
    const result = await verifyTotp({ secret: RFC_SECRET, code, nowSeconds: NOW });
    assert.equal(result.ok, kase.accepted);
    if (!result.ok) assert.equal(result.reason, "wrong");
  });
}

test("the skew window is exactly TOTP_SKEW_STEPS wide", () => {
  // Probed rather than restated: the constant is ours, and a test that asserts `=== 1` only
  // proves the constant equals itself.
  assert.equal(totpCounter(NOW + TOTP_SKEW_STEPS * TOTP_STEP_SECONDS) - totpCounter(NOW), TOTP_SKEW_STEPS);
});

// "unconfigured" and "wrong" are different facts, and collapsing them tells an operator holding
// a correct code that their code is wrong. Same distinction the whole repo turns on.
const REJECTIONS: { label: string; secret: string; code: string; reason: string }[] = [
  { label: "no secret set", secret: "", code: "000000", reason: "unconfigured" },
  { label: "secret is not base32", secret: "not-a-secret!", code: "000000", reason: "unconfigured" },
  { label: "secret is only padding", secret: "====", code: "000000", reason: "unconfigured" },
  { label: "five digits", secret: RFC_SECRET, code: "12345", reason: "malformed" },
  { label: "seven digits", secret: RFC_SECRET, code: "1234567", reason: "malformed" },
  { label: "letters", secret: RFC_SECRET, code: "abcdef", reason: "malformed" },
  { label: "empty", secret: RFC_SECRET, code: "", reason: "malformed" },
  { label: "six wrong digits", secret: RFC_SECRET, code: "000000", reason: "wrong" },
];

for (const kase of REJECTIONS) {
  test(`rejection — ${kase.label} reads as ${kase.reason}`, async () => {
    const result = await verifyTotp({ secret: kase.secret, code: kase.code, nowSeconds: NOW });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, kase.reason);
  });
}

test("surrounding whitespace is not part of the code", async () => {
  const key = decodeBase32(RFC_SECRET);
  assert.ok(key);
  const code = await totpCode({ key, atSeconds: NOW });
  const result = await verifyTotp({ secret: RFC_SECRET, code: `  ${code} `, nowSeconds: NOW });
  assert.equal(result.ok, true);
});

test("an enrolment secret may carry the spaces and padding a QR reader adds", () => {
  const grouped = decodeBase32("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ");
  const dashed = decodeBase32("GEZD-GNBV-GY3T-QOJQ-GEZD-GNBV-GY3T-QOJQ");
  const lower = decodeBase32(RFC_SECRET.toLowerCase());
  assert.ok(grouped && dashed && lower);
  assert.deepEqual([...grouped], [...decodeBase32(RFC_SECRET)!]);
  assert.deepEqual([...dashed], [...grouped]);
  assert.deepEqual([...lower], [...grouped]);
});

test("a character outside the alphabet is null, never silently dropped", () => {
  // The trap this closes: a secret that decodes to *something* after discarding what it did not
  // understand enrols cleanly, disagrees with the phone, and gives no clue why.
  assert.equal(decodeBase32("GEZDGNBVGY3TQOJQ1"), null); // 1 is not in RFC 4648 base32
  assert.equal(decodeBase32("GEZDGNBVGY3TQOJ0"), null); // nor is 0
  assert.equal(decodeBase32(""), null);
});

test("encodeBase32 agrees with the decoder, at every length a remainder can take", () => {
  // 1..8 bytes covers all five bit-remainders the 5-into-8 packing can leave, which is where a
  // base32 implementation goes wrong if it is going to.
  for (let length = 1; length <= 8; length++) {
    const bytes = new Uint8Array(Array.from({ length }, (_, i) => (i * 37 + 11) % 256));
    const round = decodeBase32(encodeBase32(bytes));
    assert.ok(round, `length ${length} did not decode`);
    assert.deepEqual([...round], [...bytes], `length ${length} did not round-trip`);
  }
});

test("encodeBase32 reproduces the RFC's own encoding of its seed", () => {
  assert.equal(encodeBase32(new TextEncoder().encode("12345678901234567890")), RFC_SECRET);
});

test("a generated secret enrols and then verifies its own code", async () => {
  // The end-to-end property the enrolment script depends on: mint, encode, decode, produce a
  // code, and have `verifyTotp` accept it — the same path the operator's phone will take.
  const secret = generateSecret();
  const key = decodeBase32(secret);
  assert.ok(key);
  assert.equal(key.length, TOTP_SECRET_BYTES);

  const code = await totpCode({ key, atSeconds: NOW });
  const result = await verifyTotp({ secret, code, nowSeconds: NOW });
  assert.equal(result.ok, true);
});

test("two generated secrets differ", () => {
  const seen = new Set(Array.from({ length: 50 }, () => generateSecret()));
  assert.equal(seen.size, 50);
});

test("otpauthUri carries the parameters this module actually verifies with", () => {
  const uri = otpauthUri({ secret: RFC_SECRET, account: "admin", issuer: "WAR ROOM" });
  const parsed = new URL(uri);
  assert.equal(parsed.protocol, "otpauth:");
  assert.equal(parsed.searchParams.get("secret"), RFC_SECRET);
  assert.equal(parsed.searchParams.get("algorithm"), "SHA1");
  assert.equal(parsed.searchParams.get("digits"), "6");
  assert.equal(parsed.searchParams.get("period"), String(TOTP_STEP_SECONDS));
  // The label is issuer-prefixed, which is what makes the entry legible in an app holding a
  // dozen of them.
  assert.ok(decodeURIComponent(parsed.pathname).endsWith("WAR ROOM:admin"));
});
