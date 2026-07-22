# contracts

contractVersion: 1.0.0

## Purpose

Authors, compiles, deploys, verifies and interacts with Solidity contracts: the full author-to-onchain path for an agent.

## Inputs

- compile: `{source, sourceName?, contractName?}` (solc-js, in-process).
- deploy: [schema/deploy-output.json](schema/deploy-output.json) is the output; input is `{wallet, passphrase, chain, source | (abi+bytecode), constructorArgs?, rpc?}`.
- call / write: `{chain, address, abi, function, args?}` (+ wallet/passphrase and optional `wait` for write).
- verify: `{chainId, address, projectDir, contractPath, verifier?, verifierUrl?, apiKey?}` (forge project required).

## Outputs

All wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- compile: [schema/compiled-output.json](schema/compiled-output.json) (every deployable contract: abi + bytecode).
- deploy: [schema/deploy-output.json](schema/deploy-output.json). Postcondition: `address` is the mined contract address; the returned `abi` is ready for call/write.
- call: [schema/call-output.json](schema/call-output.json). Read-only; bigints returned as strings.
- write: [schema/write-output.json](schema/write-output.json). Gated, signed, broadcast.
- verify: [schema/verify-output.json](schema/verify-output.json). `verified` reflects the explorer's answer; `detail` is forge's output tail.

## Events

None.

## Errors

`SOLC_MISSING`, `COMPILE_FAILED`, `NO_DEPLOYABLE_CONTRACT`, `DEPLOY_INPUT_MISSING`, `GAS_ESTIMATE_FAILED`, `INSUFFICIENT_FUNDS`, `DEPLOY_REVERTED`, `CONFIRM_TIMEOUT`, `FUNCTION_NOT_FOUND`, `NOT_WRITABLE`, `CALL_REVERTED`, `FORGE_MISSING`, `VERIFY_KEY_REQUIRED`, `VERIFIER_URL_REQUIRED`, `FAMILY_MISMATCH`, plus gate denials.

## Dependencies

`core`, `chains`, `gate`, `keys`, `sign`. External binaries: solc-js (npm dep, compile), forge (optional, verify only).

## Invariants

- Deploy and write pass the gate before signing; a denial writes nothing.
- Compilation is deterministic (optimizer runs 200); the same source yields the same bytecode.
- verify is keyless by default (sourcify); etherscan is the only path that requires a key.

## How to modify this blackbox safely

A Foundry-project compile path can be added alongside the solc-js one (additive). Keep call read-only and write gated; never let write skip `decide`. The Base Sepolia e2e (compile a counter, deploy, read, increment, re-read) is the ground truth; keep it green.
