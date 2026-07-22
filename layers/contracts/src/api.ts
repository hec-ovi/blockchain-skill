import { run, type Envelope } from "../../core/src/envelope.ts";
import { compileSource, type CompiledContract } from "./compile.ts";
import { deployContract, type DeployRequest, type DeployResult } from "./deploy.ts";
import { callContract, writeContract, type CallRequest, type WriteRequest } from "./interact.ts";
import { verifyContract, type VerifyRequest, type VerifyResult } from "./verify.ts";

const LAYER = { layer: "contracts", backend: "forge+viem" };

export function compile(source: string, sourceName?: string, contractName?: string): Promise<Envelope<CompiledContract[]>> {
  return run({ ...LAYER, backend: "solc" }, () => compileSource(source, sourceName, true, contractName));
}

export function deploy(req: DeployRequest): Promise<Envelope<DeployResult>> {
  return run({ ...LAYER, chain: req.chain }, () => deployContract(req));
}

export function call(req: CallRequest): Promise<Envelope<{ function: string; result: unknown }>> {
  return run({ ...LAYER, chain: req.chain, backend: "viem" }, () => callContract(req));
}

export function write(req: WriteRequest): Promise<Envelope<{ function: string; hash: string; from: string; status: string }>> {
  return run({ ...LAYER, chain: req.chain, backend: "viem" }, () => writeContract(req));
}

export function verify(req: VerifyRequest): Promise<Envelope<VerifyResult>> {
  return run({ ...LAYER, backend: "forge" }, () => verifyContract(req));
}
