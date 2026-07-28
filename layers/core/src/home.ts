import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { dotenvDir } from "./dotenv.ts";

/**
 * Data dir for keystores, state files and config. Override with
 * AGENT_WALLET_HOME.
 *
 * A relative override resolves against the project root (the directory holding
 * the loaded .env), never against the current working directory. Resolving
 * against cwd would make `AGENT_WALLET_HOME=./.agent-wallet-data` point
 * somewhere else the moment a verb runs from a subdirectory, and mkdirSync
 * would quietly create an empty keystore dir there: the wallet would look like
 * it had vanished.
 */
export function walletHome(): string {
  const override = process.env["AGENT_WALLET_HOME"];
  const dir =
    override === undefined || override === ""
      ? resolve(homedir(), ".agent-wallet")
      : isAbsolute(override)
        ? override
        : resolve(dotenvDir(), override);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
