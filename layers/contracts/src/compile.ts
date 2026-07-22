import { createRequire } from "node:module";
import { CodedError } from "../../core/src/envelope.ts";

const require = createRequire(import.meta.url);

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

/**
 * Compile one Solidity source string with solc-js (in-process, cross-OS).
 * Returns every contract found, or the named one. Warnings are ignored;
 * any error fails closed with the compiler's own message as the hint.
 */
export function compileSource(source: string, sourceName = "Contract.sol", optimize = true, contractName?: string): CompiledContract[] {
  let solc: { compile(input: string): string; version(): string };
  try {
    solc = require("solc");
  } catch {
    throw new CodedError("SOLC_MISSING", "the solc compiler is not installed", "Run npm install solc, or use a Foundry project path");
  }

  const input = {
    language: "Solidity",
    sources: { [sourceName]: { content: source } },
    settings: {
      optimizer: { enabled: optimize, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: SolcError[];
    contracts?: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string }; deployedBytecode: { object: string } } }>>;
  };

  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length > 0) {
    throw new CodedError("COMPILE_FAILED", `solidity compilation failed`, errors.map((e) => e.formattedMessage).join("\n").slice(0, 1500));
  }

  const version = solc.version();
  const results: CompiledContract[] = [];
  for (const [file, contracts] of Object.entries(output.contracts ?? {})) {
    for (const [name, artifact] of Object.entries(contracts)) {
      if (contractName && name !== contractName) continue;
      if (!artifact.evm.bytecode.object) continue; // interfaces/abstract have no bytecode
      results.push({
        contractName: name,
        abi: artifact.abi,
        bytecode: `0x${artifact.evm.bytecode.object}`,
        deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`,
        compilerVersion: version,
        sourceName: file,
      });
    }
  }

  if (results.length === 0) {
    throw new CodedError(
      "NO_DEPLOYABLE_CONTRACT",
      contractName ? `no deployable contract named ${contractName}` : "no deployable contract found (only interfaces/abstract?)",
      "Ensure the source has a concrete contract with a body",
    );
  }
  return results;
}
