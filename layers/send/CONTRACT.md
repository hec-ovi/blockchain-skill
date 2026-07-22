# send

contractVersion: 1.0.0

## Purpose

Moves funds end to end: gathers nonce/fees/UTXOs, passes the gate, signs offline via the sign layer, broadcasts straight to the network, and optionally waits for confirmation.

## Inputs

- send: [schema/send-input.json](schema/send-input.json). Preconditions: wallet exists and unlocks; `amount` is display units (ETH/BTC/token), `amountRaw` base units (`all` sweeps BTC); `token` switches an EVM send to an ERC-20 transfer; `wait` blocks for an EVM receipt.

## Outputs

All wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- send result: [schema/send-output.json](schema/send-output.json). Postconditions: EVM `status` is broadcast/confirmed/reverted (confirmed only with `wait`); BTC always returns `broadcast` with a hint pointing at the tx verb for tracking; `valueWei` carries the token raw amount on ERC-20 sends.

## Events

None.

## Errors

`FAMILY_MISMATCH`, `ADDRESS_INVALID`, `AMOUNT_INVALID`, `GAS_ESTIMATE_FAILED`, `INSUFFICIENT_FUNDS`, `BROADCAST_FAILED`, `CONFIRM_TIMEOUT`, plus gate denials (`GATE_DENIED`, `GATE_CAPPED`) and pass-through resolution/unlock errors.

## Dependencies

`core`, `chains`, `read` (UTXOs and fees), `sign`, `gate`, `keys` (address derivation and unlock).

## Invariants

- The gate decides before anything is signed; a denial costs zero network writes.
- EVM balance pre-check covers worst-case value + gasLimit * maxFeePerGas; gas limit carries a 20 percent buffer over the node estimate.
- BTC fee rate defaults to the half-hour estimate; sweep (`all`) sends total minus fee.
- Broadcast is direct to public RPC and Esplora; no relayer, no third-party signer.

## How to modify this blackbox safely

Fee-bumping/replacement and richer wait strategies are additive verbs. Never reorder gate after sign. Keep the real-testnet e2e green (it self-funds via the faucet layer); it is the proof that a signed tx actually lands.
