import { CodedError, run, type Envelope } from "../../core/src/envelope.ts";
import { resolveChain, type FetchLike } from "../../chains/src/registry.ts";
import { saveState } from "../../core/src/state.ts";
import { cowAdapter } from "./adapters/cow.ts";
import { kyberAdapter } from "./adapters/kyber.ts";
import { uniswapAdapter } from "./adapters/uniswap.ts";
import { executeSwap, type SwapExecution } from "./execute.ts";
import type { SwapAdapter, SwapQuote } from "./port.ts";
import { isNativeToken, unwrapNative, wrapNative, wethAddress, type WrapRequest, type WrapResult } from "./wrap.ts";

const LAYER = { layer: "swap", backend: "multi" };
const ADAPTERS: SwapAdapter[] = [cowAdapter, kyberAdapter, uniswapAdapter];

export function adapterByName(name: string): SwapAdapter | undefined {
  return ADAPTERS.find((a) => a.name === name);
}

export interface SwapQuoteQuery {
  chain: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  from: string;
  receiver?: string;
  slippageBps?: number;
  adapter?: string;
  rpc?: string;
  fetchFn?: FetchLike;
}

async function bestQuote(q: SwapQuoteQuery): Promise<SwapQuote> {
  const info = await resolveChain(q.chain, q.fetchFn);
  if (info.family !== "evm") throw new CodedError("FAMILY_MISMATCH", "swaps are EVM-only in this version", "Bitcoin swaps are not supported yet");
  // Aggregators cannot sell bare native; map to WETH and require the caller to hold WETH
  // (use `wrap` first). Buy-side native is left as-is for adapters that accept it.
  let sellToken = q.sellToken;
  if (isNativeToken(sellToken)) {
    try {
      sellToken = wethAddress(info.chainId);
    } catch {
      throw new CodedError(
        "SWAP_NATIVE_UNSUPPORTED",
        "cannot sell native coin as-is on this chain",
        "Wrap first: agent-wallet wrap <chain> --amount <eth> --wallet main, then sell the WETH address",
      );
    }
  }
  const params = {
    info,
    sellToken,
    buyToken: q.buyToken,
    sellAmount: q.sellAmount,
    from: q.from,
    ...(q.receiver !== undefined && { receiver: q.receiver }),
    ...(q.slippageBps !== undefined && { slippageBps: q.slippageBps }),
    ...(q.rpc !== undefined && { rpc: q.rpc }),
    ...(q.fetchFn !== undefined && { fetchFn: q.fetchFn }),
  };

  if (q.adapter) {
    const chosen = adapterByName(q.adapter);
    if (!chosen) throw new CodedError("SWAP_ADAPTER_UNKNOWN", `no swap adapter "${q.adapter}"`, `Known: ${ADAPTERS.map((a) => a.name).join(", ")}`);
    if (!chosen.supports(info)) throw new CodedError("SWAP_UNSUPPORTED_CHAIN", `${q.adapter} does not support ${info.name}`);
    return chosen.quote(params);
  }

  const supported = ADAPTERS.filter((a) => a.supports(info));
  if (supported.length === 0) throw new CodedError("SWAP_UNSUPPORTED_CHAIN", `no swap adapter supports ${info.name}`, "Pass a custom router or use a different chain");
  const results = await Promise.allSettled(supported.map((a) => a.quote(params)));
  const quotes = results.filter((r): r is PromiseFulfilledResult<SwapQuote> => r.status === "fulfilled").map((r) => r.value);
  if (quotes.length === 0) {
    const reason = results.map((r) => (r.status === "rejected" ? String(r.reason?.message ?? r.reason) : "")).find(Boolean);
    throw new CodedError("SWAP_QUOTE_FAILED", `no adapter could quote this pair: ${reason ?? "unknown"}`, "Check token addresses and liquidity");
  }
  return quotes.sort((a, b) => (BigInt(b.buyAmount) > BigInt(a.buyAmount) ? 1 : -1))[0]!;
}

export function quote(q: SwapQuoteQuery): Promise<Envelope<SwapQuote>> {
  return run({ ...LAYER, chain: q.chain }, () => bestQuote(q));
}

export interface SwapExecuteRequest extends SwapQuoteQuery {
  wallet: string;
  passphrase: string;
  index?: number;
  wait?: boolean;
}

export function wrap(req: WrapRequest): Promise<Envelope<WrapResult>> {
  return run({ ...LAYER, backend: "weth", chain: req.chain }, () => wrapNative(req));
}

export function unwrap(req: WrapRequest): Promise<Envelope<WrapResult>> {
  return run({ ...LAYER, backend: "weth", chain: req.chain }, () => unwrapNative(req));
}

export function swap(req: SwapExecuteRequest): Promise<Envelope<SwapExecution>> {
  return run({ ...LAYER, chain: req.chain }, async () => {
    const info = await resolveChain(req.chain, req.fetchFn);
    if (info.family !== "evm") throw new CodedError("FAMILY_MISMATCH", "swaps are EVM-only in this version");
    if (isNativeToken(req.sellToken)) {
      throw new CodedError(
        "SWAP_NATIVE_UNSUPPORTED",
        "cannot sell native coin directly",
        `Wrap first: agent-wallet wrap ${req.chain} --amount-raw ${req.sellAmount} --wallet ${req.wallet} --wait, then swap sell=${wethAddress(info.chainId)}`,
      );
    }
    const q = await bestQuote(req);
    // Note-taking: persist the quote before execution so a failed broadcast is resumable.
    const stateName = `swap-${info.chainId}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
    try {
      saveState(stateName, { phase: "quoted", quote: q });
    } catch {
      /* state is best-effort */
    }
    return executeSwap(
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
