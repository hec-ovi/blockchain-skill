import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

const ENTRY = new URL("../../../bin/entry.ts", import.meta.url).pathname;

function cli(...args: string[]): { out: string; code: number } {
  try {
    return { out: execFileSync(process.execPath, [ENTRY, ...args], { encoding: "utf8" }), code: 0 };
  } catch (e: any) {
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 };
  }
}

describe("agent-wallet CLI entry", () => {
  it("prints the package version", () => {
    const pkg = JSON.parse(execFileSync("cat", ["package.json"], { encoding: "utf8" }));
    expect(cli("version").out.trim()).toBe(pkg.version);
  });

  it("lists verbs on help including init", () => {
    const { out } = cli("help");
    expect(out).toContain("agent-wallet <verb>");
    expect(out).toContain("version");
    expect(out).toContain("init");
  });

  it("fails closed on unknown verbs with a steering hint", () => {
    const { out, code } = cli("frobnicate");
    expect(code).toBe(2);
    const env = JSON.parse(out);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("UNKNOWN_VERB");
    expect(env.error.hint).toContain("help");
  });

  it("init verb returns JSON ready report", () => {
    const { out, code } = cli("init");
    expect(code).toBe(0);
    const env = JSON.parse(out);
    expect(env.ok).toBe(true);
    expect(typeof env.data.ready).toBe("boolean");
    expect(Array.isArray(env.data.nextActions)).toBe(true);
  });
});

describe("wallet-import without a secret on the command line", () => {
  // Four scrypt keystore operations; the 5s default is not enough.
  it("takes the mnemonic from an export file and from stdin", { timeout: 60_000 }, () => {
    const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
    const { mkdtempSync, rmSync, readFileSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const { join } = require("node:path") as typeof import("node:path");

    const home = mkdtempSync(join(tmpdir(), "aw-import-"));
    const env = { ...process.env, AGENT_WALLET_HOME: home, AGENT_WALLET_PASSPHRASE: "test-pass-1234" };
    const run = (args: string[], input?: string) =>
      JSON.parse(execFileSync(process.execPath, [ENTRY, ...args], { encoding: "utf8", env, ...(input ? { input } : {}) }));

    try {
      const created = run(["wallet-create", "--name", "src"]);
      const address = created.data.evmAddress;
      const backup = join(home, "backup.json");
      run(["wallet-export", "--name", "src", "--family", "evm", "--include-mnemonic", "--out", backup]);

      const viaFile = run(["wallet-import", "--name", "viafile", "--mnemonic-file", backup]);
      expect(viaFile.ok).toBe(true);
      expect(viaFile.data.evmAddress).toBe(address);

      const words = JSON.parse(readFileSync(backup, "utf8")).mnemonic as string;
      const viaStdin = run(["wallet-import", "--name", "viastdin", "--mnemonic", "-"], `${words}\n`);
      expect(viaStdin.ok).toBe(true);
      expect(viaStdin.data.evmAddress).toBe(address);

      const noWords = join(home, "empty.json");
      writeFileSync(noWords, JSON.stringify({ address }));
      expect(() => run(["wallet-import", "--name", "nope", "--mnemonic-file", noWords])).toThrow();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
