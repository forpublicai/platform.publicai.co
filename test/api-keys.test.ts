import test from "node:test";
import assert from "node:assert/strict";
import handler from "../modules/api-keys.ts";

function makeContext() {
  return { log: { info: () => {}, error: () => {}, warn: () => {} } } as any;
}

function makeRequest(body: any, sub = "auth0|abc") {
  return {
    user: { sub, data: {} },
    json: async () => body,
  } as any;
}

test("rejects requests missing an email", async () => {
  const response = await handler(makeRequest({}), makeContext());
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.error, "Email is required");
});

test("issues a new key for an existing consumer", async (t) => {
  const originalFetch = global.fetch;
  const calls: string[] = [];
  global.fetch = (async (url: string) => {
    calls.push(url);
    if (url.includes("/consumers?tag.sub=")) {
      return { ok: true, json: async () => ({ data: [{ name: "existing-consumer" }] }) } as any;
    }
    return { ok: true, json: async () => ({ id: "key-123" }) } as any;
  }) as any;
  t.after(() => { global.fetch = originalFetch; });

  const response = await handler(makeRequest({ email: "user@example.com" }), makeContext());

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.id, "key-123");
  assert.ok(calls[1].includes("/consumers/existing-consumer/keys"));
});

test("returns a 500 when the consumer lookup fails", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = (async () => ({ ok: false, json: async () => ({}) })) as any;
  t.after(() => { global.fetch = originalFetch; });

  const response = await handler(makeRequest({ email: "user@example.com" }), makeContext());

  assert.equal(response.status, 500);
  const data = await response.json();
  assert.equal(data.error, "Failed to check existing consumers");
});
