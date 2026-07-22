import { run, type Envelope } from "../../core/src/envelope.ts";
import { decide, type GateVerdict, type OperationRequest } from "./policy.ts";

const LAYER = { layer: "gate", backend: "policy" };

/** Enveloped check for CLI/MCP dry-runs; state-changing layers call decide() directly and let the CodedError deny. */
export function gateCheck(op: OperationRequest): Promise<Envelope<GateVerdict>> {
  return run({ ...LAYER, chain: op.chain.name }, () => decide(op));
}
