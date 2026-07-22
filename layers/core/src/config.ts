import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { walletHome } from "./home.ts";

/**
 * Shared toolkit config at $AGENT_WALLET_HOME/config.json. Each layer reads
 * its own section; nobody else's. Missing file means all defaults.
 */
export function loadConfig(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(walletHome(), "config.json"), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function saveConfig(config: Record<string, unknown>): string {
  const file = join(walletHome(), "config.json");
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return file;
}
