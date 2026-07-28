/**
 * The two Solidity verbs through the real CLI entry point, end to end:
 * a walk that gates on artifacts, and a sandbox run that compiles, deploys and
 * exercises a contract on an in-process EVM. No network, no funds, no install.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ENTRY = fileURLToPath(new URL("../../../bin/entry.ts", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../../sandbox/fixtures/", import.meta.url));

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "contract-cli-"));
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

function cli(...args: string[]): { out: string; code: number } {
  const env = { ...process.env, AGENT_CONTRACT_WORK: join(work, ".contract-work") };
  try {
    return { out: execFileSync(process.execPath, [ENTRY, ...args], { encoding: "utf8", env, cwd: work }), code: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { out: `${err.stdout ?? ""}${err.stderr ?? ""}`, code: err.status ?? 1 };
  }
}

describe("contract-step through the CLI", () => {
  it("prints the mode picker as plain text an agent can read", () => {
    const { out, code } = cli("contract-step");
    expect(code).toBe(0);
    expect(out).toMatch(/^STEP 00-mode/);
    expect(out).toContain("WORK DIR:");
    expect(out).toContain("NEXT: agent-wallet contract-step --mode <mode>");
  });

  it("walks build in order and gates on the missing artifact", () => {
    expect(cli("contract-step", "--mode", "build").out).toMatch(/^STEP 10-spec {2}\[build, node 1 of 14\]/);

    const blocked = cli("contract-step", "--mode", "build", "--step", "40-implement");
    expect(blocked.code).toBe(1);
    const env = JSON.parse(blocked.out);
    expect(env.error.code).toBe("WALK_BLOCKED");
    expect(env.error.hint).toContain("10-spec");

    writeFileSync(join(work, ".contract-work", "spec.md"), "# spec\n");
    expect(cli("contract-step", "--mode", "build", "--step", "20-threat").out).toContain("STEP 20-threat");
  });

  it("emits an envelope with --json and lists modes with --list", () => {
    const env = JSON.parse(cli("contract-step", "--mode", "review", "--json").out);
    expect(env.ok).toBe(true);
    expect(env.data.step).toBe("10-target");
    expect(env.meta.layer).toBe("workflow");

    const list = JSON.parse(cli("contract-step", "--list").out);
    expect(list.data.modes.map((m: { mode: string }) => m.mode).sort()).toEqual(["build", "review", "ship"]);
  });

  it("reports walk status", () => {
    cli("contract-step", "--mode", "build");
    const env = JSON.parse(cli("contract-step", "--status").out);
    expect(env.data.mode).toBe("build");
    expect(env.data.blockedBy).toBe("10-spec");
  });
});

describe("sandbox-run through the CLI", () => {
  it("compiles, deploys, exercises and reports a broken invariant", () => {
    cpSync(FIXTURES, work, { recursive: true });
    writeFileSync(
      join(work, "plan.json"),
      JSON.stringify({
        accounts: { alice: "10 ether", mallory: "5 ether" },
        sources: [
          { path: "Vault.sol", file: "Vault.sol" },
          { path: "Attacker.sol", file: "Attacker.sol" },
        ],
        deploy: [
          { as: "vault", contract: "Vault", from: "deployer" },
          { as: "attacker", contract: "Attacker", from: "mallory", args: ["$vault"], value: "1 ether" },
        ],
        steps: [
          { name: "alice funds the pool", to: "vault", from: "alice", fn: "deposit", value: "2 ether" },
          { name: "mallory cannot sweep", to: "vault", from: "mallory", fn: "sweep", expect: "revert", revert: "NotOwner" },
          { name: "reentrancy PoC", to: "attacker", from: "mallory", fn: "pwn" },
        ],
        invariants: [{ name: "solvency", to: "vault", fn: "totalHeld", op: "gte", value: "2 ether" }],
      }),
    );

    const { out, code } = cli("sandbox-run", "--plan", "plan.json");
    // The run itself succeeded, so the envelope is ok and the exit is 0. A
    // contract that failed its own plan is a result, and it lives in data.pass.
    expect(code).toBe(0);
    const env = JSON.parse(out);
    expect(env.ok).toBe(true);
    expect(env.data.pass).toBe(false);
    expect(env.data.steps[1].revert).toBe("NotOwner()");
    expect(env.data.balances["$vault"]).toBe("0");
    expect(env.data.failures[0]).toContain("solvency");
  });

  it("fails closed with a hint when the plan is missing or unreadable", () => {
    const missing = JSON.parse(cli("sandbox-run").out);
    expect(missing.error.code).toBe("PLAN_MISSING");
    expect(missing.error.hint).toContain("--plan");

    const bad = JSON.parse(cli("sandbox-run", "--plan", "nope.json").out);
    expect(bad.error.code).toBe("PLAN_UNREADABLE");
  });
});
