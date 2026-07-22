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

/**
 * JSON-RPC call to a bitcoind node (regtest and self-hosted setups).
 * URL carries basic auth: http://user:pass@host:port. Override the builtin
 * default with AGENT_WALLET_BITCOIND_URL.
 */
export async function bitcoindCall(info: BtcChainInfo, method: string, params: unknown[] = []): Promise<unknown> {
  const raw = process.env["AGENT_WALLET_BITCOIND_URL"] ?? info.bitcoindRpc;
  if (!raw) {
    throw new CodedError("BITCOIND_REQUIRED", `${info.name} has no bitcoind RPC configured`, "Set AGENT_WALLET_BITCOIND_URL to http://user:pass@host:port");
  }
  const url = new URL(raw);
  const auth = url.username ? `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString("base64")}` : undefined;
  const res = await fetch(`${url.protocol}//${url.host}${url.pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth && { authorization: auth }) },
    body: JSON.stringify({ jsonrpc: "1.0", id: "agent-wallet", method, params }),
  });
  const body = (await res.json().catch(() => null)) as { result?: unknown; error?: { code: number; message: string } } | null;
  if (!body || body.error) {
    throw new CodedError(
      "BITCOIND_ERROR",
      body?.error ? `${method}: ${body.error.message}` : `${method}: HTTP ${res.status}`,
      "Check the node is running and AGENT_WALLET_BITCOIND_URL credentials are right",
    );
  }
  return body.result;
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
