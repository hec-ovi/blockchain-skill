import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteState, listStates, loadState, saveState } from "../src/state.ts";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "agent-wallet-test-"));
  process.env["AGENT_WALLET_HOME"] = home;
});

afterEach(() => {
  delete process.env["AGENT_WALLET_HOME"];
  rmSync(home, { recursive: true, force: true });
});

describe("state store", () => {
  it("round-trips a value and lists it", () => {
    const path = saveState("swap-0001", { step: "quoted", amountWei: "1000" });
    expect(path).toContain(join("state", "swap-0001.json"));
    expect(loadState("swap-0001")).toEqual({ step: "quoted", amountWei: "1000" });
    expect(listStates()).toEqual(["swap-0001"]);
  });

  it("returns null for missing state and false for deleting missing state", () => {
    expect(loadState("nope")).toBeNull();
    expect(deleteState("nope")).toBe(false);
  });

  it("overwrites atomically and deletes", () => {
    saveState("bridge-1", { step: 1 });
    saveState("bridge-1", { step: 2 });
    expect(loadState("bridge-1")).toEqual({ step: 2 });
    expect(deleteState("bridge-1")).toBe(true);
    expect(listStates()).toEqual([]);
  });

  it("writes files with 0600 permissions", () => {
    const path = saveState("perms", {});
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("fails closed on path-traversal names", () => {
    for (const name of ["../evil", "UPPER", "a/b", ".hidden", ""]) {
      expect(() => saveState(name, {})).toThrowError(/STATE_NAME_INVALID/);
    }
  });
});
