import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = new URL("../../../bin/entry.ts", import.meta.url).pathname;

let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "agent-wallet-cli-"));
  env = {
    ...process.env,
    AGENT_WALLET_HOME: home,
    AGENT_WALLET_PASSPHRASE: "cli-test-passphrase",
    AGENT_WALLET_SCRYPT_N: "1024",
  };
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function cli(...args: string[]): { env: any; code: number } {
  // Run in the isolated temp home so the project's .env is never auto-loaded into the test.
  try {
    const out = execFileSync(process.execPath, [BIN, ...args], { encoding: "utf8", env, cwd: home });
    return { env: JSON.parse(out), code: 0 };
  } catch (e: any) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return { env: JSON.parse(out), code: e.status ?? 1 };
  }
}

describe("wallet verbs end to end (real CLI process)", () => {
  it("create, list, addresses round-trip through the binary", () => {
    const created = cli("wallet-create", "--name", "e2e");
    expect(created.code).toBe(0);
    expect(created.env.ok).toBe(true);
    expect(created.env.data.mnemonic.split(" ")).toHaveLength(12);
    expect(created.env.meta.layer).toBe("keys");

    const listed = cli("wallet-list");
    expect(listed.env.data).toHaveLength(1);
    expect(listed.env.data[0].name).toBe("e2e");

    const addrs = cli("wallet-addresses", "--name", "e2e", "--family", "btc", "--network", "signet", "--count", "2");
    expect(addrs.env.ok).toBe(true);
    expect(addrs.env.data).toHaveLength(2);
    expect(addrs.env.data[0].address.startsWith("tb1p")).toBe(true);
  });

  it("imports a known dev mnemonic and derives its known address", () => {
    const imported = cli(
      "wallet-import",
      "--name",
      "imported",
      "--mnemonic",
      "test test test test test test test test test test test junk",
    );
    expect(imported.env.ok).toBe(true);
    expect(imported.env.data.evmAddress).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("fails closed without a passphrase", () => {
    delete env["AGENT_WALLET_PASSPHRASE"];
    const res = cli("wallet-create", "--name", "nope");
    expect(res.code).toBe(2);
    expect(res.env.error.code).toBe("PASSPHRASE_MISSING");
    expect(res.env.error.hint).toContain("AGENT_WALLET_PASSPHRASE");
  });
});
