import { join } from "node:path";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { walletHome } from "./home.ts";

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function stateDir(): string {
  const dir = join(walletHome(), "state");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function pathFor(name: string): string {
  if (!NAME_RE.test(name)) throw new Error(`STATE_NAME_INVALID: "${name}" must match ${NAME_RE}`);
  return join(stateDir(), `${name}.json`);
}

/** Atomic write (tmp + rename), file mode 0600. Multi-step flows persist progress here. */
export function saveState(name: string, value: unknown): string {
  const target = pathFor(name);
  const tmp = join(stateDir(), `.${name}.${randomUUID()}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, target);
  return target;
}

export function loadState<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(pathFor(name), "utf8")) as T;
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}

export function listStates(): string[] {
  return readdirSync(stateDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();
}

export function deleteState(name: string): boolean {
  try {
    rmSync(pathFor(name));
    return true;
  } catch (e: any) {
    if (e?.code === "ENOENT") return false;
    throw e;
  }
}
