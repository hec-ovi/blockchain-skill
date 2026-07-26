# agentio

contractVersion: 1.0.0

## Purpose

The single agent-facing surface: one CLI that exposes every layer's verbs with identical inputs and the identical core envelope.

## Inputs

- CLI: `agent-wallet <verb> [flags]` (see `agent-wallet help`). Passphrase from `AGENT_WALLET_PASSPHRASE` or `--passphrase`.

## Outputs

Every verb returns the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)) as pretty JSON on stdout; the schema is owned by each underlying layer. Exit code is 0 on `ok:true`, 1 on `ok:false`, 2 on usage errors.

## Events

None.

## Errors

`UNKNOWN_VERB`, `PASSPHRASE_MISSING`, plus every underlying layer's errors passed through unchanged.

## Dependencies

Composition root: reads the published api of keys, chains, read, sign, gate, send, learn, contracts, swap, bridge, faucet.

## Invariants

- The CLI calls the SAME layer functions the skills document; there is no second implementation of any operation.
- The passphrase comes from the environment or `--passphrase`; it is never written to logs or envelopes.
- Verb summaries state when to use each verb and are non-overlapping (send vs swap vs bridge), so a model routes correctly.

## How to modify this blackbox safely

A new layer verb becomes one CLI entry delegating to that layer's api. Never put business logic here; this layer only adapts arguments and formats envelopes.
