import { describe, expect, it } from "vitest";
import type { FetchLike } from "../../chains/src/registry.ts";
import { learnContract } from "../src/api.ts";
import { contractSourceOutput } from "../src/contract.ts";
import { envelopeShape } from "../../core/src/envelope.ts";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ERC20_ABI = [
  { type: "function", name: "balanceOf", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
];

/** Serve one fixture per host substring; unmatched hosts 404 so we can assert fallthrough order. */
function router(handlers: Array<{ match: string; body: unknown; ok?: boolean; status?: number }>): { fetchFn: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchFn: FetchLike = async (url: string) => {
    calls.push(url);
    for (const h of handlers) {
      if (url.includes(h.match)) return { ok: h.ok ?? true, status: h.status ?? 200, json: async () => h.body };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchFn, calls };
}

describe("learn: source resolution order (fixtures, no network)", () => {
  it("returns Sourcify first and never queries later backends", async () => {
    const { fetchFn, calls } = router([
      { match: "sourcify.dev", body: { abi: ERC20_ABI, compilation: { name: "WETH9", compilerVersion: "0.4.19" } } },
    ]);
    const env = await learnContract({ chain: "ethereum", address: WETH, fetchFn });
    expect(env.ok).toBe(true);
    const data = contractSourceOutput.parse(env.data);
    expect(data.source).toBe("sourcify");
    expect(data.name).toBe("WETH9");
    expect(data.abi).toHaveLength(2);
    expect(calls.every((u) => u.includes("sourcify.dev"))).toBe(true);
  });

  it("falls to Blockscout when Sourcify misses, parsing its getsourcecode shape", async () => {
    const { fetchFn } = router([
      { match: "sourcify.dev", body: {}, ok: false, status: 404 },
      {
        // fromBlockscout calls the explorer's getsourcecode; match the path, not a host.
        match: "action=getsourcecode",
        body: {
          result: [
            { ABI: JSON.stringify(ERC20_ABI), ContractName: "Token", CompilerVersion: "v0.8.20", IsProxy: "true", Implementation: "0x" + "ab".repeat(20), SourceCode: "contract Token {}", FileName: "Token.sol" },
          ],
        },
      },
    ]);
    const env = await learnContract({ chain: "gnosis", address: WETH, fetchFn });
    const data = contractSourceOutput.parse(env.data);
    expect(data.source).toBe("blockscout");
    expect(data.isProxy).toBe(true);
    expect(data.implementation).toMatch(/^0xabab/i);
  });

  it("uses Etherscan only when a key is set", async () => {
    process.env["ETHERSCAN_API_KEY"] = "TESTKEY";
    const { fetchFn, calls } = router([
      { match: "sourcify.dev", body: {}, ok: false, status: 404 },
      { match: "api.etherscan.io", body: { result: [{ ABI: JSON.stringify(ERC20_ABI), ContractName: "ES", Proxy: "0" }] } },
    ]);
    try {
      const env = await learnContract({ chain: "ethereum", address: WETH, fetchFn });
      expect(contractSourceOutput.parse(env.data).source).toBe("etherscan");
      expect(calls.some((u) => u.includes("apikey=TESTKEY"))).toBe(true);
    } finally {
      delete process.env["ETHERSCAN_API_KEY"];
    }
  });

  it("verifiedOnly fails closed with a steering hint when nothing is verified", async () => {
    const { fetchFn } = router([{ match: "sourcify.dev", body: {}, ok: false, status: 404 }]);
    const env = await learnContract({ chain: "ethereum", address: WETH, verifiedOnly: true, fetchFn });
    expect(env.error?.code).toBe("NOT_VERIFIED");
    expect(env.error?.hint).toContain("etherscanApiKey");
    expect(envelopeShape.safeParse(env).success).toBe(true);
  });

  it("rejects bad addresses and non-EVM chains", async () => {
    expect((await learnContract({ chain: "ethereum", address: "0xnope" })).error?.code).toBe("ADDRESS_INVALID");
    expect((await learnContract({ chain: "bitcoin", address: WETH })).error?.code).toBe("FAMILY_MISMATCH");
  });
});
