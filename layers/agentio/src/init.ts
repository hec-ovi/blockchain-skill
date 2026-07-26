import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { run, type Envelope } from "../../core/src/envelope.ts";
import { walletHome } from "../../core/src/home.ts";
import { listWallets } from "../../keys/src/wallet.ts";

const LAYER = { layer: "agentio", backend: "init" };

/**
 * scripts/build.mjs inlines this via esbuild `define`. In source / test runs the
 * env var is unset, so we fall back to package.json next to the repo root.
 */
export function toolkitVersion(): string {
  const bundled = process.env["AGENT_WALLET_BUNDLED_VERSION"];
  if (bundled && bundled.length > 0) return bundled;
  try {
    const pkgPath = new URL("../../../package.json", import.meta.url);
    return JSON.parse(readFileSync(pkgPath, "utf8")).version as string;
  } catch {
    return "0.0.0";
  }
}

export interface InitReport {
  ready: boolean;
  version: string;
  node: string;
  nodeOk: boolean;
  home: string;
  homeOk: boolean;
  passphraseSet: boolean;
  walletCount: number;
  capabilities: string[];
  nextActions: string[];
  notes: string[];
}

function nodeMeetsFloor(version: string): boolean {
  const m = /^v?(\d+)\.(\d+)/.exec(version);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 22 || (major === 22 && minor >= 18);
}

function ensureHomeLayout(home: string): void {
  for (const sub of ["keystore", "state", "cache"]) {
    mkdirSync(join(home, sub), { recursive: true, mode: 0o700 });
  }
}

/**
 * Session doctor: prepare the local data dir and report what the agent can do next.
 * Does not create a wallet and never prints secrets.
 */
export function initToolkit(): Promise<Envelope<InitReport>> {
  return run(LAYER, async () => {
    const version = toolkitVersion();
    const node = process.version;
    const nodeOk = nodeMeetsFloor(node);
    const home = walletHome();
    ensureHomeLayout(home);
    const homeOk = existsSync(home);

    const passphraseSet = Boolean(process.env["AGENT_WALLET_PASSPHRASE"]?.length);
    let walletCount = 0;
    try {
      const listed = await listWallets();
      if (listed.ok && Array.isArray(listed.data)) walletCount = listed.data.length;
    } catch {
      walletCount = 0;
    }

    const capabilities = [
      "wallet-create",
      "wallet-import",
      "wallet-list",
      "wallet-addresses",
      "wallet-export",
      "balance",
      "send",
      "swap",
      "wrap",
      "unwrap",
      "contract-compile",
      "contract-deploy",
      "contract-call",
      "contract-write",
      "contract-learn",
    ];

    const notes: string[] = [];
    const nextActions: string[] = [];

    if (!nodeOk) {
      notes.push(`Node ${node} is below the floor (need >= 22.18). Upgrade Node, then re-run init.`);
    }
    if (!passphraseSet) {
      notes.push(
        "AGENT_WALLET_PASSPHRASE is not set. Export it before wallet-create / send / deploy (never paste it into chat).",
      );
      nextActions.push("export AGENT_WALLET_PASSPHRASE=<secret>  # then re-run init");
    }
    if (walletCount === 0 && passphraseSet) {
      nextActions.push("agent-wallet wallet-create --name main  # backup the mnemonic shown once");
    } else if (walletCount > 0) {
      nextActions.push("agent-wallet wallet-list");
      nextActions.push("agent-wallet wallet-addresses --name main --family evm");
    }
    notes.push("Mainnet is denied by default. Testnets work out of the box.");
    notes.push("Every balance, send, or deploy is scoped to ONE network; ask if the user did not name one.");
    notes.push("Fund testnets by sending from an external faucet or another wallet; this toolkit does not drip gas.");

    if (nextActions.length === 0) {
      nextActions.push("agent-wallet help");
    }

    const ready = nodeOk && homeOk;

    return {
      ready,
      version,
      node,
      nodeOk,
      home,
      homeOk,
      passphraseSet,
      walletCount,
      capabilities,
      nextActions,
      notes,
    } satisfies InitReport;
  });
}
