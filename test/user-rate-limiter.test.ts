import test from "node:test";
import assert from "node:assert/strict";
import { getUserIdentifier } from "../modules/user-rate-limiter.ts";

function makeContext() {
  const logs: { level: string; msg: string }[] = [];
  return {
    logs,
    log: {
      info: (msg: string) => logs.push({ level: "info", msg }),
      error: (msg: string) => logs.push({ level: "error", msg }),
      warn: (msg: string) => logs.push({ level: "warn", msg }),
    },
  } as any;
}

test("applies free plan limits by default when no plan is set", () => {
  const context = makeContext();
  const request = { user: { sub: "auth0|abc123", data: {} } } as any;

  const result = getUserIdentifier(request, context);

  assert.equal(result.key, "consumer:auth0|abc123:free");
  assert.equal(result.requestsAllowed, 100);
  assert.equal(result.timeWindowMinutes, 1);
});

test("applies plus plan limits", () => {
  const context = makeContext();
  const request = { user: { sub: "auth0|abc123", data: { plan: "plus" } } } as any;

  const result = getUserIdentifier(request, context);

  assert.equal(result.key, "consumer:auth0|abc123:plus");
  assert.equal(result.requestsAllowed, 200);
});

test("applies enterprise plan limits", () => {
  const context = makeContext();
  const request = { user: { sub: "auth0|xyz", data: { plan: "enterprise" } } } as any;

  const result = getUserIdentifier(request, context);

  assert.equal(result.requestsAllowed, 10000);
  assert.equal(result.rateLimitExceededMessage, "Enterprise plan: 10,000 requests/minute limit exceeded");
});

test("falls back to free plan limits for an unrecognized plan value", () => {
  const context = makeContext();
  const request = { user: { sub: "auth0|abc123", data: { plan: "made-up-plan" } } } as any;

  const result = getUserIdentifier(request, context);

  assert.equal(result.requestsAllowed, 100);
  assert.equal(result.key, "consumer:auth0|abc123:made-up-plan");
});

test("applies emergency rate limit when no consumer sub is present", () => {
  const context = makeContext();
  const request = { user: undefined } as any;

  const result = getUserIdentifier(request, context);

  assert.equal(result.key, "no-auth");
  assert.equal(result.requestsAllowed, 1);
  assert.equal(result.timeWindowMinutes, 60);
  assert.ok(context.logs.some((l: any) => l.level === "error"));
});
