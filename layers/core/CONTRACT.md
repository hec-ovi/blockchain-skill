# core

contractVersion: 1.0.0

## Purpose

Defines the envelope every other layer speaks, validates values at boundaries (fail closed), and stores multi-step flow state on disk.

## Inputs

Library layer: no runtime inputs of its own. Callers pass values to be validated against [schema/envelope.json](schema/envelope.json) or a layer schema.

## Outputs

- Envelope: every cross-layer value and every CLI/MCP response. Schema: [schema/envelope.json](schema/envelope.json). Postconditions: `ok=true` implies `error` absent; `ok=false` implies `error` present with a closed-set `code`; `meta.layer`, `meta.backend`, `meta.traceId` always set.

## Events

None.

## Errors

- `SCHEMA_INVALID`: a value failed boundary validation (thrown by `mustValidate`, carries the violation list).
- `STATE_NAME_INVALID`: state name outside `^[a-z0-9][a-z0-9-]*$` (path traversal guard).

## Dependencies

None (leaf layer).

## Invariants

- Envelope is strict: unknown top-level or error keys are rejected. `meta` allows extra keys.
- State writes are atomic (tmp + rename) with file mode 0600 under `$AGENT_WALLET_HOME/state/` (default `~/.agent-wallet/state/`, dir mode 0700).
- `schema/*.json` is generated from `src/contract.ts` by `npm run schemas`; a contract test fails on drift. Never edit the JSON by hand.

## How to modify this blackbox safely

Additive envelope changes (new optional meta key): edit `src/envelope.ts`, bump minor in `CONTRACT_VERSION` and here, run `npm run schemas`, keep tests green. Breaking changes: add a new schema alongside, never edit `envelope.json` semantics in place. Public surface is `src/envelope.ts`, `src/state.ts`, `src/home.ts`, `src/contract.ts`; everything else is private.
