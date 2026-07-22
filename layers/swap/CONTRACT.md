# swap

contractVersion: 1.0.0

## Purpose

Token swaps without a UI wallet: quote across DEX aggregators and execute, non-custodially, on any supported EVM chain.

## Inputs

- quote: `{chain, sellToken, buyToken, sellAmount, from, receiver?, slippageBps?, adapter?, rpc?}`.
- swap (execute): quote input plus `{wallet, passphrase, index?, wait?}`.

## Outputs

All wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- quote: [schema/swap-quote-output.json](schema/swap-quote-output.json). Best `buyAmount` across supported adapters unless one is named; `minBuyAmount` applies slippage; `spender` is the allowance target.
- swap: [schema/swap-execute-output.json](schema/swap-execute-output.json). `kind` is `tx` (aggregator router call, with an `approvalTx` if allowance was short) or `order` (CoW intent, `orderUid` to track, no gas tx from us).

## Events

None.

## Errors

`SWAP_UNSUPPORTED_CHAIN`, `SWAP_ADAPTER_UNKNOWN`, `SWAP_QUOTE_FAILED`, `SWAP_BUILD_FAILED`, `SWAP_TX_FAILED`, `SWAP_ORDER_REJECTED`, `SWAP_EXEC_UNSUPPORTED`, `FAMILY_MISMATCH`, plus gate denials (`GATE_DENIED`, `GATE_CAPPED`).

## Dependencies

`core`, `chains`, `gate`, `keys`, `sign`. External: CoW Protocol API, KyberSwap aggregator API (both keyless), Uniswap v3 QuoterV2 (on-chain, keyless).

## Invariants

- Keyless: every adapter works with no API key.
- The gate decides before any approval, signature, or broadcast; a denial writes nothing and signs nothing. Swaps on mainnet require explicit opt-in (they are denied by default like every mainnet write).
- CoW execution signs an EIP-712 order (GPv2, settlement `0x9008D19f58AAbD9eD0D60971565AA8510560ab41`); the signed limit price is the slippage floor. Uniswap is quote-only here (execution via kyber or cow).
- The quote is persisted to `$AGENT_WALLET_HOME/state/` before execution so a failed broadcast is resumable.

## How to modify this blackbox safely

New aggregators are new adapters implementing `SwapAdapter` (additive). Keep every adapter keyless-by-default. Never let execute skip the gate. Quote parsing is fixture-tested; the execute path is proven on anvil against a deployed mock token+router; live quote tests sit behind `RUN_LIVE`.
