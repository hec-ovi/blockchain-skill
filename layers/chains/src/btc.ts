import { CodedError } from "../../core/src/envelope.ts";
import type { BtcChainInfo } from "./registry.ts";
import type { FetchLike } from "./registry.ts";

/** GET an Esplora path, trying each configured base URL in order. */
export async function esploraGet(info: BtcChainInfo, path: string, fetchFn: FetchLike = fetch): Promise<unknown> {
  if (info.esploraUrls.length === 0) {
    throw new CodedError(
      "BITCOIND_REQUIRED",
      `${info.name} has no public Esplora API`,
      "Run a local bitcoind (regtest) and use the bitcoind-backed verbs, or configure an Esplora URL",
    );
  }
  let lastError = "";
  for (const base of info.esploraUrls) {
    try {
      const res = await fetchFn(`${base}${path}`);
      if (res.ok) return res.json();
      lastError = `${base} returned ${res.status}`;
    } catch (e) {
      lastError = `${base}: ${String(e instanceof Error ? e.message : e)}`;
    }
  }
  throw new CodedError("ESPLORA_UNAVAILABLE", lastError, "All Esplora endpoints failed; retry later or configure another endpoint");
}

export interface BtcCheck {
  network: string;
  tipHeight: number;
  latencyMs: number;
}

export async function checkBtcChain(info: BtcChainInfo, fetchFn: FetchLike = fetch): Promise<BtcCheck> {
  const started = performance.now();
  const height = (await esploraGet(info, "/blocks/tip/height", fetchFn)) as number;
  return { network: info.network, tipHeight: height, latencyMs: Math.round(performance.now() - started) };
}
