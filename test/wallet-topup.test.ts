import test from "node:test";
import assert from "node:assert/strict";
import { topUpWallet } from "../modules/wallet-topup.ts";

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

test("tops up an existing wallet as paid credits by default", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([
    { ok: true, json: { wallets: [{ lago_id: "wallet-1", credits_ongoing_balance: "10.00" }] } },
    { ok: true, json: { wallet_transactions: [{ lago_id: "tx-1" }] } },
  ]) as any;
  t.after(() => { global.fetch = originalFetch; });

  const result = await topUpWallet("customer-1", 5, makeContext());

  assert.equal(result.success, true);
  assert.equal(result.newBalance, 15);
  assert.deepEqual(result.transaction, { lago_id: "tx-1" });
});

test("sends granted credits instead of paid credits when isGranted is true", async (t) => {
  const originalFetch = global.fetch;
  const calls: any[] = [];
  global.fetch = (async (url: string, opts: any) => {
    calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : undefined });
    if (calls.length === 1) {
      return { ok: true, json: async () => ({ wallets: [{ lago_id: "wallet-1", credits_ongoing_balance: "0.00" }] }) } as any;
    }
    return { ok: true, json: async () => ({ wallet_transactions: [{ lago_id: "tx-2" }] }) } as any;
  }) as any;
  t.after(() => { global.fetch = originalFetch; });

  const result = await topUpWallet("customer-1", 20, makeContext(), "Bonus credits", true);

  assert.equal(result.success, true);
  const txBody = calls[1].body.wallet_transaction;
  assert.equal(txBody.granted_credits, "20.00");
  assert.equal(txBody.paid_credits, "0.0");
});

test("fails when the customer has no wallet in Lago", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([
    { ok: true, json: { wallets: [] } },
  ]) as any;
  t.after(() => { global.fetch = originalFetch; });

  const result = await topUpWallet("customer-no-wallet", 5, makeContext());

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /No wallet found/);
});

test("fails when the initial wallet lookup request errors", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([
    { ok: false, status: 500, text: "lago is down" },
  ]) as any;
  t.after(() => { global.fetch = originalFetch; });

  const result = await topUpWallet("customer-1", 5, makeContext());

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /Failed to fetch wallet information/);
});

test("fails when creating the wallet transaction errors", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([
    { ok: true, json: { wallets: [{ lago_id: "wallet-1", credits_ongoing_balance: "10.00" }] } },
    { ok: false, status: 422, text: "invalid amount" },
  ]) as any;
  t.after(() => { global.fetch = originalFetch; });

  const result = await topUpWallet("customer-1", 5, makeContext());

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /Failed to create top-up transaction/);
});
