# agentio

contractVersion: 1.1.0

## Purpose

The single agent-facing surface: one CLI that exposes every layer's verbs with identical inputs and the identical core envelope, plus the session `init` doctor.

## Inputs

- CLI: `agent-wallet <verb> [flags]` (see `agent-wallet help`). Passphrase from `AGENT_WALLET_PASSPHRASE` or `--passphrase`.
- `init`: no flags. Session readiness check; creates the data-dir layout under `$AGENT_WALLET_HOME` (default `~/.agent-wallet`).

## Outputs

Every verb returns the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)) as pretty JSON on stdout; the schema is owned by each underlying layer. Exit code is 0 on `ok:true`, 1 on `ok:false`, 2 on usage errors.

- `init` data shape: [schema/init-output.json](schema/init-output.json). Postconditions: `ready` is true only when Node meets the floor and the data dir is writable; `nextActions` and `notes` are non-empty guidance for the calling agent; secrets are never included.

## Events

None.

## Errors

`UNKNOWN_VERB`, `PASSPHRASE_MISSING`, plus every underlying layer's errors passed through unchanged. `init` itself does not fail closed on a missing passphrase; it reports `passphraseSet: false` and steers via `nextActions`.

## Dependencies

Composition root: reads the published api of keys, chains, read, sign, gate, send, learn, contracts, swap, faucet. `init` uses core home + keys list only.

## Invariants

- The CLI calls the SAME layer functions the skills document; there is no second implementation of any operation.
- The passphrase comes from the environment or `--passphrase`; it is never written to logs or envelopes.
- Verb summaries state when to use each verb and are non-overlapping (send vs swap), so a model routes correctly.
- The published runtime is `dist/agent-wallet.mjs` (built by `npm run build`); skill packs and npm packages ship that file so agents need only Node.

## How to modify this blackbox safely

A new layer verb becomes one CLI entry delegating to that layer's api. Never put business logic here beyond argument adaptation, envelope formatting, and the init doctor. After CLI changes, run `npm run build` so `dist/agent-wallet.mjs` matches source.
