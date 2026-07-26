import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const BUNDLE = join(root, "dist", "agent-wallet.mjs");
const LAUNCHER = join(root, "agent-wallet");
const PKG = JSON.parse(execFileSync("cat", [join(root, "package.json")], { encoding: "utf8" }));

function run(
  bin: string,
  args: string[],
  env: Record<string, string | undefined> = {},
): { out: string; code: number } {
  try {
    const out = execFileSync(bin.endsWith(".mjs") ? process.execPath : bin, bin.endsWith(".mjs") ? [bin, ...args] : args, {
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { out, code: 0 };
  } catch (e: any) {
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 };
  }
}

describe("shipped bundle (dist/agent-wallet.mjs)", () => {
  it("exists after build (pretest) and reports the package version", () => {
    expect(existsSync(BUNDLE), "run npm run build").toBe(true);
    const { out, code } = run(BUNDLE, ["version"]);
    expect(code).toBe(0);
    expect(out.trim()).toBe(PKG.version);
  });

  it("init returns a ready envelope without network", () => {
    const home = mkdtempSync(join(tmpdir(), "aw-bundle-init-"));
    const { out, code } = run(BUNDLE, ["init"], {
      AGENT_WALLET_HOME: home,
      AGENT_WALLET_PASSPHRASE: undefined,
    });
    expect(code).toBe(0);
    const env = JSON.parse(out);
    expect(env.ok).toBe(true);
    expect(env.data.ready).toBe(true);
    expect(env.data.version).toBe(PKG.version);
    expect(env.data.home).toBe(home);
  });

  it("wallet-create + wallet-addresses work end-to-end through the bundle", () => {
    const home = mkdtempSync(join(tmpdir(), "aw-bundle-wallet-"));
    const pass = "bundle-e2e-passphrase";
    const env = { AGENT_WALLET_HOME: home, AGENT_WALLET_PASSPHRASE: pass, AGENT_WALLET_SCRYPT_N: "1024" };

    const created = run(BUNDLE, ["wallet-create", "--name", "main"], env);
    expect(created.code).toBe(0);
    const createEnv = JSON.parse(created.out);
    expect(createEnv.ok).toBe(true);
    expect(createEnv.data.mnemonic.split(" ").length).toBe(12);

    const addrs = run(BUNDLE, ["wallet-addresses", "--name", "main", "--family", "evm"], env);
    expect(addrs.code).toBe(0);
    const addrEnv = JSON.parse(addrs.out);
    expect(addrEnv.ok).toBe(true);
    expect(addrEnv.data[0].address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

describe("skill-pack launcher layout (noob /skills add shape)", () => {
  it("root agent-wallet launcher invokes the bundle", () => {
    expect(existsSync(LAUNCHER)).toBe(true);
    chmodSync(LAUNCHER, 0o755);
    const { out, code } = run(LAUNCHER, ["version"]);
    expect(code).toBe(0);
    expect(out.trim()).toBe(PKG.version);
  });
});
