import { CodedError } from "../../core/src/envelope.ts";
import type { FetchLike } from "../../chains/src/registry.ts";

const LIFI_BASE = "https://li.quest/v1";

/** Optional key raises rate limits; the API is fully usable without one. */
function headers(): Record<string, string> {
  const key = process.env["LIFI_API_KEY"];
  return { "content-type": "application/json", ...(key ? { "x-lifi-api-key": key } : {}) };
}

export interface BridgeQuoteParams {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  /** slippage fraction 0..1 (default 0.005) */
  slippage?: number;
  fetchFn?: FetchLike;
}

export interface BridgeQuote {
  tool: string;
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  approvalAddress?: string;
  executionDurationSec?: number;
  transactionRequest: { to: string; data: string; value: string; chainId: number };
}

export async function lifiQuote(params: BridgeQuoteParams): Promise<BridgeQuote> {
  const fetchFn = (params.fetchFn ?? fetch) as (u: string, o?: any) => Promise<any>;
  const q = new URLSearchParams({
    fromChain: String(params.fromChainId),
    toChain: String(params.toChainId),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    ...(params.toAddress ? { toAddress: params.toAddress } : {}),
    slippage: String(params.slippage ?? 0.005),
  });
  const res = await fetchFn(`${LIFI_BASE}/quote?${q.toString()}`, { headers: headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new CodedError("BRIDGE_QUOTE_FAILED", `lifi quote returned ${res.status}: ${text.slice(0, 200)}`, "No route for this pair/amount; try a larger amount or a different token");
  }
  const body = await res.json();
  const tr = body?.transactionRequest;
  const est = body?.estimate;
  if (!tr || !est) throw new CodedError("BRIDGE_QUOTE_FAILED", "lifi returned no route", "The corridor may be unavailable right now");
  return {
    tool: body.tool ?? "lifi",
    fromChainId: params.fromChainId,
    toChainId: params.toChainId,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: est.fromAmount,
    toAmount: est.toAmount,
    toAmountMin: est.toAmountMin,
    ...(est.approvalAddress && { approvalAddress: est.approvalAddress }),
    ...(est.executionDuration && { executionDurationSec: Number(est.executionDuration) }),
    transactionRequest: {
      to: tr.to,
      data: tr.data,
      value: tr.value ? BigInt(tr.value).toString() : "0",
      chainId: tr.chainId ?? params.fromChainId,
    },
  };
}

export type BridgeStatus = "NOT_FOUND" | "PENDING" | "DONE" | "FAILED" | "INVALID";

export interface BridgeStatusResult {
  status: BridgeStatus;
  substatus?: string;
  substatusMessage?: string;
  sendingTxHash?: string;
  receivingTxHash?: string;
}

export async function lifiStatus(txHash: string, fromChainId?: number, toChainId?: number, tool?: string, fetchFn?: FetchLike): Promise<BridgeStatusResult> {
  const fn = (fetchFn ?? fetch) as (u: string, o?: any) => Promise<any>;
  const q = new URLSearchParams({ txHash, ...(fromChainId && { fromChain: String(fromChainId) }), ...(toChainId && { toChain: String(toChainId) }), ...(tool && { bridge: tool }) });
  const res = await fn(`${LIFI_BASE}/status?${q.toString()}`, { headers: headers() });
  if (!res.ok) throw new CodedError("BRIDGE_STATUS_FAILED", `lifi status returned ${res.status}`, "Retry; cross-chain status can lag the source tx");
  const body = await res.json();
  return {
    status: (body?.status ?? "NOT_FOUND") as BridgeStatus,
    ...(body?.substatus && { substatus: body.substatus }),
    ...(body?.substatusMessage && { substatusMessage: body.substatusMessage }),
    ...(body?.sending?.txHash && { sendingTxHash: body.sending.txHash }),
    ...(body?.receiving?.txHash && { receivingTxHash: body.receiving.txHash }),
  };
}
