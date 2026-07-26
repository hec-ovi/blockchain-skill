import { encodeFunctionData, decodeFunctionResult } from "viem";
import { CodedError } from "../../../core/src/envelope.ts";
import { evmClient } from "../../../chains/src/evm.ts";
import { applySlippage, type QuoteParams, type SwapAdapter, type SwapQuote } from "../port.ts";
import type { EvmChainInfo } from "../../../chains/src/registry.ts";

/**
 * Uniswap v3: QuoterV2 for quotes; SwapRouter02 for execution where configured.
 * Sepolia is included so testnets can prove token exchange without aggregator keys.
 */
const DEPLOYMENTS: Record<number, { quoter: string; router: string }> = {
  1: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  10: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  137: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  42161: {
    quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
    router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  },
  8453: {
    quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  },
  // Sepolia Uniswap v3 (official deployments)
  11155111: {
    quoter: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    router: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  },
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

const ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const FEE_TIERS = [500, 3000, 10000];

export const uniswapAdapter: SwapAdapter = {
  name: "uniswap",
  supports(info: EvmChainInfo): boolean {
    return info.chainId in DEPLOYMENTS;
  },
  async quote(params: QuoteParams): Promise<SwapQuote> {
    const dep = DEPLOYMENTS[params.info.chainId];
    if (!dep) throw new CodedError("SWAP_UNSUPPORTED_CHAIN", `uniswap not configured for ${params.info.name}`);
    const client = evmClient(params.info, params.rpc);
    const slippageBps = params.slippageBps ?? 50;

    let best = 0n;
    let bestFee = 0;
    for (const fee of FEE_TIERS) {
      const data = encodeFunctionData({
        abi: QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: params.sellToken as `0x${string}`,
            tokenOut: params.buyToken as `0x${string}`,
            amountIn: BigInt(params.sellAmount),
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      try {
        const { data: ret } = await client.call({ to: dep.quoter as `0x${string}`, data });
        if (!ret) continue;
        const decoded = decodeFunctionResult({
          abi: QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          data: ret,
        }) as readonly [bigint, bigint, number, bigint];
        const amountOut = decoded[0];
        if (amountOut > best) {
          best = amountOut;
          bestFee = fee;
        }
      } catch {
        /* no pool at this fee tier */
      }
    }
    if (best === 0n) {
      throw new CodedError(
        "SWAP_QUOTE_FAILED",
        "no uniswap v3 pool found for this pair",
        "Try another adapter, or wrap native ETH to WETH first then sell WETH",
      );
    }

    const minBuy = applySlippage(best, slippageBps);
    const data = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.sellToken as `0x${string}`,
          tokenOut: params.buyToken as `0x${string}`,
          fee: bestFee,
          recipient: (params.receiver ?? params.from) as `0x${string}`,
          amountIn: BigInt(params.sellAmount),
          amountOutMinimum: minBuy,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    return {
      adapter: "uniswap",
      chainId: params.info.chainId,
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      buyAmount: best.toString(),
      minBuyAmount: minBuy.toString(),
      spender: dep.router,
      execution: { kind: "tx", to: dep.router, data, value: "0" },
    };
  },
};
