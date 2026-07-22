import { describe, expect, it } from "vitest";
import { quote } from "../src/api.ts";
import { swapQuoteOutput } from "../src/contract.ts";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";

// Real keyless quotes. Opt in with RUN_LIVE=1.
describe.skipIf(!process.env["RUN_LIVE"])("swap live quotes (keyless)", () => {
  it("CoW quotes 1 WETH -> USDC on mainnet", async () => {
    const env = await quote({ chain: "ethereum", sellToken: WETH, buyToken: USDC, sellAmount: "1000000000000000000", from: HOLDER, adapter: "cow" });
    expect(env.ok).toBe(true);
    expect(BigInt(swapQuoteOutput.parse(env.data).buyAmount)).toBeGreaterThan(0n);
  }, 30000);

  it("Kyber quotes 1 WETH -> USDC on mainnet", async () => {
    const env = await quote({ chain: "ethereum", sellToken: WETH, buyToken: USDC, sellAmount: "1000000000000000000", from: HOLDER, adapter: "kyber" });
    expect(env.ok).toBe(true);
    expect(BigInt(swapQuoteOutput.parse(env.data).buyAmount)).toBeGreaterThan(0n);
  }, 30000);
});
