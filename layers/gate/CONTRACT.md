# gate

contractVersion: 1.0.0

## Purpose

Deterministic policy gate: every state-changing operation (send, sign, deploy, contract-write, swap) is allowed or denied by config, before anything is signed.

## Inputs

- gateCheck / decide: [schema/gate-operation-input.json](schema/gate-operation-input.json). Config section `gate` of `$AGENT_WALLET_HOME/config.json`: [schema/gate-config.json](schema/gate-config.json).

## Outputs

All wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- Verdict: [schema/gate-verdict-output.json](schema/gate-verdict-output.json). Postcondition: a verdict object exists only for allowed operations; every denial is a coded error whose hint states the exact config change that would allow it.

## Events

None.

## Errors

`GATE_DENIED` (mainnet without opt-in), `GATE_CAPPED` (per-tx cap exceeded), `GATE_UNKNOWN_KIND` (fail closed on unrecognized operations), `GATE_CONFIG_INVALID`, `AMOUNT_INVALID`.

## Dependencies

`core` (config file access only). No network, no keys, no model involvement: prompt text is never an enforcement mechanism.

## Invariants

- Defaults are safe: with no config file, testnets and local chains are allowed, every mainnet is denied, no caps.
- Decisions are pure functions of (operation, config); same inputs, same verdict.
- Caps compare base units (wei/sats) as bigints; native value only (ERC-20 token amounts are not capped by this version).

## How to modify this blackbox safely

New operation kinds: append to `OPERATION_KINDS` (additive, minor bump); unknown kinds stay denied. New policy dimensions must default to the permissive-on-testnet, restrictive-on-mainnet posture and deny with an actionable hint. Never let a malformed config fall back to allow.
