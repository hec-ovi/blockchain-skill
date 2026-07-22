import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/** Data dir for keystores, state files and config. Override with AGENT_WALLET_HOME. */
export function walletHome(): string {
  const dir = process.env["AGENT_WALLET_HOME"] ?? join(homedir(), ".agent-wallet");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
