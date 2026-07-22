import { CodedError, run, type Envelope } from "../../core/src/envelope.ts";
import { resolveChain, type FetchLike } from "../../chains/src/registry.ts";
import { saveState } from "../../core/src/state.ts";
import { lifiQuote, lifiStatus, type BridgeQuote, type BridgeStatusResult } from "./lifi.ts";
import { executeBridge, type BridgeExecution } from "./execute.ts";

const LAYER = { layer: "bridge", backend: "lifi" };

export interface BridgeQuoteQuery {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  slippage?: number;
  fetchFn?: FetchLike;
}

async function resolveEvm(ref: string, fetchFn?: FetchLike) {
  const info = await resolveChain(ref, fetchFn);
  if (info.family !== "evm") throw new CodedError("FAMILY_MISMATCH", `bridge is EVM-only; "${ref}" is not an EVM chain`, "EVM-to-Bitcoin bridging is not supported yet");
  return info;
}

async function getQuote(q: BridgeQuoteQuery): Promise<BridgeQuote> {
  const [from, to] = await Promise.all([resolveEvm(q.fromChain, q.fetchFn), resolveEvm(q.toChain, q.fetchFn)]);
  return lifiQuote({
    fromChainId: from.chainId,
    toChainId: to.chainId,
    fromToken: q.fromToken,
    toToken: q.toToken,
    fromAmount: q.fromAmount,
    fromAddress: q.fromAddress,
    ...(q.toAddress !== undefined && { toAddress: q.toAddress }),
    ...(q.slippage !== undefined && { slippage: q.slippage }),
    ...(q.fetchFn !== undefined && { fetchFn: q.fetchFn }),
  });
}

export function quote(q: BridgeQuoteQuery): Promise<Envelope<BridgeQuote>> {
  return run({ ...LAYER, chain: q.fromChain }, () => getQuote(q));
}

export interface BridgeExecuteRequest extends BridgeQuoteQuery {
  wallet: string;
  passphrase: string;
  index?: number;
  rpc?: string;
  wait?: boolean;
}

export function bridge(req: BridgeExecuteRequest): Promise<Envelope<BridgeExecution>> {
  return run({ ...LAYER, chain: req.fromChain }, async () => {
    const info = await resolveEvm(req.fromChain, req.fetchFn);
    const q = await getQuote(req);
    const stateName = `bridge-${q.fromChainId}-${q.toChainId}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
    try {
      saveState(stateName, { phase: "quoted", quote: q });
    } catch {
      /* best effort */
    }
    return executeBridge(
      q,
      {
        wallet: req.wallet,
        passphrase: req.passphrase,
        index: req.index ?? 0,
        info,
        ...(req.rpc !== undefined && { rpc: req.rpc }),
        ...(req.fetchFn !== undefined && { fetchFn: req.fetchFn }),
      },
      req.wait ?? false,
    );
  });
}

export interface BridgeStatusQuery {
  txHash: string;
  fromChain?: string;
  toChain?: string;
  tool?: string;
  fetchFn?: FetchLike;
}

export function status(q: BridgeStatusQuery): Promise<Envelope<BridgeStatusResult>> {
  return run({ ...LAYER, backend: "lifi-status" }, async () => {
    const from = q.fromChain ? (await resolveEvm(q.fromChain, q.fetchFn)).chainId : undefined;
    const to = q.toChain ? (await resolveEvm(q.toChain, q.fetchFn)).chainId : undefined;
    return lifiStatus(q.txHash, from, to, q.tool, q.fetchFn);
  });
}
