import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compile } from "../src/api.ts";
import { compiledOutput } from "../src/contract.ts";

const COUNTER = readFileSync(new URL("../fixtures/Counter.sol", import.meta.url), "utf8");

describe("compile (solc-js, in-process)", () => {
  it("compiles Counter.sol to abi + bytecode", async () => {
    const env = await compile(COUNTER, "Counter.sol");
    expect(env.ok).toBe(true);
    const contracts = compiledOutput.parse(env.data);
    const counter = contracts.find((c) => c.contractName === "Counter");
    expect(counter).toBeDefined();
    expect(counter!.bytecode.startsWith("0x")).toBe(true);
    expect(counter!.bytecode.length).toBeGreaterThan(100);
    expect(counter!.compilerVersion).toContain("0.8");
    const fnNames = (counter!.abi as any[]).filter((i) => i.type === "function").map((i) => i.name);
    expect(fnNames).toEqual(expect.arrayContaining(["count", "increment", "add", "owner"]));
  });

  it("fails closed with the compiler message on a syntax error", async () => {
    const env = await compile("pragma solidity ^0.8.20; contract Broken { function x( }", "Broken.sol");
    expect(env.error?.code).toBe("COMPILE_FAILED");
    expect(env.error?.hint).toMatch(/error|expected/i);
  });

  it("reports NO_DEPLOYABLE_CONTRACT for an interface-only source", async () => {
    const env = await compile("pragma solidity ^0.8.20; interface IFoo { function f() external; }", "IFoo.sol");
    expect(env.error?.code).toBe("NO_DEPLOYABLE_CONTRACT");
  });
});

describe("verify (wired to the CLI, forge-backed)", () => {
  it("fails closed with FORGE_MISSING or reports the verifier's answer", async () => {
    const { verify } = await import("../src/api.ts");
    const env = await verify({
      chainId: 11155111,
      address: "0x0000000000000000000000000000000000000001",
      projectDir: "/nonexistent-project",
      contractPath: "src/X.sol:X",
    });
    // Without forge this is FORGE_MISSING; with forge it runs and reports
    // verified:false. Either way the layer never throws and never claims true.
    if (env.ok) {
      expect(env.data!.verified).toBe(false);
      expect(env.data!.verifier).toBe("sourcify");
    } else {
      expect(["FORGE_MISSING", "VERIFY_FAILED"]).toContain(env.error!.code);
    }
  });
});
