# sandbox

contractVersion: 1.0.0

## Purpose

Execute Solidity against a real EVM in this process, with no node, no testnet, no funds and nothing to install, so a contract can be proved (or broken) before it ever touches a chain.

## Inputs

- run: a scenario plan, [schema/plan-input.json](schema/plan-input.json).
  - `sources[]`: `{path, content}` or `{path, file}` (exactly one). `file` resolves against the plan file's directory. Imports resolve only against this set: nothing is fetched, nothing else is read from disk.
  - `accounts`: name to starting balance. `deployer` always exists with `100 ether` unless overridden.
  - `deploy[]`: `{as, contract, from, args, value}`, run in order. `as` is the handle later steps use.
  - `steps[]`: `{to, from, fn, args, value, kind, expect, revert, returns}`. `kind: auto` picks `call` for `view`/`pure` and `send` otherwise.
  - `invariants[]`: `{name, to+fn+args | balanceOf, op, value}` evaluated after the last step.
  - `hardfork`: one of `london`, `paris`, `shanghai`, `cancun`, `prague`, `osaka`, `amsterdam`. Default `cancun`. Sources are compiled for the same fork.
  - Preconditions: at least one source and one deploy. Amounts are wei integers or unit strings (`1 ether`, `0.05 ether`, `3 gwei`). Address arguments may be written `@account` or `$contract` and are resolved before ABI encoding.

## Outputs

Wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- run: [schema/run-output.json](schema/run-output.json).
  - Postcondition: `pass` is true only when every step matched its `expect`/`returns` and every invariant held. `failures` names each deviation in plain words.
  - `deployed[].runtimeSizeBytes` is the real deployed code size; `overSizeLimit` is true above the EIP-170 ceiling of 24576 bytes, which is a deploy failure on any mainnet-rules chain.
  - `warnings` carries solc's own warnings for the whole source set (deprecations, shadowing, unreachable code).
  - `steps[].logs` are decoded against the ABIs of everything deployed in the plan; `steps[].revert` decodes `Error(string)`, `Panic(code)` with its meaning, and custom errors by name.
  - `balances` holds the final native balance of every account (`@name`) and contract (`$name`).

## Events

None.

## Errors

`PLAN_INVALID`, `SOURCE_UNREADABLE`, `CONTRACT_NOT_FOUND`, `FUNCTION_NOT_FOUND`, `ACCOUNT_UNKNOWN`, `REF_UNKNOWN`, `AMOUNT_INVALID`, `HARDFORK_UNKNOWN`, `DEPLOY_FAILED`, plus `COMPILE_FAILED` and `NO_DEPLOYABLE_CONTRACT` from the compiler.

A step that reverts is not an error: it is a result with `ok:false` and a decoded `revert`, which is how a negative test passes.

## Dependencies

`core` (envelope), `contracts/src/compile` (solc-js, in-process). External: `@ethereumjs/vm` v10 and its sibling packages, `viem` for ABI encode/decode. All pure JavaScript, bundled into `dist/agent-wallet.mjs`. No native module, no binary, no daemon.

## Invariants

- Offline and side-effect free. The layer opens no socket, signs nothing against a real chain, and writes no file. Plan sources are the only thing read.
- Deterministic. Account keys derive from `keccak256("agent-wallet/sandbox/<name>")`, the block is fixed, base fee and gas price are zero, so the same plan yields the same addresses, the same gas numbers and the same balances on every run and every machine.
- Gas is metered and reported but never deducted, so balance assertions stay exact.
- State lives only for the run. A `call` step checkpoints and reverts, so reads never leak into later steps.
- The layer never decides whether a contract is safe. It reports what happened; the judgement belongs to the workflow's audit step.

## How to modify this blackbox safely

Adding a hardfork means adding it to `HARDFORK_BY_NAME`, to the `hardforks` enum in `src/contract.ts`, and to the fork loop in the tests, then regenerating schemas. Forking live chain state (`RPCStateManager`) can be added alongside as an optional `fork` input without changing any existing field; keep the default offline. The reentrancy pair in `fixtures/` is the ground truth for this layer: the vulnerable `Vault` must stay drainable and `SafeVault` must keep stopping the same plan, or the sandbox has quietly stopped executing real EVM semantics.
