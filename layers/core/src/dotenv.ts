import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal, zero-dependency .env loader. Reads KEY=VALUE lines from a .env file
 * in the current working directory and sets them on process.env WITHOUT
 * overwriting variables already present (real env wins). Quotes are stripped;
 * comments (#) and blank lines are ignored. Multi-line values are not supported
 * (keep secrets on one line).
 */
export function loadDotenv(dir: string = process.cwd()): void {
  let raw: string;
  try {
    raw = readFileSync(join(dir, ".env"), "utf8");
  } catch {
    return; // no .env is fine
  }
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
}
