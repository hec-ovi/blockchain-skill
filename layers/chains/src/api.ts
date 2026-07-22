import { run, type Envelope } from "../../core/src/envelope.ts";
import { resolveChain, type ChainInfo, type FetchLike } from "./registry.ts";
import { checkEvmChain, type ChainCheck } from "./evm.ts";
import { checkBtcChain, type BtcCheck } from "./btc.ts";

const LAYER = { layer: "chains", backend: "registry" };

export function chainResolve(ref: string | number, fetchFn?: FetchLike): Promise<Envelope<ChainInfo>> {
  return run(LAYER, () => resolveChain(ref, fetchFn));
}

export function chainCheck(ref: string | number, rpcOverride?: string, fetchFn?: FetchLike): Promise<Envelope<ChainCheck | BtcCheck>> {
  return run({ layer: "chains", backend: "probe" }, async () => {
    const info = await resolveChain(ref, fetchFn);
    return info.family === "evm" ? checkEvmChain(info, rpcOverride) : checkBtcChain(info, fetchFn);
  });
}
