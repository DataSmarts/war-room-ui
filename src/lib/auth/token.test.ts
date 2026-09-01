import assert from "node:assert/strict";
import { test } from "node:test";

import {
  base64UrlDecode,
  base64UrlEncode,
  constantTimeEqual,
  FALLBACK_CODE_LENGTH,
  normaliseCode,
  randomCode,
  secretsEqual,
  sign,
  verify,
} from "./token.ts";

/**
 * The signature is the whole gate, so this file's job is to prove the ways it can be got at
 * are all refused — and to prove the refusals are told apart, since `malformed` and
 * `bad-signature` are different facts about a cookie.
 */

const SECRET = "test-secret-not-a-real-one";
const OTHER_SECRET = "a-different-secret-entirely";

const parseAny = (raw: unknown) => raw as Record<string, unknown>;

test("base64url round-trips, including the bytes standard base64 spells with + and /", () => {
  // 0xfb 0xff produce "+/" under standard base64 — the two characters the url-safe alphabet
  // replaces, and the ones a naive implementation silently corrupts.
  const cases: number[][] = [[], [0], [0xfb, 0xff], [0xff, 0xfe, 0xfd], [1, 2, 3, 4, 5]];
  for (const bytes of cases) {
    const encoded = base64UrlEncode(new Uint8Array(bytes));
    assert.ok(!/[+/=]/.test(encoded), `${encoded} carries a non-url-safe character`);
    assert.deepEqual([...base64UrlDecode(encoded)!], bytes);
  }
});

test("base64UrlDecode is null on input it cannot read, never a partial answer", () => {
  assert.equal(base64UrlDecode("!!!!"), null);
  assert.equal(base64UrlDecode("a b c"), null);
});

test("a token signed here verifies here", async () => {
  const token = await sign(SECRET, { sub: "admin", n: 1 });
  const result = await verify({ token, secret: SECRET, parse: parseAny });
  assert.equal(result.valid, true);
  if (result.valid) assert.deepEqual(result.payload, { sub: "admin", n: 1 });
});

test("the payload is readable — the token is signed, not encrypted", async () => {
  // Stated as a test so nobody later mistakes it for confidentiality. Anything secret must be
  // hashed before it goes in a payload; `sessions.ts` hashes the fallback code for this reason.
  const token = await sign(SECRET, { sub: "admin" });
  const decoded = new TextDecoder().decode(base64UrlDecode(token.split(".")[0])!);
  assert.equal(decoded, JSON.stringify({ sub: "admin" }));
});

test("a token signed under one secret does not verify under another", async () => {
  const token = await sign(SECRET, { sub: "admin" });
  const result = await verify({ token, secret: OTHER_SECRET, parse: parseAny });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.reason, "bad-signature");
});

test("a tampered payload is refused — the forged claim never reaches parse", async () => {
  const token = await sign(SECRET, { sub: "admin", role: "reader" });
  const forged = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ sub: "admin", role: "owner" })),
  );
  const tampered = `${forged}.${token.split(".")[1]}`;

  let parseRan = false;
  const result = await verify({
    token: tampered,
    secret: SECRET,
    parse: (raw) => {
      parseRan = true;
      return raw as Record<string, unknown>;
    },
  });

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.reason, "bad-signature");
  // The order is the point: verify, *then* parse. Parsing first would run attacker-controlled
  // JSON through the validator to decide whether it was worth authenticating.
  assert.equal(parseRan, false, "parse ran on an unauthenticated payload");
});

const MALFORMED: { label: string; token: string }[] = [
  { label: "no separator", token: "abcdef" },
  { label: "empty payload segment", token: ".abcdef" },
  { label: "empty signature segment", token: "abcdef." },
  { label: "three segments", token: "a.b.c" },
  { label: "empty string", token: "" },
];

for (const kase of MALFORMED) {
  test(`malformed — ${kase.label}`, async () => {
    const result = await verify({ token: kase.token, secret: SECRET, parse: parseAny });
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.reason, "malformed");
  });
}

test("a mutated signature is bad-signature, not malformed", async () => {
  const token = await sign(SECRET, { sub: "admin" });
  const [payload, signature] = token.split(".");
  const flipped = signature[0] === "A" ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
  const result = await verify({ token: `${payload}.${flipped}`, secret: SECRET, parse: parseAny });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.reason, "bad-signature");
});

test("a validly signed payload this build does not recognise is malformed, not trusted", async () => {
  // A cookie from an older shape, correctly signed. Being signed is not the same as being
  // understood, and `parse` returning null is how a module says so.
  const token = await sign(SECRET, { some: "older shape" });
  const result = await verify({ token, secret: SECRET, parse: () => null });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.reason, "malformed");
});

test("constantTimeEqual answers on content, and on length", () => {
  assert.equal(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  assert.equal(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
  assert.equal(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2])), false);
});

test("secretsEqual compares content, whatever the lengths", async () => {
  assert.equal(await secretsEqual("hunter2", "hunter2"), true);
  assert.equal(await secretsEqual("hunter2", "hunter3"), false);
  // The reason for the double-HMAC: unequal lengths must not take a different path.
  assert.equal(await secretsEqual("short", "a much longer secret"), false);
  assert.equal(await secretsEqual("", ""), true);
});

test("randomCode stays inside its alphabet and its length", () => {
  for (let i = 0; i < 200; i++) {
    const code = randomCode();
    assert.equal(code.length, FALLBACK_CODE_LENGTH);
    // No I, L, O or U — the three that are misread off a phone and the one that makes words.
    assert.match(code, /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/);
  }
});

test("randomCode does not repeat itself", () => {
  const seen = new Set(Array.from({ length: 200 }, () => randomCode()));
  assert.equal(seen.size, 200);
});

test("normaliseCode forgives case and spacing, which are not part of the secret", () => {
  assert.equal(normaliseCode("  a1b2 c3d4 "), "A1B2C3D4");
  assert.equal(normaliseCode("A1B2C3D4"), "A1B2C3D4");
});
