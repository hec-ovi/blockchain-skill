import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CodedError } from "../../core/src/envelope.ts";

export interface CompiledContract {
  contractName: string;
  abi: unknown[];
  bytecode: string;
  deployedBytecode: string;
  compilerVersion: string;
  sourceName: string;
}

interface SolcError {
  severity: "error" | "warning";
  formattedMessage: string;
}

type ImportCallback = (path: string) => { contents: string } | { error: string };
type SolcApi = {
  compile(input: string, callbacks?: { import: ImportCallback }): string;
  version(): string;
};

/**
 * Load solc-js from (in order): dist/vendor (shipped with the bundle), the
 * package node_modules next to the skill pack, or the ambient require path.
 * createRequire(import.meta.url) alone fails for the single-file bundle when
 * no node_modules sits beside dist/agent-wallet.mjs.
 */
function loadSolc(): SolcApi {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "vendor", "node_modules", "solc"),
    join(here, "..", "node_modules", "solc"),
    join(here, "..", "..", "node_modules", "solc"),
    join(process.cwd(), "node_modules", "solc"),
  ];
  for (const solcDir of candidates) {
    const entry = join(solcDir, "index.js");
    if (!existsSync(entry)) continue;
    try {
      return createRequire(entry)(solcDir) as SolcApi;
    } catch {
      /* try next */
    }
  }
  try {
    return createRequire(import.meta.url)("solc") as SolcApi;
  } catch {
    throw new CodedError(
      "SOLC_MISSING",
      "the solc compiler is not installed",
      "Reinstall the skill pack (includes dist/vendor), or run npm install solc in the toolkit tree",
    );
  }
}

/**
 * Normalize an import path the way solc does: resolve `.` / `..` segments
 * against the importing file's directory, so `Vault.sol` importing
 * `"./lib/Math.sol"` looks up the key `lib/Math.sol`.
 */
function resolveImport(from: string, target: string): string {
  if (!target.startsWith(".")) return target;
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/")).split("/") : [];
  const out = [...base];
  for (const part of target.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

export interface CompileOptions {
  optimize?: boolean;
  runs?: number;
  evmVersion?: string;
  contractName?: string;
}

export interface CompileResult {
  contracts: CompiledContract[];
  warnings: string[];
  compilerVersion: string;
}

/**
 * Compile a whole source set with solc-js (in-process, cross-OS, offline).
 * Imports resolve only against the sources handed in: nothing is fetched and
 * nothing is read from disk, so a compile is reproducible and side-effect free.
 * Errors fail closed with the compiler's own message; warnings are returned so
 * a caller can gate on them.
 */
export function compileSources(sources: Record<string, string>, opts: CompileOptions = {}): CompileResult {
  const solc = loadSolc();
  const { optimize = true, runs = 200, evmVersion, contractName } = opts;

  const input = {
    language: "Solidity",
    sources: Object.fromEntries(Object.entries(sources).map(([path, content]) => [path, { content }])),
    settings: {
      optimizer: { enabled: optimize, runs },
      ...(evmVersion ? { evmVersion } : {}),
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  };

  const importCallback: ImportCallback = (path) => {
    const direct = sources[path];
    if (direct !== undefined) return { contents: direct };
    for (const [from, _content] of Object.entries(sources)) {
      const hit = sources[resolveImport(from, path)];
      if (hit !== undefined) return { contents: hit };
    }
    return { error: `import not found: ${path} (this compiler resolves imports only against the sources you pass; inline the dependency or add it as another source file)` };
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: importCallback })) as {
    errors?: SolcError[];
    contracts?: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string }; deployedBytecode: { object: string } } }>>;
  };

  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length > 0) {
    throw new CodedError("COMPILE_FAILED", `solidity compilation failed`, errors.map((e) => e.formattedMessage).join("\n").slice(0, 1500));
  }
  const warnings = (output.errors ?? [])
    .filter((e) => e.severity === "warning")
    .map((e) => e.formattedMessage.trim());

  const compilerVersion = solc.version();
  const contracts: CompiledContract[] = [];
  for (const [file, found] of Object.entries(output.contracts ?? {})) {
    for (const [name, artifact] of Object.entries(found)) {
      if (contractName && name !== contractName) continue;
      if (!artifact.evm.bytecode.object) continue; // interfaces/abstract have no bytecode
      contracts.push({
        contractName: name,
        abi: artifact.abi,
        bytecode: `0x${artifact.evm.bytecode.object}`,
        deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`,
        compilerVersion,
        sourceName: file,
      });
    }
  }

  if (contracts.length === 0) {
    throw new CodedError(
      "NO_DEPLOYABLE_CONTRACT",
      contractName ? `no deployable contract named ${contractName}` : "no deployable contract found (only interfaces/abstract?)",
      "Ensure the source has a concrete contract with a body",
    );
  }
  return { contracts, warnings, compilerVersion };
}

/**
 * Compile one Solidity source string. Thin wrapper over compileSources kept for
 * the `contract-compile` verb, whose output schema is the contract array.
 */
export function compileSource(source: string, sourceName = "Contract.sol", optimize = true, contractName?: string): CompiledContract[] {
  return compileSources({ [sourceName]: source }, { optimize, ...(contractName ? { contractName } : {}) }).contracts;
}
