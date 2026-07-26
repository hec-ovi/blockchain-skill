import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initToolkit, toolkitVersion } from "../src/init.ts";

describe("init doctor", () => {
  it("reports ready with a writable home and steers on missing passphrase", async () => {
    const home = mkdtempSync(join(tmpdir(), "aw-init-"));
    const prevHome = process.env["AGENT_WALLET_HOME"];
    const prevPass = process.env["AGENT_WALLET_PASSPHRASE"];
    delete process.env["AGENT_WALLET_PASSPHRASE"];
    process.env["AGENT_WALLET_HOME"] = home;
    try {
      const env = await initToolkit();
      expect(env.ok).toBe(true);
      expect(env.data?.ready).toBe(true);
      expect(env.data?.nodeOk).toBe(true);
      expect(env.data?.home).toBe(home);
      expect(env.data?.passphraseSet).toBe(false);
      expect(env.data?.version).toBe(toolkitVersion());
      expect(env.data?.capabilities.length).toBeGreaterThan(5);
      expect(env.data?.nextActions.some((a) => a.includes("AGENT_WALLET_PASSPHRASE"))).toBe(true);
      expect(env.data?.notes.some((n) => /mainnet/i.test(n))).toBe(true);
    } finally {
      if (prevHome === undefined) delete process.env["AGENT_WALLET_HOME"];
      else process.env["AGENT_WALLET_HOME"] = prevHome;
      if (prevPass === undefined) delete process.env["AGENT_WALLET_PASSPHRASE"];
      else process.env["AGENT_WALLET_PASSPHRASE"] = prevPass;
    }
  });

  it("marks passphrase set when the env var is present", async () => {
    const home = mkdtempSync(join(tmpdir(), "aw-init-pass-"));
    const prevHome = process.env["AGENT_WALLET_HOME"];
    const prevPass = process.env["AGENT_WALLET_PASSPHRASE"];
    process.env["AGENT_WALLET_HOME"] = home;
    process.env["AGENT_WALLET_PASSPHRASE"] = "test-passphrase-not-for-prod";
    try {
      const env = await initToolkit();
      expect(env.ok).toBe(true);
      expect(env.data?.passphraseSet).toBe(true);
      expect(env.data?.nextActions.some((a) => a.includes("wallet-create"))).toBe(true);
    } finally {
      if (prevHome === undefined) delete process.env["AGENT_WALLET_HOME"];
      else process.env["AGENT_WALLET_HOME"] = prevHome;
      if (prevPass === undefined) delete process.env["AGENT_WALLET_PASSPHRASE"];
      else process.env["AGENT_WALLET_PASSPHRASE"] = prevPass;
    }
  });
});
