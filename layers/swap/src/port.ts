import type { FetchLike } from "../../chains/src/registry.ts";
import type { EvmChainInfo } from "../../chains/src/registry.ts";

/** Normalized quote every adapter returns, amounts in base units as decimal strings. */
export interface SwapQuote {
  adapter: string;
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  /** minimum received after slippage, base units */
  minBuyAmount: string;
  /** spender that must hold ERC-20 allowance before execution (router or vault relayer) */
  spender: string;
  estimatedGas?: string;
  /** adapter-specific data the execution step needs (calldata target, order fields, ...) */
  execution:
    | { kind: "tx"; to: string; data: string; value: string }
    | { kind: "order"; order: Record<string, unknown>; postUrl: string };
}

export interface QuoteParams {
  info: EvmChainInfo;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  from: string;
  receiver?: string;
  /** slippage in basis points (default 50 = 0.5%) */
  slippageBps?: number;
  rpc?: string;
  fetchFn?: FetchLike;
}

export interface SwapAdapter {
  name: string;
  supports(info: EvmChainInfo): boolean;
  quote(params: QuoteParams): Promise<SwapQuote>;
}

export function applySlippage(buyAmount: bigint, slippageBps: number): bigint {
  return (buyAmount * BigInt(10000 - slippageBps)) / 10000n;
}
