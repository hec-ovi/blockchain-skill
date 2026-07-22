import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveConfig } from "../../core/src/config.ts";
import { gateCheck } from "../src/api.ts";
import { gateVerdictOutput } from "../src/contract.ts";
import { envelopeShape } from "../../core/src/envelope.ts";

const sepolia = { family: "evm" as const, name: "Sepolia", testnet: true, chainId: 11155111 };
const mainnet = { family: "evm" as const, name: "Ethereum", testnet: false, chainId: 1 };
const bitcoin = { family: "btc" as const, name: "Bitcoin", testnet: false, network: "bitcoin" };
const signet = { family: "btc" as const, name: "Bitcoin Signet", testnet: true, network: "signet" };

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "agent-wallet-gate-"));
  process.env["AGENT_WALLET_HOME"] = home;
});
afterEach(() => {
  delete process.env["AGENT_WALLET_HOME"];
  rmSync(home, { recursive: true, force: true });
});

describe("gate defaults (no config file)", () => {
  it("allows testnets, denies every mainnet with an actionable hint", async () => {
    for (const chain of [sepolia, signet]) {
      const env = await gateCheck({ kind: "send", chain, valueBaseUnits: "1000" });
      expect(env.ok).toBe(true);
      expect(gateVerdictOutput.parse(env.data).mainnet).toBe(false);
    }
    for (const chain of [mainnet, bitcoin]) {
      const env = await gateCheck({ kind: "send", chain, valueBaseUnits: "1000" });
      expect(env.error?.code).toBe("GATE_DENIED");
      expect(env.error?.hint).toContain("allowMainnet");
      expect(envelopeShape.safeParse(env).success).toBe(true);
    }
  });

  it("fails closed on unknown operation kinds", async () => {
    const env = await gateCheck({ kind: "teleport" as any, chain: sepolia });
    expect(env.error?.code).toBe("GATE_UNKNOWN_KIND");
  });
});

describe("gate config", () => {
  it("allowMainnet=true opens mainnet; allowedChains opens one chain only", async () => {
    saveConfig({ gate: { allowMainnet: true } });
    expect((await gateCheck({ kind: "swap", chain: mainnet })).ok).toBe(true);

    saveConfig({ gate: { allowedChains: [1] } });
    expect((await gateCheck({ kind: "send", chain: mainnet })).ok).toBe(true);
    expect((await gateCheck({ kind: "send", chain: bitcoin })).error?.code).toBe("GATE_DENIED");

    saveConfig({ gate: { allowedChains: ["bitcoin"] } });
    expect((await gateCheck({ kind: "send", chain: bitcoin })).ok).toBe(true);
  });

  it("caps deny over-limit sends per family and report the applied cap", async () => {
    saveConfig({ gate: { maxValueWei: "1000000", maxAmountSats: "5000" } });
    const under = await gateCheck({ kind: "send", chain: sepolia, valueBaseUnits: "999999" });
    expect(gateVerdictOutput.parse(under.data).policy.capApplied).toBe("maxValueWei");
    expect((await gateCheck({ kind: "send", chain: sepolia, valueBaseUnits: "1000001" })).error?.code).toBe("GATE_CAPPED");
    expect((await gateCheck({ kind: "send", chain: signet, valueBaseUnits: "5001" })).error?.code).toBe("GATE_CAPPED");
    expect((await gateCheck({ kind: "send", chain: signet, valueBaseUnits: "5000" })).ok).toBe(true);
  });

  it("malformed config denies instead of falling back to allow", async () => {
    saveConfig({ gate: { allowMainnet: "yes" } });
    const env = await gateCheck({ kind: "send", chain: sepolia });
    expect(env.error?.code).toBe("GATE_CONFIG_INVALID");
  });
});
