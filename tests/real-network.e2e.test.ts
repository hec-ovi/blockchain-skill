import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWallet } from "../layers/keys/src/wallet.ts";
import { faucet } from "../layers/faucet/src/api.ts";
import { balance } from "../layers/read/src/api.ts";
import { send } from "../layers/send/src/api.ts";
import { call, deploy } from "../layers/contracts/src/api.ts";

// Real public network end to end on Base Sepolia. The wallet funds ITSELF via the
// CDP faucet, no local node. Opt in: RUN_LIVE=1 with CDP_API_KEY_ID / CDP_API_KEY_SECRET set.
// Each run consumes a faucet drip (rate-limited per address), so it is not part of the default suite.
const enabled = Boolean(process.env["RUN_LIVE"] && process.env["CDP_API_KEY_ID"] && process.env["CDP_API_KEY_SECRET"]);
const CHAIN = "84532"; // Base Sepolia
const PASS = "real-e2e-pass";
const COUNTER = readFileSync(new URL("../layers/contracts/fixtures/Counter.sol", import.meta.url), "utf8");

async function waitForBalance(address: string, timeoutMs = 90000): Promise<bigint> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const env = await balance({ chain: CHAIN, address });
    if (env.ok && BigInt((env.data as any).wei) > 0n) return BigInt((env.data as any).wei);
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("faucet funding did not confirm in time");
}

describe.skipIf(!enabled)("real network end to end (Base Sepolia, self-funded)", () => {
  let home: string;
  let address: string;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "agent-wallet-real-"));
    process.env["AGENT_WALLET_HOME"] = home;
    process.env["AGENT_WALLET_SCRYPT_N"] = "1024";
    // A fresh wallet each run, so the faucet per-address limit never blocks it.
    const created = await createWallet({ name: "main", passphrase: PASS });
    address = (created.data as any).evmAddress;
  });

  afterAll(() => {
    delete process.env["AGENT_WALLET_HOME"];
    delete process.env["AGENT_WALLET_SCRYPT_N"];
    rmSync(home, { recursive: true, force: true });
  });

  it("funds itself via the CDP faucet and the funding tx appears on-chain", async () => {
    const env = await faucet({ address, network: "base-sepolia", token: "eth" });
    expect(env.ok, JSON.stringify(env.error)).toBe(true);
    expect((env.data as any).transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
    const funded = await waitForBalance(address);
    expect(funded).toBeGreaterThan(0n);
  }, 120000);

  it("sends a real transfer that confirms", async () => {
    const env = await send({ chain: CHAIN, to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: "0.00001", wallet: "main", passphrase: PASS, wait: true });
    expect(env.ok, JSON.stringify(env.error)).toBe(true);
    expect((env.data as any).status).toBe("confirmed");
    expect((env.data as any).hash).toMatch(/^0x[0-9a-f]{64}$/i);
  }, 120000);

  it("deploys and reads a contract", async () => {
    const dep = await deploy({ chain: CHAIN, wallet: "main", passphrase: PASS, source: COUNTER, contractName: "Counter", constructorArgs: [41] });
    expect(dep.ok, JSON.stringify(dep.error)).toBe(true);
    const addr = (dep.data as any).address;
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Public RPC can lag a block behind the deploy receipt; poll the read.
    let result: unknown;
    for (let i = 0; i < 8; i++) {
      const read = await call({ chain: CHAIN, address: addr, abi: (dep.data as any).abi, function: "count" });
      result = (read.data as any)?.result;
      if (result === "41") break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    expect(result).toBe("41");
  }, 120000);
});
