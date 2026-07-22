import { CodedError } from "../../core/src/envelope.ts";
import type { FetchLike } from "../../chains/src/registry.ts";
import type { EvmChainInfo } from "../../chains/src/registry.ts";

export interface ContractSource {
  address: string;
  chainId: number;
  verified: boolean;
  source: "sourcify" | "blockscout" | "etherscan" | "whatsabi";
  name?: string;
  abi: unknown[];
  compilerVersion?: string;
  isProxy?: boolean;
  implementation?: string;
  files?: Record<string, string>;
}

async function getJson(fetchFn: FetchLike, url: string): Promise<any | null> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Sourcify APIv2: keyless verified source + ABI. */
export async function fromSourcify(fetchFn: FetchLike, chainId: number, address: string): Promise<ContractSource | null> {
  const url = `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=abi,metadata,compilation,proxyResolution,sources`;
  const body = await getJson(fetchFn, url);
  if (!body || (!body.abi && !body.metadata)) return null;
  const abi = body.abi ?? body.metadata?.output?.abi ?? [];
  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(body.sources ?? {})) {
    files[path] = (content as { content?: string }).content ?? "";
  }
  const proxy = body.proxyResolution;
  return {
    address,
    chainId,
    verified: true,
    source: "sourcify",
    ...(body.compilation?.name && { name: body.compilation.name }),
    abi,
    ...(body.compilation?.compilerVersion && { compilerVersion: body.compilation.compilerVersion }),
    ...(proxy?.isProxy !== undefined && { isProxy: proxy.isProxy }),
    ...(proxy?.implementations?.[0]?.address && { implementation: proxy.implementations[0].address }),
    ...(Object.keys(files).length > 0 && { files }),
  };
}

/** Blockscout Etherscan-compatible getsourcecode: keyless verified source + ABI + proxy. */
export async function fromBlockscout(fetchFn: FetchLike, info: EvmChainInfo, address: string): Promise<ContractSource | null> {
  const explorer = info.explorers.find((e) => /blockscout/i.test(e)) ?? info.explorers[0];
  if (!explorer) return null;
  const base = explorer.replace(/\/$/, "");
  const body = await getJson(fetchFn, `${base}/api?module=contract&action=getsourcecode&address=${address}`);
  const result = body?.result?.[0];
  if (!result || !result.ABI || result.ABI === "Contract source code not verified") return null;
  let abi: unknown[] = [];
  try {
    abi = JSON.parse(result.ABI);
  } catch {
    return null;
  }
  const files: Record<string, string> = {};
  if (result.SourceCode) files[result.FileName || `${result.ContractName || "Contract"}.sol`] = result.SourceCode;
  return {
    address,
    chainId: info.chainId,
    verified: true,
    source: "blockscout",
    ...(result.ContractName && { name: result.ContractName }),
    abi,
    ...(result.CompilerVersion && { compilerVersion: result.CompilerVersion }),
    isProxy: result.IsProxy === "true" || Boolean(result.Implementation),
    ...(result.Implementation && /^0x[0-9a-fA-F]{40}$/.test(result.Implementation) && { implementation: result.Implementation }),
    ...(Object.keys(files).length > 0 && { files }),
  };
}

/** Etherscan API v2 (multichain, one key): getsourcecode. Needs a key. */
export async function fromEtherscan(fetchFn: FetchLike, chainId: number, address: string, apiKey: string): Promise<ContractSource | null> {
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
  const body = await getJson(fetchFn, url);
  const result = body?.result?.[0];
  if (!result || !result.ABI || result.ABI === "Contract source code not verified") return null;
  let abi: unknown[] = [];
  try {
    abi = JSON.parse(result.ABI);
  } catch {
    return null;
  }
  const files: Record<string, string> = {};
  if (result.SourceCode) files[result.ContractName ? `${result.ContractName}.sol` : "Contract.sol"] = result.SourceCode;
  return {
    address,
    chainId,
    verified: true,
    source: "etherscan",
    ...(result.ContractName && { name: result.ContractName }),
    abi,
    ...(result.CompilerVersion && { compilerVersion: result.CompilerVersion }),
    isProxy: result.Proxy === "1",
    ...(result.Implementation && /^0x[0-9a-fA-F]{40}$/.test(result.Implementation) && { implementation: result.Implementation }),
    ...(Object.keys(files).length > 0 && { files }),
  };
}

/** Ensures the address is 0x + 40 hex, checksummed passthrough. */
export function assertContractAddress(value: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new CodedError("ADDRESS_INVALID", `"${value}" is not a contract address`, "Expect 0x followed by 40 hex characters");
  }
  return value;
}
