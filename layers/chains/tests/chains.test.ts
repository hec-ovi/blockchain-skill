import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveChain, type FetchLike } from "../src/registry.ts";
import { toViemChain } from "../src/evm.ts";
import { esploraGet } from "../src/btc.ts";
import { chainCheck, chainResolve } from "../src/api.ts";
import { chainInfoOutput } from "../src/contract.ts";
import { envelopeShape } from "../../core/src/envelope.ts";

const FIXTURE = JSON.parse(readFileSync(new URL("../fixtures/chains-mini.json", import.meta.url), "utf8"));

function fakeFetch(body: unknown, ok = true, status = 200): FetchLike {
  return async () => ({ ok, status, json: async () => body });
}

const neverFetch: FetchLike = async () => {
  throw new Error("network access attempted in a unit test");
};

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "agent-wallet-chains-"));
  process.env["AGENT_WALLET_HOME"] = home;
});
afterEach(() => {
  delete process.env["AGENT_WALLET_HOME"];
  rmSync(home, { recursive: true, force: true });
});

describe("chain resolution (offline)", () => {
  it("resolves viem chains by id, name, key and alias without network", async () => {
    for (const ref of [1, "1", "ethereum", "eth", "mainnet", "Ethereum"]) {
      const info = await resolveChain(ref, neverFetch);
      expect(info.family).toBe("evm");
      if (info.family === "evm") {
        expect(info.chainId).toBe(1);
        expect(info.source).toBe("viem");
        expect(info.rpcUrls.length).toBeGreaterThan(0);
        expect(info.rpcUrls.every((u) => u.startsWith("http") && !u.includes("${"))).toBe(true);
      }
    }
    const sepolia = await resolveChain("sepolia", neverFetch);
    expect(sepolia.family === "evm" && sepolia.chainId).toBe(11155111);
    expect(sepolia.testnet).toBe(true);
    const anvil = await resolveChain("anvil", neverFetch);
    expect(anvil.family === "evm" && anvil.chainId).toBe(31337);
    expect(anvil.testnet).toBe(true);
    expect((await resolveChain("ethereum", neverFetch)).testnet).toBe(false);
  });

  it("resolves the four Bitcoin networks builtin", async () => {
    const signet = await resolveChain("signet", neverFetch);
    expect(signet).toMatchObject({ family: "btc", network: "signet", testnet: true });
    const regtest = await resolveChain("regtest", neverFetch);
    expect(regtest.family === "btc" && regtest.bitcoindRpc).toContain("18443");
    const mainnet = await resolveChain("bitcoin", neverFetch);
    expect(mainnet.family === "btc" && mainnet.esploraUrls[0]).toContain("mempool.space");
  });

  it("chain info validates against the published schema", async () => {
    for (const ref of ["sepolia", "bitcoin", "base"]) {
      expect(chainInfoOutput.safeParse(await resolveChain(ref, neverFetch)).success).toBe(true);
    }
  });
});

describe("registry fallback", () => {
  it("resolves an unknown chain id from the registry and caches it", async () => {
    const info = await resolveChain(999999123, fakeFetch(FIXTURE));
    expect(info.family === "evm" && info.name).toBe("Fixture Chain");
    expect(info.source).toBe("registry");
    const cached = JSON.parse(readFileSync(join(home, "cache", "chains.json"), "utf8"));
    expect(cached.entries.length).toBeGreaterThan(0);
    const second = await resolveChain("fix", neverFetch);
    expect(second.family === "evm" && second.chainId).toBe(999999123);
  });

  it("drops templated and ws RPC urls from registry entries", async () => {
    const info = await resolveChain(999999123, fakeFetch(FIXTURE));
    expect(info.family === "evm" && info.rpcUrls).toEqual(["https://rpc.fixture.example"]);
  });

  it("fails closed on unknown chains and keyless-RPC-free chains", async () => {
    const env = await chainResolve("definitely-not-a-chain", fakeFetch(FIXTURE));
    expect(env.error?.code).toBe("CHAIN_UNKNOWN");
    expect(env.error?.hint).toContain("chainlist.org");
    const noRpc = await chainResolve(999999124, fakeFetch(FIXTURE));
    expect(noRpc.error?.code).toBe("CHAIN_NO_RPC");
    expect(envelopeShape.safeParse(noRpc).success).toBe(true);
  });

  it("expired or missing cache with dead registry fails REGISTRY_UNAVAILABLE", async () => {
    const env = await chainResolve(424242424242, fakeFetch({}, false, 503));
    expect(env.error?.code).toBe("REGISTRY_UNAVAILABLE");
  });

  it("uses a fresh cache without refetching", async () => {
    mkdirSync(join(home, "cache"), { recursive: true });
    writeFileSync(
      join(home, "cache", "chains.json"),
      JSON.stringify({ fetchedAt: Date.now(), entries: [{ chainId: 777001, name: "Cached Chain", rpc: ["https://rpc.cached.example"] }] }),
      { mode: 0o600 },
    );
    const info = await resolveChain(777001, neverFetch);
    expect(info.family === "evm" && info.name).toBe("Cached Chain");
  });
});

describe("viem chain construction and esplora fallback", () => {
  it("builds a viem chain with rpc override first", async () => {
    const info = await resolveChain("sepolia", neverFetch);
    if (info.family !== "evm") throw new Error("expected evm");
    const chain = toViemChain(info, "http://127.0.0.1:8545");
    expect(chain.id).toBe(11155111);
    expect(chain.rpcUrls.default.http[0]).toBe("http://127.0.0.1:8545");
  });

  it("esploraGet falls through failing endpoints and reports the last error", async () => {
    const info = { ...(await resolveChain("bitcoin", neverFetch)) } as any;
    let calls = 0;
    const flaky: FetchLike = async (url: string) => {
      calls++;
      if (url.startsWith("https://mempool.space")) return { ok: false, status: 429, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => 900001 };
    };
    expect(await esploraGet(info, "/blocks/tip/height", flaky)).toBe(900001);
    expect(calls).toBe(2);
  });

  it("regtest without esplora steers to bitcoind", async () => {
    const env = await chainCheck("regtest", undefined, neverFetch);
    expect(env.error?.code).toBe("BITCOIND_REQUIRED");
    expect(env.error?.hint).toContain("bitcoind");
  });
});
