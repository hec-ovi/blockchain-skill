import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startAnvil, type AnvilHandle } from "../../../testkit/anvil.ts";
import { findBin } from "../../../testkit/bins.ts";
import { importWallet } from "../../keys/src/wallet.ts";
import { call, deploy, write } from "../src/api.ts";
import { callOutput, deployOutput, writeOutput } from "../src/contract.ts";

const MNEMONIC = "test test test test test test test test test test test junk";
const PASS = "contracts-e2e-pass";
const COUNTER = readFileSync(new URL("../fixtures/Counter.sol", import.meta.url), "utf8");
const hasAnvil = Boolean(findBin("anvil"));

describe.skipIf(!hasAnvil)("contracts full e2e (anvil)", () => {
  let anvil: AnvilHandle;
  let home: string;
  let deployed: { address: string; abi: unknown[] };

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "agent-wallet-contracts-"));
    process.env["AGENT_WALLET_HOME"] = home;
    anvil = await startAnvil();
    await importWallet({ name: "w", passphrase: PASS, mnemonic: MNEMONIC, scrypt: { n: 1024, p: 1, r: 8 } });
  }, 60000);

  afterAll(async () => {
    delete process.env["AGENT_WALLET_HOME"];
    rmSync(home, { recursive: true, force: true });
    await anvil?.stop();
  });

  it("deploys Counter(41) with a constructor arg", async () => {
    const env = await deploy({ wallet: "w", passphrase: PASS, chain: "anvil", rpc: anvil.url, source: COUNTER, sourceName: "Counter.sol", contractName: "Counter", constructorArgs: [41] });
    expect(env.ok).toBe(true);
    const data = deployOutput.parse(env.data);
    expect(data.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(data.contractName).toBe("Counter");
    deployed = { address: data.address, abi: data.abi };
  }, 60000);

  it("reads count == 41 via call", async () => {
    const env = await call({ chain: "anvil", rpc: anvil.url, address: deployed.address, abi: deployed.abi, function: "count" });
    expect(callOutput.parse(env.data).result).toBe("41");
  }, 30000);

  it("increment (write) then count == 42; add(8) then 50", async () => {
    const inc = await write({ wallet: "w", passphrase: PASS, chain: "anvil", rpc: anvil.url, address: deployed.address, abi: deployed.abi, function: "increment", wait: true });
    expect(writeOutput.parse(inc.data).status).toBe("confirmed");
    const after = await call({ chain: "anvil", rpc: anvil.url, address: deployed.address, abi: deployed.abi, function: "count" });
    expect(callOutput.parse(after.data).result).toBe("42");

    await write({ wallet: "w", passphrase: PASS, chain: "anvil", rpc: anvil.url, address: deployed.address, abi: deployed.abi, function: "add", args: ["8"], wait: true });
    const final = await call({ chain: "anvil", rpc: anvil.url, address: deployed.address, abi: deployed.abi, function: "count" });
    expect(callOutput.parse(final.data).result).toBe("50");
  }, 60000);

  it("fails closed: calling write on a view fn; unknown fn", async () => {
    const bad = await write({ wallet: "w", passphrase: PASS, chain: "anvil", rpc: anvil.url, address: deployed.address, abi: deployed.abi, function: "count" });
    expect(bad.error?.code).toBe("NOT_WRITABLE");
    const missing = await call({ chain: "anvil", rpc: anvil.url, address: deployed.address, abi: deployed.abi, function: "nope" });
    expect(missing.error?.code).toBe("FUNCTION_NOT_FOUND");
  }, 30000);

  it("CLI: deploy from a source file then read count", () => {
    const BIN = new URL("../../../bin/agent-wallet.ts", import.meta.url).pathname;
    const srcFile = join(home, "Counter.sol");
    writeFileSync(srcFile, COUNTER);
    const out = JSON.parse(
      execFileSync(
        process.execPath,
        [BIN, "contract-deploy", "anvil", "--source", srcFile, "--name", "Counter", "--args", "7", "--wallet", "w", "--rpc", anvil.url],
        { encoding: "utf8", env: { ...process.env, AGENT_WALLET_PASSPHRASE: PASS } },
      ),
    );
    expect(out.ok).toBe(true);
    expect(out.data.address).toMatch(/^0x/);
    expect(out.meta.layer).toBe("contracts");
  }, 60000);
});
