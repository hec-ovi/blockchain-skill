import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeFunctionData } from "viem";
import { startAnvil, type AnvilHandle } from "../../../testkit/anvil.ts";
import { findBin } from "../../../testkit/bins.ts";
import { importWallet } from "../../keys/src/wallet.ts";
import { deriveEvmAddress } from "../../keys/src/derive.ts";
import { deploy, write } from "../../contracts/src/api.ts";
import { balance } from "../../read/src/api.ts";
import { executeSwap } from "../src/execute.ts";
import { resolveChain } from "../../chains/src/registry.ts";
import { swapExecuteOutput } from "../src/contract.ts";
import type { SwapQuote } from "../src/port.ts";

const MNEMONIC = "test test test test test test test test test test test junk";
const PASS = "swap-e2e-pass";
const SRC = readFileSync(new URL("../fixtures/MockSwap.sol", import.meta.url), "utf8");
const ROUTER_ABI = [{ type: "function", name: "swap", stateMutability: "nonpayable", inputs: [{ name: "sellToken", type: "address" }, { name: "buyToken", type: "address" }, { name: "amountIn", type: "uint256" }], outputs: [] }];
const hasAnvil = Boolean(findBin("anvil"));

describe.skipIf(!hasAnvil)("swap execute path on anvil (mock token + router)", () => {
  let anvil: AnvilHandle;
  let home: string;
  let sell: string;
  let buy: string;
  let router: string;
  const owner = deriveEvmAddress(MNEMONIC, 0).address;

  async function deployMock(name: string, ctor: unknown[]): Promise<string> {
    const env = await deploy({ wallet: "w", passphrase: PASS, chain: "anvil", rpc: anvil.url, source: SRC, contractName: name, constructorArgs: ctor });
    if (!env.ok) throw new Error(`deploy ${name} failed: ${env.error?.message}`);
    return (env.data as any).address;
  }

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "agent-wallet-swap-e2e-"));
    process.env["AGENT_WALLET_HOME"] = home;
    anvil = await startAnvil();
    await importWallet({ name: "w", passphrase: PASS, mnemonic: MNEMONIC, scrypt: { n: 1024, p: 1, r: 8 } });
    sell = await deployMock("MockToken", ["Sell", "SELL"]);
    buy = await deployMock("MockToken", ["Buy", "BUY"]);
    router = await deployMock("MockRouter", []);
    const mintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }];
    await write({ wallet: "w", passphrase: PASS, chain: "anvil", rpc: anvil.url, address: sell, abi: mintAbi, function: "mint", args: [owner, "1000000000000000000"], wait: true });
  }, 120000);

  afterAll(async () => {
    delete process.env["AGENT_WALLET_HOME"];
    rmSync(home, { recursive: true, force: true });
    await anvil?.stop();
  });

  it("approves then swaps: sell balance drops, buy balance is 2x", async () => {
    const info = await resolveChain("anvil");
    if (info.family !== "evm") throw new Error("expected evm");
    const amountIn = "1000000000000000000";
    const data = encodeFunctionData({ abi: ROUTER_ABI as any, functionName: "swap", args: [sell as `0x${string}`, buy as `0x${string}`, BigInt(amountIn)] });
    const quote: SwapQuote = {
      adapter: "mock",
      chainId: 31337,
      sellToken: sell,
      buyToken: buy,
      sellAmount: amountIn,
      buyAmount: "2000000000000000000",
      minBuyAmount: "1990000000000000000",
      spender: router,
      execution: { kind: "tx", to: router, data, value: "0" },
    };

    const env = await executeSwap(quote, { wallet: "w", passphrase: PASS, index: 0, info, rpc: anvil.url }, true);
    const result = swapExecuteOutput.parse(env);
    expect(result.kind).toBe("tx");
    expect(result.approvalTx).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(result.swapTx).toMatch(/^0x[0-9a-f]{64}$/i);

    const sellBal = await balance({ chain: "anvil", address: owner, token: sell, rpc: anvil.url });
    expect((sellBal.data as any).raw).toBe("0");
    const buyBal = await balance({ chain: "anvil", address: owner, token: buy, rpc: anvil.url });
    expect((buyBal.data as any).raw).toBe("2000000000000000000");
  }, 120000);
});
