import { CodedError, run, type Envelope } from "../../core/src/envelope.ts";
import { resolveChain, type FetchLike } from "../../chains/src/registry.ts";
import { evmBalance, evmFees, evmTokenBalance, evmTx, type EvmBalance, type EvmFees, type EvmTokenBalance, type EvmTxInfo } from "./evm.ts";
import { btcBalance, btcFees, btcTx, btcUtxos, type BtcBalance, type BtcFees, type BtcTxInfo, type BtcUtxo } from "./btc.ts";

const LAYER = { layer: "read", backend: "auto" };

export interface ReadQuery {
  chain: string;
  address?: string;
  token?: string;
  ref?: string;
  rpc?: string;
  fetchFn?: FetchLike;
}

function need(q: ReadQuery, field: "address" | "ref"): string {
  const v = q[field];
  if (!v) throw new CodedError("PARAM_MISSING", `${field} is required`, `Pass --${field === "ref" ? "hash" : field}`);
  return v;
}

export function balance(q: ReadQuery): Promise<Envelope<EvmBalance | EvmTokenBalance | BtcBalance>> {
  return run({ ...LAYER, chain: q.chain }, async () => {
    const info = await resolveChain(q.chain, q.fetchFn);
    const address = need(q, "address");
    if (info.family === "btc") return btcBalance(info, address, q.fetchFn);
    return q.token ? evmTokenBalance(info, q.token, address, q.rpc) : evmBalance(info, address, q.rpc);
  });
}

export function utxos(q: ReadQuery): Promise<Envelope<BtcUtxo[]>> {
  return run({ ...LAYER, chain: q.chain }, async () => {
    const info = await resolveChain(q.chain, q.fetchFn);
    if (info.family !== "btc") {
      throw new CodedError("FAMILY_MISMATCH", "utxos exist only on Bitcoin networks", "Use balance for EVM chains");
    }
    return btcUtxos(info, need(q, "address"), q.fetchFn);
  });
}

export function fees(q: ReadQuery): Promise<Envelope<EvmFees | BtcFees>> {
  return run({ ...LAYER, chain: q.chain }, async () => {
    const info = await resolveChain(q.chain, q.fetchFn);
    return info.family === "btc" ? btcFees(info, q.fetchFn) : evmFees(info, q.rpc);
  });
}

export function txStatus(q: ReadQuery): Promise<Envelope<EvmTxInfo | BtcTxInfo>> {
  return run({ ...LAYER, chain: q.chain }, async () => {
    const info = await resolveChain(q.chain, q.fetchFn);
    return info.family === "btc" ? btcTx(info, need(q, "ref"), q.fetchFn) : evmTx(info, need(q, "ref"), q.rpc);
  });
}
