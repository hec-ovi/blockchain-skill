# read

contractVersion: 1.0.0

## Purpose

Read-only chain state: balances (native, ERC-20, BTC), UTXOs, fee estimates and transaction status, on any resolvable chain.

## Inputs

- All verbs take `{chain, address? , token?, ref?, rpc?}` (free-form chain ref resolved by the chains layer; addresses and tx ids validated here, fail closed).

## Outputs

All wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- balance: [schema/balance-output.json](schema/balance-output.json). EVM native, ERC-20 (with `token`), or BTC (confirmed/mempool split). Amounts are decimal strings in base units (wei/sats) plus a formatted string; never floats.
- utxos: [schema/utxo-list-output.json](schema/utxo-list-output.json). Bitcoin networks only.
- fees: [schema/fees-output.json](schema/fees-output.json). EVM EIP-1559 wei values; BTC sat/vB targets (floor 1).
- txStatus: [schema/tx-status-output.json](schema/tx-status-output.json). `not_found` is a value, not an error.

## Events

None.

## Errors

`ADDRESS_INVALID`, `HASH_INVALID`, `TXID_INVALID`, `TOKEN_READ_FAILED`, `FAMILY_MISMATCH`, `PARAM_MISSING`, plus pass-through of chains-layer errors (`CHAIN_UNKNOWN`, `ESPLORA_UNAVAILABLE`, `BITCOIND_REQUIRED`, `BITCOIND_ERROR`).

## Dependencies

`core`, `chains` (client construction and endpoint access only).

## Invariants

- Read-only: no signing, no broadcasting, no key material ever enters this layer.
- Bitcoin backend selection is deterministic: Esplora when the network has esplora URLs, bitcoind JSON-RPC otherwise (regtest).
- All amounts cross the boundary as strings; bigint math internally.

## How to modify this blackbox safely

New read verbs are additive schema entries + api functions (minor bump). Keep the string-amount invariant; anything returning floats for money is a bug. Unit tests use injected fetch; e2e runs against throwaway anvil/regtest nodes via `testkit/`.
