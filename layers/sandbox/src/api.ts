import { run, type Envelope } from "../../core/src/envelope.ts";
import { runPlan, type RunPlanOptions } from "./run.ts";
import type { RunOutput } from "./contract.ts";

const LAYER = { layer: "sandbox", backend: "ethereumjs-evm" };

/** Execute a scenario plan against a fresh in-process EVM. Offline, no funds. */
export function sandboxRun(plan: unknown, opts?: RunPlanOptions): Promise<Envelope<RunOutput>> {
  return run(LAYER, () => runPlan(plan, opts));
}
