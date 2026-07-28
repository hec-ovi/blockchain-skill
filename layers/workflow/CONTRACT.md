# workflow

contractVersion: 1.0.0

## Purpose

Hand an agent the Solidity contract walk one step at a time, and refuse to advance until the step it is on has actually produced something.

## Inputs

- step: `{mode?, step?, reset?}`. No mode serves the picker (`00-mode`). A mode with no step starts that mode fresh and wipes the work dir. A mode with a step serves that node. `reset` wipes the work dir first.
  - Precondition: `mode` is a key of the manifest; `step` belongs to that mode's sequence.
- modes: no input.
- status: no input.

The work dir is `$AGENT_CONTRACT_WORK`, or `./.contract-work` under the current directory. Every artifact a step names is written there by the agent, not by this layer.

## Outputs

Wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- step: [schema/step-output.json](schema/step-output.json). Postcondition: `body` is the fully substituted prompt, `artifact` (when present) is the absolute path that must exist before the walk passes this step, `nextCommand` is a runnable command line. `renderStep` turns this into the plain text an agent reads: `STEP` header, `WORK DIR`, body, `ARTIFACT`, `NEXT`.
- modes: [schema/mode-list-output.json](schema/mode-list-output.json). Every mode, its purpose, and its ordered steps.
- status: [schema/walk-status-output.json](schema/walk-status-output.json). Per-step visit count, artifact path, whether it is saved, and the first step blocking progress.

## Events

None.

## Errors

`MODE_UNKNOWN`, `MODE_REQUIRED`, `STEP_UNKNOWN`, `STEP_NOT_IN_MODE`, `WALK_BLOCKED`, `WALK_LOOPING`.

`WALK_BLOCKED` is the artifact gate: an earlier producing step has not written its file. `WALK_LOOPING` fires when one step has been served more than `MAX_VISITS` times, which means the agent is circling rather than progressing and should hand back to the human.

## Dependencies

`core` (envelope). No network, no other layer. The prompts describe commands from `contracts`, `sandbox`, `learn`, `read` and `chains`, but this layer never calls them: it only serves text.

## Invariants

- One node per call. The layer never returns two steps, and never returns a step whose predecessors have unmet artifacts.
- `layers/workflow/prompts/*.md` is the single source of truth. `src/prompts.generated.ts` is written from it by `npm run prompts` and is the only thing the code reads, so the bundle stays a single file with no sidecar prompt directory. A test fails when the two drift.
- Every step named by a mode has a prompt file, and every prompt file is used by a mode. No orphans in either direction.
- `{{PARAM}}` placeholders are substituted from `prompts/parameters.json` before a body is served, so compiler versions and size limits stay accurate in one place.
- Starting a mode with no explicit step wipes the work dir, so a previous contract's artifacts cannot satisfy this one's gate.

## How to modify this blackbox safely

Editing a prompt means editing the `.md` file and running `npm run prompts`; never edit `prompts.generated.ts`. Adding a step means adding its `.md`, adding it to the mode sequence in `prompts/manifest.json`, and adding a `produces` entry if it must be gated. Adding a mode means a `purpose` entry and a sequence; the tests walk every mode end to end, so a broken sequence fails locally. Numbers that appear in prompt text belong in `parameters.json`, not inline, or they rot. Keep the prompts free of em and en dashes; a test enforces it.
