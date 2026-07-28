import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Directory the loaded .env came from, or undefined when none was found. */
let loadedFrom: string | undefined;

/**
 * The project root for this process: the directory holding the .env that was
 * loaded. Relative paths in that .env (AGENT_WALLET_HOME above all) resolve
 * against it, so running a verb from a subdirectory behaves the same as running
 * it from the root. Falls back to cwd when there is no .env.
 */
export function dotenvDir(): string {
  return loadedFrom ?? process.cwd();
}

/**
 * Minimal, zero-dependency .env loader. Walks up from `dir` to the filesystem
 * root and reads KEY=VALUE lines from the first .env it finds, setting them on
 * process.env WITHOUT overwriting variables already present (real env wins).
 * Quotes are stripped; comments (#) and blank lines are ignored. Multi-line
 * values are not supported (keep secrets on one line).
 *
 * The upward walk matters: an agent told to work in a scratch subdirectory
 * would otherwise lose the passphrase and the wallet home the moment it cd'd.
 */
export function loadDotenv(dir: string = process.cwd()): void {
  let current = resolve(dir);
  for (;;) {
    let raw: string;
    try {
      raw = readFileSync(join(current, ".env"), "utf8");
    } catch {
      const parent = dirname(current);
      if (parent === current) return; // hit the root; no .env is fine
      current = parent;
      continue;
    }
    loadedFrom = current;
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key in process.env) continue;
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    return;
  }
}

/** Test hook: forget which .env was loaded. */
export function resetDotenv(): void {
  loadedFrom = undefined;
}
