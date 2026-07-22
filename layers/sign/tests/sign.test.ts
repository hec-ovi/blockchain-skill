import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTransaction, recoverTransactionAddress, verifyMessage, verifyTypedData } from "viem";
import * as btc from "@scure/btc-signer";
import { importWallet } from "../../keys/src/wallet.ts";
import { btcTxSign, evmMessageSign, evmTxSign, evmTypedDataSign } from "../src/api.ts";
import { btcSignedOutput, evmSignatureOutput, evmSignedOutput } from "../src/contract.ts";

const MNEMONIC = "test test test test test test test test test test test junk";
const ANVIL0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const PASS = "sign-test-pass";
const FAST = { n: 1024, p: 1, r: 8 };
const TXID = "b".repeat(64);

let home: string;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "agent-wallet-sign-"));
  process.env["AGENT_WALLET_HOME"] = home;
  await importWallet({ name: "w", passphrase: PASS, mnemonic: MNEMONIC, scrypt: FAST });
});
afterEach(() => {
  delete process.env["AGENT_WALLET_HOME"];
  rmSync(home, { recursive: true, force: true });
});

describe("EVM signing (offline, verifiable)", () => {
  it("signs an EIP-1559 tx that parses and recovers to the right sender", async () => {
    const env = await evmTxSign({
      wallet: "w",
      passphrase: PASS,
      chainId: 31337,
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      valueWei: "1230000000000000000",
      nonce: 0,
      gasLimit: "21000",
      maxFeePerGas: "2000000000",
      maxPriorityFeePerGas: "1000000000",
    });
    expect(env.ok).toBe(true);
    const data = evmSignedOutput.parse(env.data);
    expect(data.from).toBe(ANVIL0);
    const parsed = parseTransaction(data.rawTx as `0x${string}`);
    expect(parsed).toMatchObject({ chainId: 31337, nonce: 0, gas: 21000n, value: 1230000000000000000n });
    expect(await recoverTransactionAddress({ serializedTransaction: data.rawTx as any })).toBe(ANVIL0);
  });

  it("signs messages and EIP-712 typed data that verify", async () => {
    const msg = await evmMessageSign("w", PASS, 0, "agent-wallet proof");
    const sig = evmSignatureOutput.parse(msg.data);
    expect(await verifyMessage({ address: sig.address as any, message: "agent-wallet proof", signature: sig.signature as any })).toBe(true);

    const typed = {
      domain: { name: "AgentWallet", version: "1", chainId: 1 },
      types: { Claim: [{ name: "owner", type: "address" }] },
      primaryType: "Claim",
      message: { owner: ANVIL0 },
    };
    const t = await evmTypedDataSign("w", PASS, 0, JSON.stringify(typed));
    const tSig = evmSignatureOutput.parse(t.data);
    expect(await verifyTypedData({ ...typed, address: tSig.address as any, signature: tSig.signature as any } as any)).toBe(true);
  });

  it("fails closed: empty tx, bad value, wrong passphrase", async () => {
    const base = { wallet: "w", passphrase: PASS, chainId: 1, nonce: 0, gasLimit: "21000", maxFeePerGas: "1", maxPriorityFeePerGas: "1" };
    expect((await evmTxSign(base)).error?.code).toBe("TX_EMPTY");
    expect((await evmTxSign({ ...base, to: ANVIL0, valueWei: "1.5" })).error?.code).toBe("AMOUNT_INVALID");
    expect((await evmTxSign({ ...base, to: "0xdead" })).error?.code).toBe("ADDRESS_INVALID");
    expect((await evmTxSign({ ...base, to: ANVIL0, passphrase: "wrong-pass" })).error?.code).toBe("PASSPHRASE_WRONG");
    expect((await evmTypedDataSign("w", PASS, 0, "{}")).error?.code).toBe("TYPED_DATA_INVALID");
  });
});

describe("BTC signing (offline, decodable)", () => {
  const utxo = (valueSats: string, vout = 0, confirmed = true) => ({ txid: TXID, vout, valueSats, confirmed });
  const base = { wallet: "w", passphrase: PASS, network: "regtest" as const, feeRateSatVb: 2 };
  // A foreign regtest address (not derived from our wallet) as recipient.
  const DEST = btc.p2wpkh(new Uint8Array(33).fill(2), { ...btc.TEST_NETWORK, bech32: "bcrt" }).address!;

  it("signs a taproot spend with change; decodes to the expected outputs", async () => {
    const env = await btcTxSign({ ...base, to: DEST, amountSats: "30000", utxos: [utxo("100000")] });
    expect(env.ok).toBe(true);
    const data = btcSignedOutput.parse(env.data);
    expect(data.inputs).toBe(1);
    expect(data.outputs).toBe(2);
    const tx = btc.Transaction.fromRaw(Buffer.from(data.txHex, "hex"), { allowUnknownInputs: true, allowUnknownOutputs: true });
    expect(tx.outputsLength).toBe(2);
    expect(tx.getOutput(0)?.amount).toBe(30000n);
    const total = 100000n;
    expect(tx.getOutput(1)?.amount).toBe(total - 30000n - BigInt(data.feeSats));
    expect(data.txid).toBe(tx.id);
    expect(BigInt(data.feeSats)).toBeGreaterThan(0n);
    expect(data.vsize).toBeGreaterThan(100);
  });

  it("sweeps with amountSats=all into a single output", async () => {
    const env = await btcTxSign({ ...base, to: DEST, amountSats: "all", utxos: [utxo("50000"), utxo("30000", 1)] });
    const data = btcSignedOutput.parse(env.data);
    expect(data.inputs).toBe(2);
    expect(data.outputs).toBe(1);
    expect(data.changeSats).toBe("0");
    expect(BigInt(data.feeSats) + BigInt(80000n - BigInt(data.feeSats))).toBe(80000n);
  });

  it("folds dust change into the fee", async () => {
    // amount chosen so change would be < 546 sats
    const env = await btcTxSign({ ...base, to: DEST, amountSats: "99400", utxos: [utxo("100000")] });
    const data = btcSignedOutput.parse(env.data);
    expect(data.outputs).toBe(1);
    expect(data.changeSats).toBe("0");
  });

  it("fails closed: unconfirmed-only utxos, insufficient funds, wrong-network address, bad fee rate", async () => {
    expect((await btcTxSign({ ...base, to: DEST, amountSats: "1000", utxos: [utxo("100000", 0, false)] })).error?.code).toBe("NO_UTXOS");
    expect((await btcTxSign({ ...base, to: DEST, amountSats: "999999999", utxos: [utxo("10000")] })).error?.code).toBe("INSUFFICIENT_FUNDS");
    const mainnetAddr = btc.p2wpkh(new Uint8Array(33).fill(2), btc.NETWORK).address!;
    expect((await btcTxSign({ ...base, to: mainnetAddr, amountSats: "1000", utxos: [utxo("10000")] })).error?.code).toBe("ADDRESS_INVALID");
    expect((await btcTxSign({ ...base, to: DEST, amountSats: "1000", feeRateSatVb: 0, utxos: [utxo("10000")] })).error?.code).toBe("FEE_RATE_INVALID");
  });
});
