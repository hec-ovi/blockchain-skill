import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FetchLike } from "../../chains/src/registry.ts";
import { quote, swap } from "../src/api.ts";
import { swapQuoteOutput } from "../src/contract.ts";
import { saveConfig } from "../../core/src/config.ts";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const FROM = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

/** Match by URL substring; supports GET and POST (body ignored). */
function api(routes: Array<{ match: string; body: unknown; ok?: boolean; status?: number; text?: string }>): FetchLike {
  return (async (url: string) => {
    for (const r of routes) {
      if (url.includes(r.match)) {
        return {
          ok: r.ok ?? true,
          status: r.status ?? 200,
          json: async () => r.body,
          text: async () => r.text ?? JSON.stringify(r.body),
        };
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" };
  }) as unknown as FetchLike;
}

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "agent-wallet-swap-"));
  process.env["AGENT_WALLET_HOME"] = home;
});
afterEach(() => {
  delete process.env["AGENT_WALLET_HOME"];
  rmSync(home, { recursive: true, force: true });
});

describe("swap quotes (fixtures, no network)", () => {
  it("parses a CoW quote and builds a signable order with slippage", async () => {
    const fetchFn = api([
      {
        match: "api.cow.fi",
        body: { quote: { sellToken: WETH, buyToken: USDC, receiver: FROM, sellAmount: "1000000000000000000", buyAmount: "3000000000", feeAmount: "2000000000000000", validTo: 2000000000, sellTokenBalance: "erc20", buyTokenBalance: "erc20" } },
      },
    ]);
    const env = await quote({ chain: "ethereum", sellToken: WETH, buyToken: USDC, sellAmount: "1000000000000000000", from: FROM, adapter: "cow", fetchFn });
    expect(env.ok).toBe(true);
    const q = swapQuoteOutput.parse(env.data);
    expect(q.adapter).toBe("cow");
    expect(q.buyAmount).toBe("3000000000");
    expect(BigInt(q.minBuyAmount)).toBe((3000000000n * 9950n) / 10000n);
    expect(q.execution.kind).toBe("order");
    if (q.execution.kind === "order") {
      expect(q.execution.order["kind"]).toBe("sell");
      expect(q.execution.order["buyAmount"]).toBe(q.minBuyAmount);
    }
  });

  it("parses a Kyber route+build into executable calldata", async () => {
    const fetchFn = api([
      { match: "/routes?", body: { data: { routeSummary: { amountOut: "3010000000", gas: "180000" } } } },
      { match: "/route/build", body: { data: { data: "0xdeadbeef", routerAddress: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5" } } },
    ]);
    const env = await quote({ chain: "ethereum", sellToken: WETH, buyToken: USDC, sellAmount: "1000000000000000000", from: FROM, adapter: "kyber", fetchFn });
    const q = swapQuoteOutput.parse(env.data);
    expect(q.adapter).toBe("kyber");
    expect(q.execution).toMatchObject({ kind: "tx", to: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", data: "0xdeadbeef" });
    expect(q.spender).toBe("0x6131B5fae19EA4f9D964eAc0408E4408b66337b5");
  });

  it("best-quote picks the higher buyAmount across adapters", async () => {
    const fetchFn = api([
      { match: "api.cow.fi", body: { quote: { sellToken: WETH, buyToken: USDC, receiver: FROM, sellAmount: "1000000000000000000", buyAmount: "3000000000", feeAmount: "1", validTo: 2000000000 } } },
      { match: "/routes?", body: { data: { routeSummary: { amountOut: "3050000000" } } } },
      { match: "/route/build", body: { data: { data: "0xabcd", routerAddress: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5" } } },
    ]);
    const env = await quote({ chain: "ethereum", sellToken: WETH, buyToken: USDC, sellAmount: "1000000000000000000", from: FROM, fetchFn });
    expect(swapQuoteOutput.parse(env.data).adapter).toBe("kyber");
    expect(swapQuoteOutput.parse(env.data).buyAmount).toBe("3050000000");
  });

  it("fails closed on unknown adapter and non-EVM chain", async () => {
    expect((await quote({ chain: "ethereum", sellToken: WETH, buyToken: USDC, sellAmount: "1", from: FROM, adapter: "bogus" })).error?.code).toBe("SWAP_ADAPTER_UNKNOWN");
    expect((await quote({ chain: "bitcoin", sellToken: WETH, buyToken: USDC, sellAmount: "1", from: FROM })).error?.code).toBe("FAMILY_MISMATCH");
  });
});

describe("swap execution safety", () => {
  it("gate denies a mainnet swap when allowMainnet is false", async () => {
    saveConfig({ gate: { allowMainnet: false } });
    const fetchFn = api([
      { match: "/routes?", body: { data: { routeSummary: { amountOut: "3010000000" } } } },
      { match: "/route/build", body: { data: { data: "0xdeadbeef", routerAddress: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5" } } },
    ]);
    const env = await swap({ chain: "ethereum", sellToken: WETH, buyToken: USDC, sellAmount: "1000000000000000000", from: FROM, wallet: "w", passphrase: "x", adapter: "kyber", fetchFn });
    expect(env.error?.code).toBe("GATE_DENIED");
    expect(env.error?.hint).toContain("allowMainnet");
  });

  it("even with mainnet allowed, a bogus wallet fails before any external call", async () => {
    saveConfig({ gate: { allowMainnet: true } });
    const fetchFn = api([
      { match: "/routes?", body: { data: { routeSummary: { amountOut: "3010000000" } } } },
      { match: "/route/build", body: { data: { data: "0xdeadbeef", routerAddress: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5" } } },
    ]);
    const env = await swap({ chain: "ethereum", sellToken: WETH, buyToken: USDC, sellAmount: "1000000000000000000", from: FROM, wallet: "does-not-exist", passphrase: "x", adapter: "kyber", fetchFn });
    expect(env.ok).toBe(false);
    expect(["WALLET_NOT_FOUND", "SWAP_TX_FAILED"]).toContain(env.error?.code);
  });
});
