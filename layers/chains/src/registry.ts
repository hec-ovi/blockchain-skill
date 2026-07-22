import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as viemChains from "viem/chains";
import type { Chain } from "viem";
import { CodedError } from "../../core/src/envelope.ts";
import { walletHome } from "../../core/src/home.ts";

export type BtcNetworkName = "bitcoin" | "signet" | "testnet" | "regtest";

export interface EvmChainInfo {
  family: "evm";
  chainId: number;
  name: string;
  shortName?: string;
  rpcUrls: string[];
  explorers: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
  testnet: boolean;
  source: "viem" | "registry";
}

export interface BtcChainInfo {
  family: "btc";
  network: BtcNetworkName;
  name: string;
  esploraUrls: string[];
  bitcoindRpc?: string;
  testnet: boolean;
  source: "builtin";
}

export type ChainInfo = EvmChainInfo | BtcChainInfo;

export const BTC_CHAINS: Record<BtcNetworkName, BtcChainInfo> = {
  bitcoin: {
    family: "btc",
    network: "bitcoin",
    name: "Bitcoin",
    esploraUrls: ["https://mempool.space/api", "https://blockstream.info/api"],
    testnet: false,
    source: "builtin",
  },
  signet: {
    family: "btc",
    network: "signet",
    name: "Bitcoin Signet",
    esploraUrls: ["https://mempool.space/signet/api"],
    testnet: true,
    source: "builtin",
  },
  testnet: {
    family: "btc",
    network: "testnet",
    name: "Bitcoin Testnet4",
    esploraUrls: ["https://mempool.space/testnet4/api"],
    testnet: true,
    source: "builtin",
  },
  regtest: {
    family: "btc",
    network: "regtest",
    name: "Bitcoin Regtest",
    esploraUrls: [],
    bitcoindRpc: "http://127.0.0.1:18443",
    testnet: true,
    source: "builtin",
  },
};

const ALIASES: Record<string, number> = { eth: 1, ethereum: 1, mainnet: 1, anvil: 31337, local: 31337 };

/** Keyless-usable http(s) URLs only: drop websockets and ${API_KEY} templates. */
function usableRpcs(urls: string[]): string[] {
  return urls.filter((u) => /^https?:\/\//.test(u) && !u.includes("${"));
}

function isTestnetName(name: string): boolean {
  return /test|sepolia|goerli|holesky|hoodi|devnet/i.test(name);
}

function fromViem(c: Chain): EvmChainInfo {
  return {
    family: "evm",
    chainId: c.id,
    name: c.name,
    rpcUrls: usableRpcs([...(c.rpcUrls?.default?.http ?? [])]),
    explorers: c.blockExplorers?.default?.url ? [c.blockExplorers.default.url] : [],
    nativeCurrency: c.nativeCurrency,
    testnet: c.testnet ?? isTestnetName(c.name),
    source: "viem",
  };
}

interface RegistryEntry {
  chainId: number;
  name: string;
  shortName?: string | undefined;
  rpc?: string[] | undefined;
  nativeCurrency?: { name: string; symbol: string; decimals: number } | undefined;
  explorers?: Array<{ url: string }> | undefined;
  faucets?: string[] | undefined;
}

const REGISTRY_URL = "https://chainid.network/chains.json";
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;

function cacheFile(): string {
  const dir = join(walletHome(), "cache");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return join(dir, "chains.json");
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

async function loadRegistry(fetchFn: FetchLike): Promise<RegistryEntry[]> {
  try {
    const cached = JSON.parse(readFileSync(cacheFile(), "utf8")) as { fetchedAt: number; entries: RegistryEntry[] };
    if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.entries;
  } catch {
    /* no cache yet */
  }
  const res = await fetchFn(REGISTRY_URL);
  if (!res.ok) {
    throw new CodedError("REGISTRY_UNAVAILABLE", `chainid.network returned ${res.status}`, "Retry later or pass a numeric chain id defined in viem/chains");
  }
  const raw = (await res.json()) as Array<Record<string, unknown>>;
  const entries: RegistryEntry[] = raw.map((c) => ({
    chainId: c["chainId"] as number,
    name: c["name"] as string,
    shortName: c["shortName"] as string | undefined,
    rpc: (c["rpc"] as string[] | undefined) ?? [],
    nativeCurrency: c["nativeCurrency"] as RegistryEntry["nativeCurrency"],
    explorers: (c["explorers"] as Array<{ url: string }> | undefined) ?? [],
    faucets: (c["faucets"] as string[] | undefined) ?? [],
  }));
  writeFileSync(cacheFile(), JSON.stringify({ fetchedAt: Date.now(), entries }), { mode: 0o600 });
  return entries;
}

function fromRegistry(e: RegistryEntry): EvmChainInfo {
  return {
    family: "evm",
    chainId: e.chainId,
    name: e.name,
    ...(e.shortName !== undefined && { shortName: e.shortName }),
    rpcUrls: usableRpcs(e.rpc ?? []),
    explorers: (e.explorers ?? []).map((x) => x.url),
    nativeCurrency: e.nativeCurrency ?? { name: "Ether", symbol: "ETH", decimals: 18 },
    testnet: (e.faucets ?? []).length > 0 || isTestnetName(e.name),
    source: "registry",
  };
}

let viemIndex: { byId: Map<number, Chain>; byName: Map<string, Chain> } | undefined;

function indexViem() {
  if (viemIndex) return viemIndex;
  const byId = new Map<number, Chain>();
  const byName = new Map<string, Chain>();
  for (const [key, value] of Object.entries(viemChains)) {
    const c = value as Chain;
    if (typeof c !== "object" || c === null || typeof c.id !== "number" || !c.rpcUrls) continue;
    if (!byId.has(c.id)) byId.set(c.id, c);
    byName.set(key.toLowerCase(), c);
    byName.set(c.name.toLowerCase(), c);
  }
  viemIndex = { byId, byName };
  return viemIndex;
}

/**
 * Resolve "bitcoin"/"signet"/..., a numeric chain id, a viem chain name, or a
 * chainid.network name/shortName to a ChainInfo. viem wins over the registry.
 */
export async function resolveChain(ref: string | number, fetchFn: FetchLike = fetch): Promise<ChainInfo> {
  const asString = String(ref).trim().toLowerCase();
  if (asString in BTC_CHAINS) return BTC_CHAINS[asString as BtcNetworkName];

  const { byId, byName } = indexViem();
  const aliased = ALIASES[asString];
  const numeric = aliased ?? (/^\d+$/.test(asString) ? Number(asString) : undefined);
  if (numeric !== undefined) {
    const hit = byId.get(numeric);
    if (hit) return fromViem(hit);
  } else {
    const hit = byName.get(asString);
    if (hit) return fromViem(hit);
  }

  const entries = await loadRegistry(fetchFn);
  const entry =
    numeric !== undefined
      ? entries.find((e) => e.chainId === numeric)
      : entries.find((e) => e.shortName?.toLowerCase() === asString) ?? entries.find((e) => e.name.toLowerCase() === asString);
  if (!entry) {
    throw new CodedError(
      "CHAIN_UNKNOWN",
      `cannot resolve chain "${ref}"`,
      "Use a numeric chain id, a name like sepolia or base, or bitcoin/signet/regtest; see chainlist.org for ids",
    );
  }
  const info = fromRegistry(entry);
  if (info.rpcUrls.length === 0) {
    throw new CodedError("CHAIN_NO_RPC", `chain "${entry.name}" has no keyless https RPC endpoints`, "Provide a custom RPC URL via --rpc or config.json");
  }
  return info;
}
