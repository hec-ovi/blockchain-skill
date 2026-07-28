import { run, type Envelope } from "../../core/src/envelope.ts";
import { listModes, serveStep, walkStatus, type ServeOptions } from "./walk.ts";
import type { ModeListOutput, StepOutput, WalkStatusOutput } from "./contract.ts";

const LAYER = { layer: "workflow", backend: "prompts" };

/** Serve one node of the contract walk. */
export function step(opts?: ServeOptions): Promise<Envelope<StepOutput>> {
  return run(LAYER, () => serveStep(opts));
}

/** Every mode and the steps it runs. */
export function modes(): Promise<Envelope<ModeListOutput>> {
  return run(LAYER, () => listModes());
}

/** Where the current walk stands: visits, artifacts saved, what blocks it. */
export function status(): Promise<Envelope<WalkStatusOutput>> {
  return run(LAYER, () => walkStatus());
}

export { renderStep } from "./walk.ts";
