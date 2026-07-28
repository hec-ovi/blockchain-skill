import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { CodedError } from "../../core/src/envelope.ts";
import { MANIFEST, PARAMETERS, PROMPTS } from "./prompts.generated.ts";
import type { ModeListOutput, StepOutput, WalkStatusOutput } from "./contract.ts";

/** The entry node: served when no mode has been chosen yet. */
export const ENTRY_STEP = "00-mode";

/** A step served this many times in one walk means the agent is looping, not progressing. */
export const MAX_VISITS = 6;

interface WalkState {
  mode: string;
  startedAt: string;
  visits: Record<string, number>;
}

export function workDir(): string {
  const override = process.env["AGENT_CONTRACT_WORK"]?.trim();
  if (override) return isAbsolute(override) ? override : resolve(process.cwd(), override);
  return resolve(process.cwd(), ".contract-work");
}

function statePath(dir: string): string {
  return join(dir, "walk.json");
}

function readState(dir: string): WalkState | undefined {
  try {
    return JSON.parse(readFileSync(statePath(dir), "utf8")) as WalkState;
  } catch {
    return undefined;
  }
}

function writeState(dir: string, state: WalkState): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(dir), `${JSON.stringify(state, null, 2)}\n`);
}

export function sequenceFor(mode: string): string[] {
  const seq = MANIFEST.modes[mode];
  if (!seq) {
    throw new CodedError(
      "MODE_UNKNOWN",
      `no contract workflow mode named ${mode}`,
      `Modes: ${Object.keys(MANIFEST.modes).join(", ")}. Run contract-step with no flags for the picker.`,
    );
  }
  return seq;
}

/** Substitute {{NAME}} with the toolkit's current numbers so prompts never drift. */
function fillParams(body: string): string {
  return body.replace(/\{\{([A-Z0-9_]+)\}\}/g, (whole, name: string) => PARAMETERS[name] ?? whole);
}

function promptBody(step: string): string {
  const body = PROMPTS[step];
  if (body === undefined) {
    throw new CodedError("STEP_UNKNOWN", `no workflow step named ${step}`, `Known steps: ${Object.keys(PROMPTS).sort().join(", ")}`);
  }
  return fillParams(body).trim();
}

function artifactFor(step: string, dir: string): string | undefined {
  const name = MANIFEST.produces[step];
  return name === undefined ? undefined : join(dir, name);
}

/**
 * The artifact gate. A step may only be served once every earlier producing step
 * in the sequence has actually written its file. That is what stops an agent
 * from skipping the threat model and jumping to the implementation.
 */
function assertNotBlocked(step: string, seq: string[], dir: string): void {
  const upto = seq.indexOf(step);
  for (const earlier of seq.slice(0, upto)) {
    const artifact = artifactFor(earlier, dir);
    if (artifact !== undefined && !existsSync(artifact)) {
      throw new CodedError(
        "WALK_BLOCKED",
        `step ${earlier} has not saved its artifact yet`,
        `Run: contract-step --mode <mode> --step ${earlier}, do that step, and save ${artifact}. Then come back to ${step}.`,
      );
    }
  }
}

export interface ServeOptions {
  mode?: string;
  step?: string;
  /** Wipe the work dir and start the walk over. */
  reset?: boolean;
}

/** Serve exactly one node of the walk, enforcing order as it goes. */
export function serveStep(opts: ServeOptions = {}): StepOutput {
  const dir = workDir();

  if (!opts.mode) {
    if (opts.step && opts.step !== ENTRY_STEP) {
      throw new CodedError("MODE_REQUIRED", "a step needs its mode to compute what comes next", "Add --mode <mode>");
    }
    const body = promptBody(ENTRY_STEP);
    return {
      mode: "(none)",
      step: ENTRY_STEP,
      index: 1,
      total: 1,
      visits: 1,
      workDir: dir,
      body,
      nextCommand: "agent-wallet contract-step --mode <mode>",
    };
  }

  const mode = opts.mode;
  const seq = sequenceFor(mode);
  const fresh = !opts.step;

  if (opts.reset || fresh) {
    // Starting a mode with no explicit step means a new piece of work; the
    // previous walk's artifacts must not leak into this one.
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });

  const step = opts.step ?? seq[0]!;
  const index = seq.indexOf(step);
  if (index < 0) {
    throw new CodedError(
      "STEP_NOT_IN_MODE",
      `step ${step} is not part of mode ${mode}`,
      `Mode ${mode} runs: ${seq.join(" -> ")}`,
    );
  }

  assertNotBlocked(step, seq, dir);

  const state = readState(dir) ?? { mode, startedAt: new Date().toISOString(), visits: {} };
  state.mode = mode;
  const visits = (state.visits[step] ?? 0) + 1;
  if (visits > MAX_VISITS) {
    throw new CodedError(
      "WALK_LOOPING",
      `step ${step} has been served ${MAX_VISITS} times without the walk moving on`,
      "Stop iterating. Report to the human what keeps failing and what you tried, and let them decide. Use --reset to start over.",
    );
  }
  state.visits[step] = visits;
  writeState(dir, state);

  const next = seq[index + 1];
  const artifact = artifactFor(step, dir);
  const out: StepOutput = {
    mode,
    step,
    index: index + 1,
    total: seq.length,
    visits,
    workDir: dir,
    body: promptBody(step),
    nextCommand: next ? `agent-wallet contract-step --mode ${mode} --step ${next}` : "(walk complete)",
  };
  if (artifact !== undefined) out.artifact = artifact;
  if (next !== undefined) out.next = next;
  return out;
}

export function listModes(): ModeListOutput {
  return {
    modes: Object.entries(MANIFEST.modes).map(([mode, steps]) => ({
      mode,
      purpose: MANIFEST.purpose[mode] ?? "",
      steps,
    })),
  };
}

export function walkStatus(): WalkStatusOutput {
  const dir = workDir();
  const state = readState(dir);
  const out: WalkStatusOutput = { workDir: dir, started: state !== undefined, steps: [] };
  if (!state) return out;
  out.mode = state.mode;
  for (const step of sequenceFor(state.mode)) {
    const artifact = artifactFor(step, dir);
    const saved = artifact === undefined ? true : existsSync(artifact);
    const row: WalkStatusOutput["steps"][number] = { step, visits: state.visits[step] ?? 0, saved };
    if (artifact !== undefined) row.artifact = artifact;
    out.steps.push(row);
    if (!saved && out.blockedBy === undefined) out.blockedBy = step;
  }
  return out;
}

/** The exact text an agent reads: header, work dir, body, artifact line, NEXT. */
export function renderStep(step: StepOutput): string {
  const lines = [
    `STEP ${step.step}  [${step.mode}, node ${step.index} of ${step.total}${step.visits > 1 ? `, visit ${step.visits}` : ""}]`,
    "",
    `WORK DIR: ${step.workDir}  (your scratch for this contract; save every artifact a step names here)`,
    "",
    step.body,
    "",
  ];
  if (step.artifact) {
    lines.push(`ARTIFACT: before you run NEXT, save this step's output to ${step.artifact} (that file is required to advance).`, "");
  }
  lines.push(
    step.nextCommand === "(walk complete)"
      ? "NEXT: the walk is complete. Report the result to the human."
      : `NEXT: ${step.nextCommand}`,
  );
  return lines.join("\n");
}
