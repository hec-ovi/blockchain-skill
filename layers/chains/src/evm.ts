import { createPublicClient, defineChain, fallback, http, type Chain, type PublicClient } from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import type { EvmChainInfo } from "./registry.ts";

/** viem Chain object for any resolved chain, custom RPC override first. */
export function toViemChain(info: EvmChainInfo, rpcOverride?: string): Chain {
  const urls = rpcOverride ? [rpcOverride, ...info.rpcUrls] : info.rpcUrls;
  if (urls.length === 0) {
    throw new CodedError("CHAIN_NO_RPC", `chain "${info.name}" has no usable RPC endpoints`, "Pass --rpc <url> or add one to config.json");
  }
  return defineChain({
    id: info.chainId,
    name: info.name,
    nativeCurrency: info.nativeCurrency,
    rpcUrls: { default: { http: urls } },
    testnet: info.testnet,
  });
}

/** Public client with ranked fallback across every known RPC for the chain. */
export function evmClient(info: EvmChainInfo, rpcOverride?: string): PublicClient {
  const chain = toViemChain(info, rpcOverride);
  const transports = chain.rpcUrls.default.http.map((u) => http(u));
  const transport = transports.length === 1 ? transports[0]! : fallback(transports, { rank: true });
  return createPublicClient({ chain, transport });
}

export interface ChainCheck {
  chainId: number;
  reportedChainId: number;
  match: boolean;
  blockNumber: string;
  latencyMs: number;
}

/** Live probe: verifies the RPC really serves the chain id it claims. */
export async function checkEvmChain(info: EvmChainInfo, rpcOverride?: string): Promise<ChainCheck> {
  const client = evmClient(info, rpcOverride);
  const started = performance.now();
  const [reported, block] = await Promise.all([client.getChainId(), client.getBlockNumber()]);
  return {
    chainId: info.chainId,
    reportedChainId: reported,
    match: reported === info.chainId,
    blockNumber: block.toString(),
    latencyMs: Math.round(performance.now() - started),
  };
}
