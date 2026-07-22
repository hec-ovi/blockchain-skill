# bridge

contractVersion: 1.0.0

## Purpose

Moves assets across chains: quote a route, execute the source-chain transaction non-custodially, and track destination delivery.

## Inputs

- quote: `{fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, toAddress?, slippage?}`.
- bridge (execute): quote input plus `{wallet, passphrase, index?, rpc?, wait?}`.
- status: `{txHash, fromChain?, toChain?, tool?}`.

## Outputs

All wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- quote: [schema/bridge-quote-output.json](schema/bridge-quote-output.json). Carries the source `transactionRequest` and `toAmountMin`.
- bridge: [schema/bridge-execute-output.json](schema/bridge-execute-output.json). `sourceTx` is the source-chain hash (with an `approvalTx` if allowance was short); delivery on the destination is asynchronous, tracked via status.
- status: [schema/bridge-status-output.json](schema/bridge-status-output.json). `PENDING` until the destination fills; `DONE` on delivery.

## Events

None.

## Errors

`BRIDGE_QUOTE_FAILED`, `BRIDGE_TX_FAILED`, `BRIDGE_STATUS_FAILED`, `FAMILY_MISMATCH`, plus gate denials.

## Dependencies

`core`, `chains`, `gate`, `keys`, `sign`. External: LI.FI API (li.quest, keyless; optional `LIFI_API_KEY` env raises rate limits).

## Invariants

- Keyless by default; a LI.FI key is an optional accelerator.
- The gate decides before approval or broadcast; mainnet bridges require explicit opt-in.
- EVM-to-EVM only in this version; EVM-to-Bitcoin is out of scope.
- The quote is persisted to `$AGENT_WALLET_HOME/state/` before execution; a bridge is inherently two-phase, so status is a separate call.

## How to modify this blackbox safely

Additional bridge providers are new modules mirroring `lifi.ts` (additive). Keep the source-tx path gated. Quote/status parsing is fixture-tested; live corridor tests sit behind `RUN_LIVE`; the source-broadcast path reuses the same signed-tx machinery proven by the send and swap e2e suites.
