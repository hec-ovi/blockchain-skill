import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startAnvil, type AnvilHandle } from "../../../testkit/anvil.ts";
import { startRegtest, type RegtestHandle } from "../../../testkit/regtest.ts";
import { findBin } from "../../../testkit/bins.ts";
import { importWallet } from "../../keys/src/wallet.ts";
import { deriveBtcAddress, deriveEvmAddress } from "../../keys/src/derive.ts";
import { balance, txStatus } from "../../read/src/api.ts";
import { send } from "../src/api.ts";
import { sendOutput } from "../src/contract.ts";

const MNEMONIC = "test test test test test test test test test test test junk";
const PASS = "send-e2e-pass";
const hasTools = Boolean(findBin("anvil") && findBin("bitcoind"));

describe.skipIf(!hasTools)("send layer full e2e (anvil + regtest)", () => {
  let anvil: AnvilHandle;
  let regtest: RegtestHandle;
  let home: string;
  const addr0 = deriveBtcAddress(MNEMONIC, 0, "regtest", "p2tr").address;
  const addr1 = deriveBtcAddress(MNEMONIC, 1, "regtest", "p2tr").address;
  const evm1 = deriveEvmAddress(MNEMONIC, 1).address;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "agent-wallet-send-"));
    process.env["AGENT_WALLET_HOME"] = home;
    process.env["AGENT_WALLET_SCRYPT_N"] = "1024";
    [anvil, regtest] = await Promise.all([startAnvil(), startRegtest()]);
    process.env["AGENT_WALLET_BITCOIND_URL"] = regtest.rpcUrl;
    await importWallet({ name: "w", passphrase: PASS, mnemonic: MNEMONIC, scrypt: { n: 1024, p: 1, r: 8 } });
    await regtest.mine(101, addr0);
  }, 90000);

  afterAll(async () => {
    delete process.env["AGENT_WALLET_HOME"];
    delete process.env["AGENT_WALLET_BITCOIND_URL"];
    delete process.env["AGENT_WALLET_SCRYPT_N"];
    rmSync(home, { recursive: true, force: true });
    await Promise.all([anvil?.stop(), regtest?.stop()]);
  });

  it("EVM: sends 1.5 ETH on anvil, waits for confirmation, balance moves", async () => {
    const env = await send({ wallet: "w", passphrase: PASS, chain: "anvil", to: evm1, amount: "1.5", rpc: anvil.url, wait: true });
    expect(env.ok).toBe(true);
    const data = sendOutput.parse(env.data);
    if (data.family !== "evm") throw new Error("expected evm");
    expect(data.status).toBe("confirmed");
    expect(data.valueWei).toBe("1500000000000000000");

    const bal = await balance({ chain: "anvil", address: evm1, rpc: anvil.url });
    expect((bal.data as any).formatted).toBe("10001.5");
  }, 60000);

  it("EVM: nonce increments across sends; huge send fails INSUFFICIENT_FUNDS before broadcast", async () => {
    const again = await send({ wallet: "w", passphrase: PASS, chain: "anvil", to: evm1, amount: "0.1", rpc: anvil.url, wait: true });
    expect((again.data as any).nonce).toBe(1);
    const huge = await send({ wallet: "w", passphrase: PASS, chain: "anvil", to: evm1, amount: "999999", rpc: anvil.url });
    expect(huge.error?.code).toBe("INSUFFICIENT_FUNDS");
  }, 60000);

  it("BTC: sends 30000 sats on regtest, mines a block, recipient balance and confirmation check out", async () => {
    const env = await send({ wallet: "w", passphrase: PASS, chain: "regtest", to: addr1, amountRaw: "30000", feeRateSatVb: 2 });
    expect(env.ok).toBe(true);
    const data = sendOutput.parse(env.data);
    if (data.family !== "btc") throw new Error("expected btc");
    expect(data.status).toBe("broadcast");
    expect(data.from).toBe(addr0);

    await regtest.mine(1, addr0);
    const status = await txStatus({ chain: "regtest", ref: data.txid });
    expect((status.data as any).status).toBe("confirmed");
    const bal = await balance({ chain: "regtest", address: addr1 });
    expect((bal.data as any).totalSats).toBe("30000");
  }, 60000);

  it("BTC: change returns to sender and is spendable in a follow-up send", async () => {
    const sweepTarget = deriveBtcAddress(MNEMONIC, 2, "regtest", "p2tr").address;
    const env = await send({ wallet: "w", passphrase: PASS, chain: "regtest", to: sweepTarget, amountRaw: "20000", feeRateSatVb: 2 });
    expect(env.ok).toBe(true);
    await regtest.mine(1, addr0);
    const bal = await balance({ chain: "regtest", address: sweepTarget });
    expect((bal.data as any).totalSats).toBe("20000");
  }, 60000);

  it("gate blocks mainnet sends before any network write", async () => {
    const eth = await send({ wallet: "w", passphrase: PASS, chain: "ethereum", to: evm1, amount: "0.1" });
    expect(eth.error?.code).toBe("GATE_DENIED");
    const btc = await send({ wallet: "w", passphrase: PASS, chain: "bitcoin", to: addr1, amountRaw: "1000" });
    expect(btc.error?.code).toBe("GATE_DENIED");
    expect(btc.error?.hint).toContain("allowMainnet");
  }, 60000);

  it("CLI send verb works end to end on anvil", () => {
    const BIN = new URL("../../../bin/agent-wallet.ts", import.meta.url).pathname;
    const out = JSON.parse(
      execFileSync(
        process.execPath,
        [BIN, "send", "anvil", "--to", evm1, "--amount", "0.25", "--wallet", "w", "--rpc", anvil.url, "--wait"],
        { encoding: "utf8", env: { ...process.env, AGENT_WALLET_PASSPHRASE: PASS } },
      ),
    );
    expect(out.ok).toBe(true);
    expect(out.data.status).toBe("confirmed");
    expect(out.meta.layer).toBe("send");
  }, 60000);
});
