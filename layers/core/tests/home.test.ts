/**
 * Regression: running a verb from a subdirectory must behave exactly like
 * running it from the project root. A live agent run cd'd into its scratch dir
 * and lost both the passphrase and the wallet home, which read as
 * PASSPHRASE_MISSING and a vanished keystore.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadDotenv, dotenvDir, resetDotenv } from "../src/dotenv.ts";
import { walletHome } from "../src/home.ts";

let root: string;
let cwd: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aw-home-"));
  cwd = process.cwd();
  resetDotenv();
  for (const k of ["AGENT_WALLET_HOME", "AGENT_WALLET_PASSPHRASE"]) delete process.env[k];
});

afterEach(() => {
  process.chdir(cwd);
  for (const k of ["AGENT_WALLET_HOME", "AGENT_WALLET_PASSPHRASE"]) delete process.env[k];
  resetDotenv();
  rmSync(root, { recursive: true, force: true });
});

describe("dotenv discovery", () => {
  it("finds .env by walking up from a nested working directory", () => {
    writeFileSync(join(root, ".env"), "AGENT_WALLET_PASSPHRASE=from-root\nAGENT_WALLET_HOME=./.agent-wallet-data\n");
    const nested = join(root, ".contract-work", "deep");
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    loadDotenv();

    expect(process.env["AGENT_WALLET_PASSPHRASE"]).toBe("from-root");
    expect(dotenvDir()).toBe(resolve(root));
  });

  it("leaves a real environment variable untouched", () => {
    process.env["AGENT_WALLET_PASSPHRASE"] = "from-env";
    writeFileSync(join(root, ".env"), "AGENT_WALLET_PASSPHRASE=from-file\n");
    process.chdir(root);

    loadDotenv();

    expect(process.env["AGENT_WALLET_PASSPHRASE"]).toBe("from-env");
  });

  it("is fine with no .env anywhere up the tree", () => {
    process.chdir(root);
    expect(() => loadDotenv(root)).not.toThrow();
    expect(dotenvDir()).toBe(resolve(root));
  });
});

describe("walletHome", () => {
  it("resolves a relative AGENT_WALLET_HOME against the project root, not cwd", () => {
    writeFileSync(join(root, ".env"), "AGENT_WALLET_HOME=./.agent-wallet-data\n");
    const nested = join(root, ".contract-work");
    mkdirSync(nested, { recursive: true });

    process.chdir(root);
    loadDotenv();
    const fromRoot = walletHome();

    process.chdir(nested);
    const fromSubdir = walletHome();

    expect(fromSubdir).toBe(fromRoot);
    expect(fromRoot).toBe(resolve(root, ".agent-wallet-data"));
    // and no phantom keystore dir was created beside the scratch files
    expect(existsSync(join(nested, ".agent-wallet-data"))).toBe(false);
  });

  it("honours an absolute AGENT_WALLET_HOME unchanged", () => {
    const abs = join(root, "explicit-home");
    process.env["AGENT_WALLET_HOME"] = abs;
    process.chdir(root);
    expect(walletHome()).toBe(abs);
  });

  it("defaults to ~/.agent-wallet when nothing is set", () => {
    process.chdir(root);
    expect(walletHome()).toBe(resolve(process.env["HOME"] ?? "", ".agent-wallet"));
  });
});
