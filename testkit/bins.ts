import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, delimiter } from "node:path";

/** Locate a tool on PATH or in the user-local install spots the repo documents. */
export function findBin(name: string): string | null {
  for (const dir of (process.env["PATH"] ?? "").split(delimiter)) {
    if (dir && existsSync(join(dir, name))) return join(dir, name);
  }
  for (const dir of [join(homedir(), ".foundry", "bin"), join(homedir(), ".local", "bin")]) {
    if (existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}

export function randomPort(): number {
  return 20000 + Math.floor(Math.random() * 20000);
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs = 15000, stepMs = 150): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error("waitFor timed out");
}
