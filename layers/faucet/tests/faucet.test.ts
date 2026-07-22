import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { faucet } from "../src/api.ts";
import { resolveFaucetNetwork } from "../src/cdp.ts";
import { faucetInput, faucetOutput } from "../src/contract.ts";
import { envelopeShape } from "../../core/src/envelope.ts";

const ADDR = "0xE60e5D962A2009d981C7793a3857f6D2D7B1FFe2";

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "agent-wallet-faucet-"));
  process.env["AGENT_WALLET_HOME"] = home;
  delete process.env["CDP_API_KEY_ID"];
  delete process.env["CDP_API_KEY_SECRET"];
});
afterEach(() => {
  delete process.env["AGENT_WALLET_HOME"];
  rmSync(home, { recursive: true, force: true });
});

describe("faucet network resolution", () => {
  it("maps friendly aliases to CDP networks", () => {
    expect(resolveFaucetNetwork("sepolia")).toBe("ethereum-sepolia");
    expect(resolveFaucetNetwork("base-sepolia")).toBe("base-sepolia");
    expect(() => resolveFaucetNetwork("mainnet")).toThrowError(/does not support/);
  });
  it("schemas accept the documented shapes", () => {
    expect(faucetInput.safeParse({ address: ADDR, network: "base-sepolia", token: "eth" }).success).toBe(true);
    expect(faucetOutput.safeParse({ network: "base-sepolia", address: ADDR, token: "eth", transactionHash: "0x" + "a".repeat(64), explorer: "https://x/tx/0x" }).success).toBe(true);
  });
});

describe("faucet fail-closed without a key", () => {
  it("returns FAUCET_KEY_MISSING with a steering hint, never a crash", async () => {
    const env = await faucet({ address: ADDR, network: "base-sepolia" });
    expect(envelopeShape.safeParse(env).success).toBe(true);
    expect(env.ok).toBe(false);
    expect(env.error?.code).toBe("FAUCET_KEY_MISSING");
    expect(env.error?.hint).toContain("cdp.coinbase.com");
  });

  it("rejects a bad address and an unsupported network before touching the SDK", async () => {
    process.env["CDP_API_KEY_ID"] = "x";
    process.env["CDP_API_KEY_SECRET"] = "y";
    expect((await faucet({ address: "0xnope", network: "base-sepolia" })).error?.code).toBe("ADDRESS_INVALID");
    expect((await faucet({ address: ADDR, network: "mainnet" as never })).error?.code).toBe("FAUCET_NETWORK_UNSUPPORTED");
  });
});
