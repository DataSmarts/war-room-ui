import assert from "node:assert/strict";
import { test } from "node:test";

import {
  answerChallenge,
  CHALLENGE_MAX_ATTEMPTS,
  CHALLENGE_TTL_SECONDS,
  createChallenge,
  createSession,
  readSession,
  SESSION_TTL_SECONDS,
} from "./sessions.ts";
import { base64UrlDecode, randomCode } from "./token.ts";

const SECRET = "test-secret-not-a-real-one";
const OTHER_SECRET = "a-different-secret-entirely";
const NOW = 1_767_225_600;

// ---------------------------------------------------------------------------- session

test("a fresh session verifies, and says when it was issued", async () => {
  const token = await createSession({ secret: SECRET, nowSeconds: NOW });
  const state = await readSession({ token, secret: SECRET, nowSeconds: NOW });
  assert.equal(state.valid, true);
  if (state.valid) {
    assert.equal(state.payload.sub, "admin");
    assert.equal(state.payload.iat, NOW);
    assert.equal(state.payload.exp, NOW + SESSION_TTL_SECONDS);
  }
});

// The boundary rather than the number: the TTL is ours to change, and a test asserting seven
// days only proves the constant equals itself.
const SESSION_CLOCKS: { label: string; at: number; valid: boolean }[] = [
  { label: "the instant it was issued", at: 0, valid: true },
  { label: "one second before it lapses", at: SESSION_TTL_SECONDS - 1, valid: true },
  { label: "the instant it lapses", at: SESSION_TTL_SECONDS, valid: false },
  { label: "long after", at: SESSION_TTL_SECONDS * 10, valid: false },
];

for (const kase of SESSION_CLOCKS) {
  test(`session — read at ${kase.label} is ${kase.valid ? "valid" : "expired"}`, async () => {
    const token = await createSession({ secret: SECRET, nowSeconds: NOW });
    const state = await readSession({ token, secret: SECRET, nowSeconds: NOW + kase.at });
    assert.equal(state.valid, kase.valid);
    if (!state.valid) assert.equal(state.reason, "expired");
  });
}

test("a session signed under one secret is refused under another", async () => {
  const token = await createSession({ secret: SECRET, nowSeconds: NOW });
  const state = await readSession({ token, secret: OTHER_SECRET, nowSeconds: NOW });
  assert.equal(state.valid, false);
  if (!state.valid) assert.equal(state.reason, "bad-signature");
});

test("extending a session's own expiry does not extend it", async () => {
  // The tamper an expired cookie invites: reach in, push `exp` out, keep the signature. This is
  // what the signature is for, and the test says so out loud.
  const token = await createSession({ secret: SECRET, nowSeconds: NOW, ttlSeconds: 60 });
  const [payloadSegment, signature] = token.split(".");
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadSegment)!));
  payload.exp = NOW + 999_999;
  const forged = Buffer.from(JSON.stringify(payload))
    .toString("base64url");

  const state = await readSession({
    token: `${forged}.${signature}`,
    secret: SECRET,
    nowSeconds: NOW + 120,
  });
  assert.equal(state.valid, false);
  if (!state.valid) assert.equal(state.reason, "bad-signature");
});

// ---------------------------------------------------------------------------- challenge

test("the right code answers the challenge", async () => {
  const code = randomCode();
  const token = await createChallenge({ secret: SECRET, code, nowSeconds: NOW });
  const answer = await answerChallenge({ token, secret: SECRET, code, nowSeconds: NOW });
  assert.equal(answer.ok, true);
});

test("the challenge cookie does not carry the code", async () => {
  // The property that makes a leaked cookie useless on its own: what is stored is an HMAC of
  // the code, and the token is signed rather than encrypted (see token.test.ts), so anything
  // secret in a payload would be readable by whoever holds it.
  const code = randomCode();
  const token = await createChallenge({ secret: SECRET, code, nowSeconds: NOW });
  const payload = new TextDecoder().decode(base64UrlDecode(token.split(".")[0])!);
  assert.ok(!payload.includes(code), "the plaintext code is sitting in the cookie");
  assert.ok(payload.includes('"attempts":0'));
});

test("an absent cookie is 'absent', never a wrong answer", async () => {
  const answer = await answerChallenge({
    token: undefined,
    secret: SECRET,
    code: randomCode(),
    nowSeconds: NOW,
  });
  assert.equal(answer.ok, false);
  if (!answer.ok) assert.equal(answer.reason, "absent");
});

test("a wrong answer costs one attempt and hands back the cookie that says so", async () => {
  const code = randomCode();
  let token = await createChallenge({ secret: SECRET, code, nowSeconds: NOW });

  const first = await answerChallenge({ token, secret: SECRET, code: "WRONG123", nowSeconds: NOW });
  assert.equal(first.ok, false);
  if (first.ok) return;
  assert.equal(first.reason, "wrong");
  assert.equal(first.attemptsLeft, CHALLENGE_MAX_ATTEMPTS - 1);
  assert.ok(first.token, "a wrong answer with attempts left must re-sign the cookie");

  // And the re-signed cookie is still a working challenge — the right code still answers it.
  token = first.token!;
  const second = await answerChallenge({ token, secret: SECRET, code, nowSeconds: NOW });
  assert.equal(second.ok, true);
});

