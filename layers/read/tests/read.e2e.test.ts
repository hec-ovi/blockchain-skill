import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { startAnvil, type AnvilHandle } from "../../../testkit/anvil.ts";
import { startRegtest, type RegtestHandle } from "../../../testkit/regtest.ts";
import { findBin } from "../../../testkit/bins.ts";
import { deriveBtcAddress } from "../../keys/src/derive.ts";
import { balance, fees, txStatus, utxos } from "../src/api.ts";
import { balanceOutput, feesOutput, txStatusOutput, utxoListOutput } from "../src/contract.ts";

const MNEMONIC = "test test test test test test test test test test test junk";
const ANVIL0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const hasTools = Boolean(findBin("anvil") && findBin("bitcoind"));

describe.skipIf(!hasTools)("read layer against real local chains", () => {
  let anvil: AnvilHandle;
  let regtest: RegtestHandle;
  let btcAddr: string;

  beforeAll(async () => {
    [anvil, regtest] = await Promise.all([startAnvil(), startRegtest()]);
    process.env["AGENT_WALLET_BITCOIND_URL"] = regtest.rpcUrl;
    btcAddr = deriveBtcAddress(MNEMONIC, 0, "regtest", "p2tr").address;
    await regtest.mine(101, btcAddr);
  }, 60000);

  afterAll(async () => {
    delete process.env["AGENT_WALLET_BITCOIND_URL"];
    await Promise.all([anvil?.stop(), regtest?.stop()]);
  });

  it("EVM: anvil account 0 holds 10000 ETH; fees estimate; unknown tx is not_found", async () => {
    const bal = await balance({ chain: "anvil", address: ANVIL0, rpc: anvil.url });
    const data = balanceOutput.parse(bal.data);
    if (data.family !== "evm" || !("wei" in data)) throw new Error("expected native evm balance");
    expect(data.formatted).toBe("10000");
    expect(data.symbol).toBe("ETH");

    const fee = await fees({ chain: "anvil", rpc: anvil.url });
    const feeData = feesOutput.parse(fee.data);
    if (feeData.family !== "evm") throw new Error("expected evm fees");
    expect(BigInt(feeData.maxFeePerGas)).toBeGreaterThan(0n);

    const missing = await txStatus({ chain: "anvil", ref: `0x${"1".repeat(64)}`, rpc: anvil.url });
    expect(txStatusOutput.parse(missing.data)).toMatchObject({ status: "not_found" });
  }, 30000);

  it("BTC regtest: mined coinbase shows up in balance and utxos; coinbase tx confirms", async () => {
    const bal = await balance({ chain: "regtest", address: btcAddr });
    const data = balanceOutput.parse(bal.data);
    if (data.family !== "btc") throw new Error("expected btc balance");
    expect(BigInt(data.totalSats)).toBeGreaterThan(0n);

    const list = utxoListOutput.parse((await utxos({ chain: "regtest", address: btcAddr })).data);
    expect(list.length).toBeGreaterThanOrEqual(101);
    const tx = await txStatus({ chain: "regtest", ref: list[0]!.txid });
    expect(txStatusOutput.parse(tx.data).status).toBe("confirmed");

    const fee = await fees({ chain: "regtest" });
    const feeData = feesOutput.parse(fee.data);
    if (feeData.family !== "btc") throw new Error("expected btc fees");
    expect(feeData.fastestSatVb).toBeGreaterThanOrEqual(1);
  }, 60000);

  it("CLI balance verb reaches anvil end to end", () => {
    const BIN = new URL("../../../bin/agent-wallet.ts", import.meta.url).pathname;
    const out = JSON.parse(
      execFileSync(process.execPath, [BIN, "balance", "anvil", ANVIL0, "--rpc", anvil.url], { encoding: "utf8" }),
    );
    expect(out.ok).toBe(true);
    expect(out.data.formatted).toBe("10000");
    expect(out.meta.layer).toBe("read");
  }, 30000);
});
