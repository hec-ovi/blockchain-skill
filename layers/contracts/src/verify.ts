import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CodedError } from "../../core/src/envelope.ts";
import { findForge } from "./forge.ts";

const run = promisify(execFile);

export type Verifier = "sourcify" | "blockscout" | "etherscan";

export interface VerifyRequest {
  chainId: number;
  address: string;
  /** path to a foundry project (has foundry.toml) */
  projectDir: string;
  /** "src/Foo.sol:Foo" */
  contractPath: string;
  verifier?: Verifier;
  /** blockscout instance api base, required for blockscout */
  verifierUrl?: string;
  apiKey?: string;
  compilerVersion?: string;
}

export interface VerifyResult {
  address: string;
  chainId: number;
  verifier: Verifier;
  verified: boolean;
  detail: string;
}

/**
 * Verify a contract's source via forge verify-contract. Sourcify (default)
 * and Blockscout are keyless; Etherscan needs apiKey. Requires a Foundry
 * project and the forge binary.
 */
export async function verifyContract(req: VerifyRequest): Promise<VerifyResult> {
  const forge = findForge();
  if (!forge) throw new CodedError("FORGE_MISSING", "the forge binary is not installed", "Install Foundry (foundryup) to verify from source");
  const verifier = req.verifier ?? "sourcify";
  if (verifier === "etherscan" && !req.apiKey) {
    throw new CodedError("VERIFY_KEY_REQUIRED", "etherscan verification needs an api key", "Set an apiKey, or use the keyless sourcify/blockscout verifiers");
  }
  if (verifier === "blockscout" && !req.verifierUrl) {
    throw new CodedError("VERIFIER_URL_REQUIRED", "blockscout verification needs the instance api url", "Pass verifierUrl like https://eth.blockscout.com/api");
  }

  const args = [
    "verify-contract",
    req.address,
    req.contractPath,
    "--chain-id",
    String(req.chainId),
    "--verifier",
    verifier,
    "--watch",
  ];
  if (req.verifierUrl) args.push("--verifier-url", req.verifierUrl);
  if (req.apiKey) args.push("--etherscan-api-key", req.apiKey);
  if (req.compilerVersion) args.push("--compiler-version", req.compilerVersion);

  try {
    const { stdout, stderr } = await run(forge, args, { cwd: req.projectDir, timeout: 180000 });
    const out = `${stdout}\n${stderr}`;
    const verified = /verified|already verified|successfully verified/i.test(out);
    return { address: req.address, chainId: req.chainId, verifier, verified, detail: out.trim().slice(-1000) };
  } catch (e: any) {
    return {
      address: req.address,
      chainId: req.chainId,
      verifier,
      verified: false,
      detail: `${e?.stdout ?? ""}${e?.stderr ?? e?.message ?? e}`.slice(-1000),
    };
  }
}
