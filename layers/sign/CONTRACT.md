# sign

contractVersion: 1.0.0

## Purpose

Builds and signs transactions and messages entirely offline: EVM EIP-1559 transactions, EIP-191 messages, EIP-712 typed data, and Bitcoin transactions (taproot or segwit) with coin selection.

## Inputs

- evmTxSign: [schema/evm-sign-input.json](schema/evm-sign-input.json). Preconditions: caller supplies nonce, gasLimit and fees (this layer makes no network calls); `to` or `data` required.
- btcTxSign: [schema/btc-sign-input.json](schema/btc-sign-input.json). Preconditions: caller supplies the utxo list (from the read layer) and a fee rate in 1..5000 sat/vB; `amountSats` is a decimal string or "all" (sweep).

## Outputs

All wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- EVM signed tx: [schema/evm-signed-output.json](schema/evm-signed-output.json). Postcondition: `hash` is keccak256 of `rawTx`; broadcastable as-is.
- EVM signature: [schema/evm-signature-output.json](schema/evm-signature-output.json) (message and typed-data verbs).
- BTC signed tx: [schema/btc-signed-output.json](schema/btc-signed-output.json). Postconditions: only confirmed utxos spent, largest-first selection; change below 546 sats folds into the fee; change returns to the sender address.

## Events

None.

## Errors

`ADDRESS_INVALID`, `AMOUNT_INVALID`, `TX_EMPTY`, `TYPED_DATA_INVALID`, `FEE_RATE_INVALID`, `NO_UTXOS`, `INSUFFICIENT_FUNDS`, plus keys-layer unlock errors (`WALLET_NOT_FOUND`, `PASSPHRASE_WRONG`).

## Dependencies

`core`, `keys` (unlock + derivation only). No network access, ever.

## Invariants

- Offline: this layer performs zero I/O beyond reading the keystore through the keys layer.
- Fees are computed from a conservative vsize estimate before signing; the reported `vsize` is the real post-signing value.
- Private keys and mnemonics never appear in any output or error.

## How to modify this blackbox safely

New signable artifact types (e.g. PSBT export instead of finalized hex) are additive outputs. Never lower the dust threshold or widen the fee-rate range silently; both are contract values. The BTC signing tests (offline PSBT decode) and the real-testnet send e2e are the ground truth that signatures verify; keep them green after any change here.
