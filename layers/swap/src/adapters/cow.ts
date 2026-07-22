import { CodedError } from "../../../core/src/envelope.ts";
import { applySlippage, type QuoteParams, type SwapAdapter, type SwapQuote } from "../port.ts";
import type { EvmChainInfo } from "../../../chains/src/registry.ts";

/**
 * CoW Protocol: keyless intent/order model. Solvers execute and pay gas; the
 * signed EIP-712 order carries a protocol-enforced limit price. chainId ->
 * api path. GPv2 settlement and vault relayer are the same across networks.
 */
const COW_CHAINS: Record<number, string> = {
  1: "mainnet",
  100: "xdai",
  8453: "base",
  42161: "arbitrum_one",
  137: "polygon",
  43114: "avalanche",
  11155111: "sepolia",
};

// GPv2 canonical addresses (identical on every supported network).
export const GPV2_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
export const GPV2_VAULT_RELAYER = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";

export const COW_ORDER_TYPES = {
  Order: [
    { name: "sellToken", type: "address" },
    { name: "buyToken", type: "address" },
    { name: "receiver", type: "address" },
    { name: "sellAmount", type: "uint256" },
    { name: "buyAmount", type: "uint256" },
    { name: "validTo", type: "uint32" },
    { name: "appData", type: "bytes32" },
    { name: "feeAmount", type: "uint256" },
    { name: "kind", type: "string" },
    { name: "partiallyFillable", type: "bool" },
    { name: "sellTokenBalance", type: "string" },
    { name: "buyTokenBalance", type: "string" },
  ],
} as const;

const ZERO_APPDATA = "0x0000000000000000000000000000000000000000000000000000000000000000";

export const cowAdapter: SwapAdapter = {
  name: "cow",
  supports(info: EvmChainInfo): boolean {
    return info.chainId in COW_CHAINS;
  },
  async quote(params: QuoteParams): Promise<SwapQuote> {
    const seg = COW_CHAINS[params.info.chainId];
    if (!seg) throw new CodedError("SWAP_UNSUPPORTED_CHAIN", `cow has no ${params.info.name} deployment`);
    const fetchFn = (params.fetchFn ?? fetch) as (u: string, o?: any) => Promise<any>;
    const slippageBps = params.slippageBps ?? 50;
    const base = `https://api.cow.fi/${seg}/api/v1`;

    const res = await fetchFn(`${base}/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        receiver: params.receiver ?? params.from,
        from: params.from,
        kind: "sell",
        sellAmountBeforeFee: params.sellAmount,
        signingScheme: "eip712",
        onchainOrder: false,
      }),
    });
    if (!res.ok) throw new CodedError("SWAP_QUOTE_FAILED", `cow quote returned ${res.status}`, "The pair may be unsupported or the amount too small to cover fees");
    const body = await res.json();
    const q = body?.quote;
    if (!q) throw new CodedError("SWAP_QUOTE_FAILED", "cow returned no quote");

    const buyAmount = BigInt(q.buyAmount);
    const minBuy = applySlippage(buyAmount, slippageBps);
    const order = {
      sellToken: q.sellToken,
      buyToken: q.buyToken,
      receiver: q.receiver ?? params.receiver ?? params.from,
      sellAmount: q.sellAmount,
      buyAmount: minBuy.toString(),
      validTo: q.validTo,
      appData: q.appData ?? ZERO_APPDATA,
      feeAmount: q.feeAmount,
      kind: "sell",
      partiallyFillable: false,
      sellTokenBalance: q.sellTokenBalance ?? "erc20",
      buyTokenBalance: q.buyTokenBalance ?? "erc20",
    };

    return {
      adapter: "cow",
      chainId: params.info.chainId,
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: q.sellAmount,
      buyAmount: buyAmount.toString(),
      minBuyAmount: minBuy.toString(),
      spender: GPV2_VAULT_RELAYER,
      execution: { kind: "order", order, postUrl: `${base}/orders` },
    };
  },
};
