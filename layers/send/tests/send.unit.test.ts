import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as btc from "@scure/btc-signer";
import { importWallet } from "../../keys/src/wallet.ts";
import { deriveBtcAddress } from "../../keys/src/derive.ts";
import type { FetchLike } from "../../chains/src/registry.ts";
import type { PostLike } from "../../chains/src/btc.ts";
import { send } from "../src/api.ts";
import { sendOutput } from "../src/contract.ts";
import { envelopeShape } from "../../core/src/envelope.ts";

const MNEMONIC = "test test test test test test test test test test test junk";
const PASS = "send-test-passphrase";
const FAST = { n: 1024, p: 1, r: 8 };
const TXID = "a".repeat(64);
const DEST_EVM = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const DEST_BTC = btc.p2wpkh(new Uint8Array(33).fill(2), btc.TEST_NETWORK).address!;

let home: string;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "agent-wallet-send-"));
  process.env["AGENT_WALLET_HOME"] = home;
  process.env["AGENT_WALLET_SCRYPT_N"] = "1024";
  await importWallet({ name: "w", passphrase: PASS, mnemonic: MNEMONIC, scrypt: FAST });
});
afterEach(() => {
  delete process.env["AGENT_WALLET_HOME"];
  delete process.env["AGENT_WALLET_SCRYPT_N"];
  rmSync(home, { recursive: true, force: true });
});

describe("send fail-closed (no network)", () => {
  it("allows mainnet by default (fails later on funds/RPC, not GATE_DENIED)", async () => {
    const env = await send({
      wallet: "w",
      passphrase: PASS,
      chain: "ethereum",
      to: DEST_EVM,
      amount: "0.001",
    });
    // Without funds/RPC, may fail after the gate; must not be GATE_DENIED under defaults.
    expect(env.error?.code).not.toBe("GATE_DENIED");
  });

  it("rejects invalid amounts and addresses before signing", async () => {
    const badAmt = await send({
      wallet: "w",
      passphrase: PASS,
      chain: "sepolia",
      to: DEST_EVM,
      amount: "0",
    });
    expect(badAmt.error?.code).toBe("AMOUNT_INVALID");

    const badAddr = await send({
      wallet: "w",
      passphrase: PASS,
      chain: "sepolia",
      to: "not-an-address",
      amount: "0.001",
    });
    expect(badAddr.error?.code).toBe("ADDRESS_INVALID");
  });

  it("rejects wrong passphrase without broadcasting", async () => {
    const env = await send({
      wallet: "w",
      passphrase: "wrong-passphrase",
      chain: "sepolia",
      to: DEST_EVM,
      amount: "0.001",
    });
    expect(env.error?.code).toBe("PASSPHRASE_WRONG");
  });
});

describe("send BTC end-to-end with mocked Esplora", () => {
  it("gates, signs, and broadcasts a signet transfer without a real network", async () => {
    const own = deriveBtcAddress(MNEMONIC, 0, "signet", "p2tr");
    let broadcastBody = "";
    const fetchFn = (async (url: string) => {
      if (url.includes("/utxo")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { txid: TXID, vout: 0, value: 100_000, status: { confirmed: true, block_height: 1 } },
          ],
          text: async () => "",
        };
      }
      if (url.includes("/fee-estimates")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ "1": 2, "3": 1, "6": 1, "144": 1 }),
          text: async () => "",
        };
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => "not found" };
    }) as unknown as FetchLike;

    const postFn: PostLike = async (_url, body) => {
      broadcastBody = body;
      // Esplora returns the txid as plain text.
      const tx = btc.Transaction.fromRaw(Buffer.from(body, "hex"), {
        allowUnknownInputs: true,
        allowUnknownOutputs: true,
      });
      return { ok: true, status: 200, text: async () => tx.id };
    };

    const env = await send({
      wallet: "w",
      passphrase: PASS,
      chain: "signet",
      to: DEST_BTC,
      amountRaw: "30000",
      feeRateSatVb: 2,
      fetchFn,
      postFn,
    });
    expect(env.ok).toBe(true);
    const data = sendOutput.parse(env.data);
    expect(data.family).toBe("btc");
    if (data.family !== "btc") throw new Error("expected btc");
    expect(data.status).toBe("broadcast");
    expect(data.from).toBe(own.address);
    expect(data.to).toBe(DEST_BTC);
    expect(data.amountSats).toBe("30000");
    expect(data.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(broadcastBody.length).toBeGreaterThan(100);
    expect(envelopeShape.safeParse(env).success).toBe(true);
  });

  it("reaches BTC path on mainnet with mocked endpoints (gate allows by default)", async () => {
    const fetchFn = (async () => ({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => "",
    })) as unknown as FetchLike;
    const env = await send({
      wallet: "w",
      passphrase: PASS,
      chain: "bitcoin",
      to: DEST_BTC,
      amountRaw: "1000",
      fetchFn,
    });
    // No UTXOs / further failure is fine; gate must not block.
    expect(env.error?.code).not.toBe("GATE_DENIED");
  });
});
