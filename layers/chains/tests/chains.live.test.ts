import { describe, expect, it } from "vitest";
import { chainCheck } from "../src/api.ts";

// Live probes against public endpoints. Opt in: RUN_LIVE=1 npm test
describe.skipIf(!process.env["RUN_LIVE"])("chains live probes", () => {
  it("sepolia RPC reports the right chain id", async () => {
    const env = await chainCheck("sepolia");
    expect(env.ok).toBe(true);
    expect((env.data as any).match).toBe(true);
  }, 30000);

  it("bitcoin esplora reports a plausible tip height", async () => {
    const env = await chainCheck("bitcoin");
    expect(env.ok).toBe(true);
    expect((env.data as any).tipHeight).toBeGreaterThan(900000);
  }, 30000);
});
