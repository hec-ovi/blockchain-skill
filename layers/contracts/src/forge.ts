import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";

/** Locate the forge binary on PATH or in the standard foundryup dir. */
export function findForge(): string | null {
  for (const dir of (process.env["PATH"] ?? "").split(delimiter)) {
    if (dir && existsSync(join(dir, "forge"))) return join(dir, "forge");
  }
  const foundry = join(homedir(), ".foundry", "bin", "forge");
  return existsSync(foundry) ? foundry : null;
}