test("the challenge is spent after CHALLENGE_MAX_ATTEMPTS wrong answers", async () => {
  const code = randomCode();
  let token = await createChallenge({ secret: SECRET, code, nowSeconds: NOW });

  for (let attempt = 1; attempt < CHALLENGE_MAX_ATTEMPTS; attempt++) {
    const answer = await answerChallenge({ token, secret: SECRET, code: "WRONG123", nowSeconds: NOW });
    assert.equal(answer.ok, false);
    if (answer.ok) return;
    assert.equal(answer.reason, "wrong", `attempt ${attempt} should still be answerable`);
    assert.equal(answer.attemptsLeft, CHALLENGE_MAX_ATTEMPTS - attempt);
    token = answer.token!;
  }

  const spent = await answerChallenge({ token, secret: SECRET, code: "WRONG123", nowSeconds: NOW });
  assert.equal(spent.ok, false);
  if (spent.ok) return;
  assert.equal(spent.reason, "exhausted");
  // Nothing to write back: a spent challenge is deleted by the caller, not kept around
  // counting. The cookie is gone, so there is no token to hand back.
  assert.equal(spent.token, undefined);
});

test("the attempt count is advisory — a replayed cookie rewinds it", async () => {
  // Asserted, not glossed. State the client holds is state the client can rewind: keep a copy
  // of the `attempts: 0` cookie, replay it, and the count starts over — and no signature can
  // prevent it, because that cookie is one we really did sign.
  //
  // This is here so the five is never credited with being a rate limit. What actually bounds
  // guessing is the code's ~38 bits inside a 10-minute window (see sessions.ts). If that ever
  // stops being enough, the fix is a table and a write grant in the private repo's migration
  // sequence, not a bigger number here.
  const code = randomCode();
  const pristine = await createChallenge({ secret: SECRET, code, nowSeconds: NOW });

  for (let i = 0; i < CHALLENGE_MAX_ATTEMPTS * 3; i++) {
    const answer = await answerChallenge({
      token: pristine,
      secret: SECRET,
      code: "WRONG123",
      nowSeconds: NOW,
    });
    assert.equal(answer.ok, false);
    if (answer.ok) return;
    assert.equal(answer.reason, "wrong");
    assert.equal(answer.attemptsLeft, CHALLENGE_MAX_ATTEMPTS - 1);
  }

  // Expiry is the one thing replay cannot rewind, because it is signed alongside everything
  // else and the clock is ours.
  const late = await answerChallenge({
    token: pristine,
    secret: SECRET,
    code,
    nowSeconds: NOW + CHALLENGE_TTL_SECONDS,
  });
  assert.equal(late.ok, false);
  if (!late.ok) assert.equal(late.reason, "expired");
});

test("a challenge cannot be revived by rewinding its attempt count", async () => {
  const code = randomCode();
  const token = await createChallenge({ secret: SECRET, code, nowSeconds: NOW });
  const [payloadSegment, signature] = token.split(".");
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadSegment)!));
  payload.attempts = -50;
  const forged = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const answer = await answerChallenge({
    token: `${forged}.${signature}`,
    secret: SECRET,
    code,
    nowSeconds: NOW,
  });
  assert.equal(answer.ok, false);
  if (!answer.ok) assert.equal(answer.reason, "bad-signature");
});

const CHALLENGE_CLOCKS: { label: string; at: number; ok: boolean }[] = [
  { label: "immediately", at: 0, ok: true },
  { label: "one second before it lapses", at: CHALLENGE_TTL_SECONDS - 1, ok: true },
  { label: "the instant it lapses", at: CHALLENGE_TTL_SECONDS, ok: false },
];

for (const kase of CHALLENGE_CLOCKS) {
  test(`challenge — answered ${kase.label} is ${kase.ok ? "accepted" : "expired"}`, async () => {
    const code = randomCode();
    const token = await createChallenge({ secret: SECRET, code, nowSeconds: NOW });
    const answer = await answerChallenge({
      token,
      secret: SECRET,
      code,
      nowSeconds: NOW + kase.at,
    });
    assert.equal(answer.ok, kase.ok);
    if (!answer.ok) assert.equal(answer.reason, "expired");
  });
}

test("a challenge signed under one secret is refused under another", async () => {
  const code = randomCode();
  const token = await createChallenge({ secret: SECRET, code, nowSeconds: NOW });
  const answer = await answerChallenge({ token, secret: OTHER_SECRET, code, nowSeconds: NOW });
  assert.equal(answer.ok, false);
  if (!answer.ok) assert.equal(answer.reason, "bad-signature");
});

test("two challenges issued for the same code are different tokens", async () => {
  // They are not: the payload is deterministic given (secret, code, exp). Asserting the shape
  // that actually holds, so nobody later assumes a nonce that is not there. What keeps a
  // replayed cookie useless is that the code behind it was single-use in practice — a new
  // request sends a new code to Telegram, which the operator sees.
  const code = "SAMECODE";
  const a = await createChallenge({ secret: SECRET, code, nowSeconds: NOW });
  const b = await createChallenge({ secret: SECRET, code, nowSeconds: NOW + 1 });
  assert.notEqual(a, b, "a different expiry must produce a different token");
});
