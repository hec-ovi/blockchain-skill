# learn

contractVersion: 1.0.0

## Purpose

Fetches what a deployed contract is: its ABI, verified source, compiler and proxy target, so an agent can understand and call it.

## Inputs

- learnContract: `{chain, address, rpc?, verifiedOnly?}`. Address must be 0x + 40 hex; chain resolved by the chains layer (EVM only).

## Outputs

Wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- Contract source: [schema/contract-source-output.json](schema/contract-source-output.json). Postconditions: `verified` true for the three explorer sources and false for `whatsabi` (a bytecode guess); `abi` is always present; `implementation` is set when a proxy is detected.

## Events

None.

## Errors

`ADDRESS_INVALID`, `FAMILY_MISMATCH`, `NOT_VERIFIED` (only with `verifiedOnly`), `NO_CONTRACT`, plus chain-resolution errors.

## Dependencies

`core` (config for an optional Etherscan key), `chains` (client + explorer URLs). External: Sourcify APIv2, Blockscout instances, Etherscan API v2, @shazow/whatsabi.

## Invariants

- Keyless-first, deterministic order: Sourcify, then Blockscout, then Etherscan v2 (only if `learn.etherscanApiKey` or `ETHERSCAN_API_KEY` is set), then WhatsABI from bytecode.
- Read-only: no keys, no signing, no writes.
- WhatsABI runs with external ABI loaders off, so it stays keyless and uses only on-chain heuristics.

## How to modify this blackbox safely

New source backends slot into the ordered chain in `src/api.ts` (keyless before keyed). Keep `verified` honest: only explorer-verified source is `true`. Live tests hit real endpoints behind `RUN_LIVE`; unit tests inject fetch with recorded fixtures.
