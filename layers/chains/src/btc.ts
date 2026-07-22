import { CodedError } from "../../core/src/envelope.ts";
import type { BtcChainInfo } from "./registry.ts";
import type { FetchLike } from "./registry.ts";

/** GET an Esplora path, trying each configured base URL in order. */
export async function esploraGet(info: BtcChainInfo, path: string, fetchFn: FetchLike = fetch): Promise<unknown> {
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
  throw new CodedError("ESPLORA_UNAVAILABLE", lastError || `${info.name} has no Esplora endpoint`, "All Esplora endpoints failed; retry later or configure another endpoint");
}

export type PostLike = (url: string, body: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const defaultPost: PostLike = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "text/plain" }, body });

/** Broadcast a raw tx hex via Esplora POST /tx. */
export async function broadcastBtcTx(info: BtcChainInfo, txHex: string, postFn: PostLike = defaultPost): Promise<string> {
  let lastError = "";
  for (const base of info.esploraUrls) {
    try {
      const res = await postFn(`${base}/tx`, txHex);
      const text = (await res.text()).trim();
      if (res.ok && /^[0-9a-f]{64}$/i.test(text)) return text;
      lastError = `${base}/tx returned ${res.status}: ${text.slice(0, 200)}`;
    } catch (e) {
      lastError = `${base}/tx: ${String(e instanceof Error ? e.message : e)}`;
    }
  }
  throw new CodedError("BROADCAST_FAILED", lastError, "The transaction was rejected or the endpoints are down; nothing was spent unless a node accepted it earlier");
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
