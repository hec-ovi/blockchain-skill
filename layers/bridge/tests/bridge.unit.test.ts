import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FetchLike } from "../../chains/src/registry.ts";
import { bridge, quote, status } from "../src/api.ts";
import { bridgeQuoteOutput, bridgeStatusOutput } from "../src/contract.ts";
import { saveConfig } from "../../core/src/config.ts";

const USDC_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_ARB = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const FROM = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const QUOTE_BODY = {
  tool: "across",
  estimate: { fromAmount: "100000000", toAmount: "99800000", toAmountMin: "99300000", approvalAddress: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", executionDuration: 120 },
  transactionRequest: { to: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", data: "0xc0ffee", value: "0", chainId: 1 },
};

function api(routes: Array<{ match: string; body: unknown; ok?: boolean; status?: number; text?: string }>): FetchLike {
  return (async (url: string) => {
    for (const r of routes) {
      if (url.includes(r.match)) return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body, text: async () => r.text ?? JSON.stringify(r.body) };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" };
  }) as unknown as FetchLike;
}

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "agent-wallet-bridge-"));
  process.env["AGENT_WALLET_HOME"] = home;
});
afterEach(() => {
  delete process.env["AGENT_WALLET_HOME"];
  rmSync(home, { recursive: true, force: true });
});

describe("bridge quote/status (fixtures, no network)", () => {
  it("parses a LI.FI quote into a normalized route", async () => {
    const fetchFn = api([{ match: "li.quest/v1/quote", body: QUOTE_BODY }]);
    const env = await quote({ fromChain: "ethereum", toChain: "arbitrum", fromToken: USDC_ETH, toToken: USDC_ARB, fromAmount: "100000000", fromAddress: FROM, fetchFn });
    expect(env.ok).toBe(true);
    const q = bridgeQuoteOutput.parse(env.data);
    expect(q).toMatchObject({ tool: "across", fromChainId: 1, toChainId: 42161, toAmountMin: "99300000" });
    expect(q.transactionRequest.to).toBe("0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE");
  });

  it("maps LI.FI status", async () => {
    const fetchFn = api([{ match: "li.quest/v1/status", body: { status: "DONE", substatus: "COMPLETED", sending: { txHash: "0x" + "a".repeat(64) }, receiving: { txHash: "0x" + "b".repeat(64) } } }]);
    const env = await status({ txHash: "0x" + "a".repeat(64), fromChain: "ethereum", toChain: "arbitrum", fetchFn });
    const s = bridgeStatusOutput.parse(env.data);
    expect(s.status).toBe("DONE");
    expect(s.receivingTxHash).toMatch(/^0xbbb/);
  });

  it("fails closed on no route and non-EVM chains", async () => {
    const noRoute = api([{ match: "li.quest/v1/quote", body: { message: "no route" }, ok: false, status: 404 }]);
    expect((await quote({ fromChain: "ethereum", toChain: "arbitrum", fromToken: USDC_ETH, toToken: USDC_ARB, fromAmount: "1", fromAddress: FROM, fetchFn: noRoute })).error?.code).toBe("BRIDGE_QUOTE_FAILED");
    expect((await quote({ fromChain: "bitcoin", toChain: "arbitrum", fromToken: USDC_ETH, toToken: USDC_ARB, fromAmount: "1", fromAddress: FROM })).error?.code).toBe("FAMILY_MISMATCH");
  });
});

describe("bridge execution safety", () => {
  it("gate denies a mainnet bridge by default (nothing signed or sent)", async () => {
    const fetchFn = api([{ match: "li.quest/v1/quote", body: QUOTE_BODY }]);
    const env = await bridge({ fromChain: "ethereum", toChain: "arbitrum", fromToken: USDC_ETH, toToken: USDC_ARB, fromAmount: "100000000", fromAddress: FROM, wallet: "w", passphrase: "x", fetchFn });
    expect(env.error?.code).toBe("GATE_DENIED");
    expect(env.error?.hint).toContain("allowMainnet");
  });

  it("with mainnet allowed, a missing wallet fails at unlock, not silently", async () => {
    saveConfig({ gate: { allowMainnet: true } });
    const fetchFn = api([{ match: "li.quest/v1/quote", body: QUOTE_BODY }]);
    const env = await bridge({ fromChain: "ethereum", toChain: "arbitrum", fromToken: USDC_ETH, toToken: USDC_ARB, fromAmount: "100000000", fromAddress: FROM, wallet: "ghost", passphrase: "x", fetchFn });
    expect(env.ok).toBe(false);
    expect(["WALLET_NOT_FOUND", "BRIDGE_TX_FAILED"]).toContain(env.error?.code);
  });
});
