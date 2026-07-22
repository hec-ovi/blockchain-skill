import { describe, expect, it } from "vitest";
import { quote } from "../src/api.ts";
import { bridgeQuoteOutput } from "../src/contract.ts";

const USDC_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_ARB = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";

// Real keyless LI.FI corridor. Opt in with RUN_LIVE=1.
describe.skipIf(!process.env["RUN_LIVE"])("bridge live quote (keyless LI.FI)", () => {
  it("quotes 100 USDC from Ethereum to Arbitrum", async () => {
    const env = await quote({ fromChain: "ethereum", toChain: "arbitrum", fromToken: USDC_ETH, toToken: USDC_ARB, fromAmount: "100000000", fromAddress: HOLDER });
    expect(env.ok).toBe(true);
    const q = bridgeQuoteOutput.parse(env.data);
    expect(BigInt(q.toAmountMin)).toBeGreaterThan(0n);
    expect(q.transactionRequest.to).toMatch(/^0x/);
  }, 40000);
});
