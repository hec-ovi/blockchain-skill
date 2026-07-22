import { whatsabi } from "@shazow/whatsabi";
import { evmClient } from "../../chains/src/evm.ts";
import type { EvmChainInfo } from "../../chains/src/registry.ts";
import type { ContractSource } from "./sources.ts";

/**
 * Last resort for unverified contracts: guess an ABI from on-chain bytecode
 * and resolve proxies. Provider-agnostic; we feed it the viem client.
 */
export async function fromBytecode(info: EvmChainInfo, address: string, rpc?: string): Promise<ContractSource | null> {
  const client = evmClient(info, rpc);
  const code = await client.getCode({ address: address as `0x${string}` });
  if (!code || code === "0x") return null;

  const result = await whatsabi.autoload(address, {
    provider: client,
    followProxies: true,
    // keyless: only the on-chain heuristics, no external ABI loaders
    abiLoader: false,
    signatureLookup: whatsabi.loaders.defaultSignatureLookup,
  });

  const abi = (result.abi ?? []).filter((f: any) => f.type === "function" || f.type === "event");
  const implementation = result.address && result.address.toLowerCase() !== address.toLowerCase() ? result.address : undefined;
  return {
    address,
    chainId: info.chainId,
    verified: false,
    source: "whatsabi",
    abi,
    isProxy: Boolean(implementation),
    ...(implementation && { implementation }),
  };
}
