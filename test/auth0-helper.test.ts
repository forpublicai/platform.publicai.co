import test from "node:test";
import assert from "node:assert/strict";
import { getAuth0UserBySub } from "../modules/auth0-helper.ts";

function makeContext() {
  return {
    log: { info: () => {}, error: () => {}, warn: () => {} },
  } as any;
}

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json?: any; text?: string }>) {
  let call = 0;
  return async (_url: string, _opts: any) => {
    const r = responses[call++];
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
      text: async () => r.text ?? "",
    } as any;
  };
}

test("returns user info when Auth0 token and user lookup both succeed", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([
    { ok: true, json: { access_token: "tok-123", token_type: "Bearer", expires_in: 3600 } },
    { ok: true, json: { sub: "auth0|abc", email: "user@example.com", name: "Test User" } },
  ]) as any;
  t.after(() => { global.fetch = originalFetch; });

  const result = await getAuth0UserBySub("auth0|abc", makeContext());

  assert.deepEqual(result, { sub: "auth0|abc", email: "user@example.com", name: "Test User" });
});

test("returns null when the Auth0 token request fails", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([
    { ok: false, status: 401, text: "invalid client" },
  ]) as any;
  t.after(() => { global.fetch = originalFetch; });

  const result = await getAuth0UserBySub("auth0|abc", makeContext());

  assert.equal(result, null);
});

test("returns null when the user lookup request fails", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([
    { ok: true, json: { access_token: "tok-123", token_type: "Bearer", expires_in: 3600 } },
    { ok: false, status: 404, text: "not found" },
  ]) as any;
  t.after(() => { global.fetch = originalFetch; });

  const result = await getAuth0UserBySub("auth0|missing", makeContext());

  assert.equal(result, null);
});

test("returns null and does not throw when fetch rejects", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = (async () => { throw new Error("network down"); }) as any;
  t.after(() => { global.fetch = originalFetch; });

  const result = await getAuth0UserBySub("auth0|abc", makeContext());

  assert.equal(result, null);
});
