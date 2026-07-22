import { describe, expect, it } from "vitest";
import { learnContract } from "../src/api.ts";
import { contractSourceOutput } from "../src/contract.ts";

// Live: hits Sourcify/Blockscout. Opt in with RUN_LIVE=1.
describe.skipIf(!process.env["RUN_LIVE"])("learn live", () => {
  it("fetches WETH mainnet verified source keyless", async () => {
    const env = await learnContract({ chain: "ethereum", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" });
    expect(env.ok).toBe(true);
    const data = contractSourceOutput.parse(env.data);
    expect(data.verified).toBe(true);
    expect(data.abi.length).toBeGreaterThan(5);
  }, 30000);
});
