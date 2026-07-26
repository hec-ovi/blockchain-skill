/**
 * Cross-layer import policy.
 *
 * Layers may import only each other's *published* modules (listed below), never
 * private implementation files. `core` is the shared leaf. `agentio` may import
 * every layer's published surface (it is the composition root).
 *
 * This is not process isolation; it is a compile-time discipline so a maintainer
 * can change private src without silent coupling. When you export a new public
 * module, add it here and document it in that layer's CONTRACT.md Dependencies.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const layersRoot = fileURLToPath(new URL("../layers", import.meta.url));

/** basename (no .ts) of files other layers may import from each layer. */
const PUBLISHED: Record<string, ReadonlySet<string>> = {
  core: new Set(["envelope", "home", "config", "state", "contract", "dotenv"]),
  keys: new Set(["wallet", "derive", "contract"]),
  chains: new Set(["api", "registry", "evm", "btc", "contract"]),
  read: new Set(["api", "evm", "btc", "contract"]),
  sign: new Set(["api", "evm", "btc", "contract"]),
  gate: new Set(["api", "policy", "contract"]),
  send: new Set(["api", "contract"]),
  learn: new Set(["api", "contract"]),
  contracts: new Set(["api", "contract"]),
  swap: new Set(["api", "contract", "port", "wrap"]),
  faucet: new Set(["api", "contract"]),
  agentio: new Set(["cli", "init"]),
};

const importRe = /from\s+["']\.\.\/\.\.\/([a-z]+)\/src\/([a-z0-9/-]+)["']/g;

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkTs(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("layer import boundary (published surfaces only)", () => {
  it("every cross-layer import targets a published module", () => {
    const violations: string[] = [];
    for (const layer of readdirSync(layersRoot)) {
      const srcDir = join(layersRoot, layer, "src");
      try {
        if (!statSync(srcDir).isDirectory()) continue;
      } catch {
        continue;
      }
      for (const file of walkTs(srcDir)) {
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(importRe)) {
          const targetLayer = m[1]!;
          const modPath = m[2]!; // e.g. "wallet" or "api"
          const mod = modPath.split("/")[0]!;
          if (targetLayer === layer) continue;
          const allowed = PUBLISHED[targetLayer];
          if (!allowed) {
            violations.push(`${relative(layersRoot, file)} -> unknown layer ${targetLayer}`);
            continue;
          }
          if (!allowed.has(mod)) {
            violations.push(
              `${relative(layersRoot, file)} imports ${targetLayer}/src/${modPath} (not published; allowed: ${[...allowed].sort().join(", ")})`,
            );
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("every layer in layers/ has a published allowlist entry", () => {
    for (const layer of readdirSync(layersRoot)) {
      if (!statSync(join(layersRoot, layer)).isDirectory()) continue;
      expect(PUBLISHED[layer], `add ${layer} to PUBLISHED`).toBeDefined();
    }
  });
});
