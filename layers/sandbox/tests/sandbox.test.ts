import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { sandboxRun } from "../src/api.ts";
import { runOutput } from "../src/contract.ts";
import { parseAmount } from "../src/run.ts";

const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));

/** Exploit plan, parameterised by which vault flavour is under test. */
function exploitPlan(vaultContract: "Vault" | "SafeVault") {
  return {
    accounts: { alice: "10 ether", mallory: "5 ether" },
    sources: [
      { path: "Vault.sol", file: "Vault.sol" },
      { path: "Attacker.sol", file: "Attacker.sol" },
    ],
    deploy: [
      { as: "vault", contract: vaultContract, from: "deployer" },
      { as: "attacker", contract: "Attacker", from: "mallory", args: ["$vault"], value: "1 ether" },
    ],
    steps: [
      { name: "alice funds the pool", to: "vault", from: "alice", fn: "deposit", value: "2 ether" },
      { name: "mallory arms the attacker", to: "attacker", from: "mallory", fn: "pwn", value: "0" },
    ],
    invariants: [
      { name: "vault keeps alice's deposit", to: "vault", fn: "totalHeld", op: "gte" as const, value: "2 ether" },
    ],
  };
}

describe("sandbox: in-process EVM, no node and no funds", () => {
  it("deploys, runs steps, decodes events, and holds invariants", async () => {
    const env = await sandboxRun(
      {
        accounts: { alice: "10 ether" },
        sources: [{ path: "Vault.sol", file: "Vault.sol" }],
        deploy: [{ as: "vault", contract: "SafeVault" }],
        steps: [
          { name: "alice deposits 1", to: "vault", from: "alice", fn: "deposit", value: "1 ether" },
          { name: "balance reads back", to: "vault", from: "alice", fn: "balanceOf", args: ["@alice"], returns: "1000000000000000000" },
          { name: "alice withdraws", to: "vault", from: "alice", fn: "withdrawAll" },
        ],
        invariants: [{ name: "pool empty after withdraw", to: "vault", fn: "totalHeld", value: "0" }],
      },
      { baseDir: fixtures },
    );

    expect(env.error).toBeUndefined();
    const data = runOutput.parse(env.data);
    expect(data.pass).toBe(true);
    expect(data.failures).toEqual([]);
    expect(data.deployed[0]!.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(data.deployed[0]!.overSizeLimit).toBe(false);
    expect(data.steps[0]!.logs[0]).toMatchObject({ event: "Deposit" });
    expect(data.steps[0]!.logs[0]!.args["amount"]).toBe("1000000000000000000");
    expect(data.steps[1]!.kind).toBe("call");
    expect(data.steps[2]!.kind).toBe("send");
    expect(BigInt(data.steps[2]!.gasUsed!)).toBeGreaterThan(0n);
    expect(data.compilerVersion).toContain("0.8");
  });

  it("reports a failed expectation instead of throwing", async () => {
    const env = await sandboxRun(
      {
        sources: [{ path: "Vault.sol", file: "Vault.sol" }],
        deploy: [{ as: "vault", contract: "SafeVault" }],
        steps: [{ name: "withdraw with no deposit", to: "vault", from: "deployer", fn: "withdrawAll", expect: "ok" }],
      },
      { baseDir: fixtures },
    );
    const data = runOutput.parse(env.data);
    expect(data.pass).toBe(false);
    expect(data.steps[0]!.pass).toBe(false);
    expect(data.steps[0]!.revert).toContain("nothing to withdraw");
    expect(data.failures[0]).toContain("expected success");
  });

  it("matches a custom error by name on an access-control negative test", async () => {
    const env = await sandboxRun(
      {
        accounts: { mallory: "1 ether" },
        sources: [{ path: "Vault.sol", file: "Vault.sol" }],
        deploy: [{ as: "vault", contract: "SafeVault" }],
        steps: [{ name: "mallory cannot sweep", to: "vault", from: "mallory", fn: "sweep", expect: "revert", revert: "NotOwner" }],
      },
      { baseDir: fixtures },
    );
    const data = runOutput.parse(env.data);
    expect(data.pass).toBe(true);
    expect(data.steps[0]!.revert).toBe("NotOwner()");
  });

  it("drains the vulnerable vault: the reentrancy PoC runs and breaks the invariant", async () => {
    const env = await sandboxRun(exploitPlan("Vault"), { baseDir: fixtures });
    const data = runOutput.parse(env.data);

    expect(data.steps[1]!.ok).toBe(true); // the exploit itself succeeds
    expect(data.balances["$vault"]).toBe("0");
    // 1 ether deposited, 3 taken back out
    expect(BigInt(data.balances["$attacker"]!)).toBe(3n * 10n ** 18n);
    expect(data.invariants[0]!.held).toBe(false);
    expect(data.pass).toBe(false);
    expect(data.failures.join(" ")).toContain("vault keeps alice's deposit");
  });

  it("checks-effects-interactions stops the same PoC", async () => {
    const env = await sandboxRun(exploitPlan("SafeVault"), { baseDir: fixtures });
    const data = runOutput.parse(env.data);

    expect(data.steps[1]!.ok).toBe(false); // pwn reverts
    expect(data.balances["$vault"]).toBe((2n * 10n ** 18n).toString());
    expect(data.invariants[0]!.held).toBe(true);
  });

  it("is deterministic: the same plan yields the same addresses and gas", async () => {
    const plan = {
      accounts: { alice: "10 ether" },
      sources: [{ path: "Vault.sol", file: "Vault.sol" }],
      deploy: [{ as: "vault", contract: "SafeVault" }],
      steps: [{ to: "vault", from: "alice", fn: "deposit", value: "1 ether" }],
    };
    const a = runOutput.parse((await sandboxRun(plan, { baseDir: fixtures })).data);
    const b = runOutput.parse((await sandboxRun(plan, { baseDir: fixtures })).data);
    expect(a.deployed[0]!.address).toBe(b.deployed[0]!.address);
    expect(a.accounts).toEqual(b.accounts);
    expect(a.steps[0]!.gasUsed).toBe(b.steps[0]!.gasUsed);
  });

  it("runs on every hardfork the toolkit advertises", async () => {
    for (const hardfork of ["london", "shanghai", "cancun", "prague", "osaka"]) {
      const env = await sandboxRun(
        {
          hardfork,
          sources: [{ path: "Vault.sol", file: "Vault.sol" }],
          deploy: [{ as: "vault", contract: "SafeVault" }],
        },
        { baseDir: fixtures },
      );
      expect(env.error, `${hardfork} failed`).toBeUndefined();
      expect(runOutput.parse(env.data).hardfork).toBe(hardfork);
    }
  });

  it("fails closed on a malformed plan, an unknown ref, and an unknown hardfork", async () => {
    const bad = await sandboxRun({ sources: [], deploy: [] }, { baseDir: fixtures });
    expect(bad.error?.code).toBe("PLAN_INVALID");

    const ref = await sandboxRun(
      {
        sources: [{ path: "Vault.sol", file: "Vault.sol" }],
        deploy: [{ as: "vault", contract: "SafeVault" }],
        steps: [{ to: "vault", from: "nobody", fn: "deposit" }],
      },
      { baseDir: fixtures },
    );
    expect(ref.error?.code).toBe("ACCOUNT_UNKNOWN");

    const hf = await sandboxRun(
      { hardfork: "byzantium", sources: [{ path: "Vault.sol", file: "Vault.sol" }], deploy: [{ as: "v", contract: "SafeVault" }] },
      { baseDir: fixtures },
    );
    expect(hf.error?.code).toBe("PLAN_INVALID");
  });

  it("compiles multi-file sources through relative imports", async () => {
    const env = await sandboxRun(
      {
        sources: [
          { path: "lib/Errors.sol", content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.28;\nerror Denied();\n" },
          {
            path: "Gate.sol",
            content:
              '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.28;\nimport "./lib/Errors.sol";\ncontract Gate { function open(bool ok) external pure returns (bool) { if (!ok) revert Denied(); return true; } }\n',
          },
        ],
        deploy: [{ as: "gate", contract: "Gate" }],
        steps: [{ to: "gate", from: "deployer", fn: "open", args: [false], expect: "revert", revert: "Denied" }],
      },
      { baseDir: fixtures },
    );
    const data = runOutput.parse(env.data);
    expect(data.pass).toBe(true);
  });

  it("surfaces compiler warnings so a gate can act on them", async () => {
    const env = await sandboxRun(
      {
        sources: [
          {
            path: "Warn.sol",
            content:
              "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.28;\ncontract Warn { function boom() public { selfdestruct(payable(msg.sender)); } }\n",
          },
        ],
        deploy: [{ as: "w", contract: "Warn" }],
      },
      { baseDir: fixtures },
    );
    const data = runOutput.parse(env.data);
    expect(data.warnings.join("\n")).toMatch(/selfdestruct.*deprecated/is);
  });
});

describe("amount parsing", () => {
  it("reads wei, ether and gwei", () => {
    expect(parseAmount("1", "t")).toBe(1n);
    expect(parseAmount("1 ether", "t")).toBe(10n ** 18n);
    expect(parseAmount("0.05 ether", "t")).toBe(5n * 10n ** 16n);
    expect(parseAmount("3 gwei", "t")).toBe(3n * 10n ** 9n);
    expect(parseAmount("1_000", "t")).toBe(1000n);
  });

  it("rejects a vague amount", () => {
    expect(() => parseAmount("a bit", "t")).toThrowError(/cannot read the amount/);
  });
});
