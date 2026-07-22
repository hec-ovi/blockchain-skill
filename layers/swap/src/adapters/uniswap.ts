import { encodeFunctionData, decodeFunctionResult } from "viem";
import { CodedError } from "../../../core/src/envelope.ts";
import { evmClient } from "../../../chains/src/evm.ts";
import { applySlippage, type QuoteParams, type SwapAdapter, type SwapQuote } from "../port.ts";
import type { EvmChainInfo } from "../../../chains/src/registry.ts";

/**
 * Uniswap v3 QuoterV2 read-only backstop: needs only an RPC, no aggregator API
 * and no key. Quote only (single-venue). Execution calldata for the universal
 * router is out of scope for this version; use kyber or cow to execute.
 */
const QUOTER_V2: Record<number, string> = {
  1: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  10: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  137: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  42161: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  8453: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
};

const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const FEE_TIERS = [500, 3000, 10000];

export const uniswapAdapter: SwapAdapter = {
  name: "uniswap",
  supports(info: EvmChainInfo): boolean {
    return info.chainId in QUOTER_V2;
  },
  async quote(params: QuoteParams): Promise<SwapQuote> {
    const quoter = QUOTER_V2[params.info.chainId];
    if (!quoter) throw new CodedError("SWAP_UNSUPPORTED_CHAIN", `uniswap quoter not configured for ${params.info.name}`);
    const client = evmClient(params.info, params.rpc);
    const slippageBps = params.slippageBps ?? 50;

    let best = 0n;
    let bestFee = 0;
    for (const fee of FEE_TIERS) {
      const data = encodeFunctionData({
        abi: QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn: params.sellToken as `0x${string}`, tokenOut: params.buyToken as `0x${string}`, amountIn: BigInt(params.sellAmount), fee, sqrtPriceLimitX96: 0n }],
      });
      try {
        const { data: ret } = await client.call({ to: quoter as `0x${string}`, data });
        if (!ret) continue;
        const decoded = decodeFunctionResult({ abi: QUOTER_ABI, functionName: "quoteExactInputSingle", data: ret }) as readonly [bigint, bigint, number, bigint];
        const amountOut = decoded[0];
        if (amountOut > best) {
          best = amountOut;
          bestFee = fee;
        }
      } catch {
        /* no pool at this fee tier */
      }
    }
    if (best === 0n) throw new CodedError("SWAP_QUOTE_FAILED", "no uniswap v3 pool found for this pair", "Try kyber, or check the token addresses");

    return {
      adapter: "uniswap",
      chainId: params.info.chainId,
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      buyAmount: best.toString(),
      minBuyAmount: applySlippage(best, slippageBps).toString(),
      spender: quoter,
      execution: { kind: "tx", to: "0x", data: `0xUNISWAP_EXEC_UNSUPPORTED_fee_${bestFee}`, value: "0" },
    };
  },
};
