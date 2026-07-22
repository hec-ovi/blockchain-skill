import { CodedError } from "../../core/src/envelope.ts";
import { loadConfig } from "../../core/src/config.ts";

export type FaucetNetwork = "base-sepolia" | "ethereum-sepolia";

/** CDP faucet networks and the friendly aliases we accept. */
const NETWORKS: Record<string, FaucetNetwork> = {
  "base-sepolia": "base-sepolia",
  "base-testnet": "base-sepolia",
  "ethereum-sepolia": "ethereum-sepolia",
  sepolia: "ethereum-sepolia",
};

export type FaucetToken = "eth" | "usdc" | "eurc" | "cbbtc";

export interface FaucetCredentials {
  apiKeyId: string;
  apiKeySecret: string;
}

/** Read the free CDP API key from env or config.json (faucet section). Only the key is needed, no wallet secret. */
export function cdpCredentials(): FaucetCredentials {
  const cfg = (loadConfig()["faucet"] ?? {}) as { cdpApiKeyId?: string; cdpApiKeySecret?: string };
  const apiKeyId = process.env["CDP_API_KEY_ID"] ?? cfg.cdpApiKeyId;
  const apiKeySecret = process.env["CDP_API_KEY_SECRET"] ?? cfg.cdpApiKeySecret;
  if (!apiKeyId || !apiKeySecret) {
    throw new CodedError(
      "FAUCET_KEY_MISSING",
      "no CDP faucet credentials found",
      "Get a free key at portal.cdp.coinbase.com, then set CDP_API_KEY_ID and CDP_API_KEY_SECRET (or faucet.cdpApiKeyId / faucet.cdpApiKeySecret in config.json)",
    );
  }
  return { apiKeyId, apiKeySecret };
}

export function resolveFaucetNetwork(ref: string): FaucetNetwork {
  const net = NETWORKS[ref.toLowerCase()];
  if (!net) {
    throw new CodedError("FAUCET_NETWORK_UNSUPPORTED", `the faucet does not support "${ref}"`, `Supported: ${[...new Set(Object.values(NETWORKS))].join(", ")}`);
  }
  return net;
}

export interface FaucetDrip {
  network: string;
  address: string;
  token: FaucetToken;
  transactionHash: string;
  explorer: string;
}

const EXPLORER: Record<string, string> = {
  "base-sepolia": "https://sepolia.basescan.org/tx/",
  "ethereum-sepolia": "https://sepolia.etherscan.io/tx/",
};

/**
 * Request test funds from the Coinbase CDP faucet into an arbitrary address.
 * Headless: needs only the free API key, no browser, no captcha. Testnet only.
 */
export async function cdpFaucet(address: string, networkRef: string, token: FaucetToken): Promise<FaucetDrip> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new CodedError("ADDRESS_INVALID", `"${address}" is not an EVM address`);
  }
  const network = resolveFaucetNetwork(networkRef);
  const { apiKeyId, apiKeySecret } = cdpCredentials();

  // Lazy import so the SDK is only loaded when the faucet is actually used.
  const { CdpClient } = await import("@coinbase/cdp-sdk");
  const cdp = new CdpClient({ apiKeyId, apiKeySecret });
  let result: { transactionHash: string };
  try {
    result = await cdp.evm.requestFaucet({ address: address as `0x${string}`, network, token });
  } catch (e) {
    const msg = String((e as { message?: string })?.message ?? e);
    throw new CodedError("FAUCET_FAILED", msg.slice(0, 400), "Check the API key, or you may have hit the daily per-address drip limit");
  }
  return { network, address, token, transactionHash: result.transactionHash, explorer: `${EXPLORER[network]}${result.transactionHash}` };
}
