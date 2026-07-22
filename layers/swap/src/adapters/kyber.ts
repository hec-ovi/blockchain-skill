import { CodedError } from "../../../core/src/envelope.ts";
import { applySlippage, type QuoteParams, type SwapAdapter, type SwapQuote } from "../port.ts";
import type { EvmChainInfo } from "../../../chains/src/registry.ts";

/** KyberSwap aggregator: keyless, self-chosen client id. chainId -> path segment. */
const KYBER_CHAINS: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  56: "bsc",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
  43114: "avalanche",
  59144: "linea",
  534352: "scroll",
};

const CLIENT_ID = "agent-wallet";

async function getJson(fetchFn: (u: string) => Promise<any>, url: string, ctx: string): Promise<any> {
  const res = await fetchFn(url);
  if (!res.ok) throw new CodedError("SWAP_QUOTE_FAILED", `kyber ${ctx} returned ${res.status}`, "Try another adapter or check the token addresses");
  return res.json();
}

export const kyberAdapter: SwapAdapter = {
  name: "kyber",
  supports(info: EvmChainInfo): boolean {
    return info.chainId in KYBER_CHAINS;
  },
  async quote(params: QuoteParams): Promise<SwapQuote> {
    const seg = KYBER_CHAINS[params.info.chainId];
    if (!seg) throw new CodedError("SWAP_UNSUPPORTED_CHAIN", `kyber has no ${params.info.name} deployment`);
    const fetchFn = (params.fetchFn ?? fetch) as (u: string, o?: any) => Promise<any>;
    const slippageBps = params.slippageBps ?? 50;
    const base = `https://aggregator-api.kyberswap.com/${seg}/api/v1`;

    const routeUrl = `${base}/routes?tokenIn=${params.sellToken}&tokenOut=${params.buyToken}&amountIn=${params.sellAmount}`;
    const route = await getJson((u) => fetchFn(u, { headers: { "x-client-id": CLIENT_ID } }), routeUrl, "routes");
    const summary = route?.data?.routeSummary;
    if (!summary) throw new CodedError("SWAP_QUOTE_FAILED", "kyber returned no route", "The pair may lack liquidity on this chain");

    const buildUrl = `${base}/route/build`;
    const buildRes = await fetchFn(buildUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-id": CLIENT_ID },
      body: JSON.stringify({
        routeSummary: summary,
        sender: params.from,
        recipient: params.receiver ?? params.from,
        slippageTolerance: slippageBps,
      }),
    });
    if (!buildRes.ok) throw new CodedError("SWAP_BUILD_FAILED", `kyber build returned ${buildRes.status}`, "Retry the quote; routes expire quickly");
    const build = await buildRes.json();
    const data = build?.data;
    if (!data?.data || !data?.routerAddress) throw new CodedError("SWAP_BUILD_FAILED", "kyber build returned no calldata");

    const buyAmount = BigInt(summary.amountOut);
    return {
      adapter: "kyber",
      chainId: params.info.chainId,
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      sellAmount: params.sellAmount,
      buyAmount: buyAmount.toString(),
      minBuyAmount: applySlippage(buyAmount, slippageBps).toString(),
      spender: data.routerAddress,
      ...(summary.gas && { estimatedGas: String(summary.gas) }),
      execution: { kind: "tx", to: data.routerAddress, data: data.data, value: "0" },
    };
  },
};
