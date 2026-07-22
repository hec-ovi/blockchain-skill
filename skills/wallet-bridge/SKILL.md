---
name: wallet-bridge
description: Move assets across blockchains (bridge) non-custodially via LI.FI. Use to send a token from one chain to another, e.g. USDC from Ethereum to Arbitrum, or to check the delivery status of a cross-chain transfer. Trigger on bridge, cross-chain, move to another chain, transfer between chains, L2, chain to chain. For same-chain token trades use wallet-swap.
---

# wallet-bridge

Bridging is two-phase: a source-chain transaction you sign and broadcast, then asynchronous delivery on the destination. EVM-to-EVM in this version.

## Quote (read-only)

`agent-wallet bridge-quote --from-chain ethereum --to-chain arbitrum --from-token 0xUSDC_ETH --to-token 0xUSDC_ARB --amount 100000000 --address 0xYOU`

Returns the route, `toAmountMin`, and the source `transactionRequest`. Amounts are base units.

## Execute

`agent-wallet bridge --from-chain ethereum --to-chain arbitrum --from-token 0xUSDC_ETH --to-token 0xUSDC_ARB --amount 100000000 --wallet main --wait`

The source address is derived from the wallet. The layer approves the bridge spender if needed, then signs and broadcasts the source tx and returns `sourceTx`.

## Track delivery

`agent-wallet bridge-status <sourceTx> --from-chain ethereum --to-chain arbitrum`

`PENDING` until the destination fills, then `DONE` (or `FAILED`).

## Expect

- Mainnet bridges are DENIED by default; enable the source chain in `~/.agent-wallet/config.json` first.
- Native-token bridges need no approval; ERC-20 bridges insert an `approvalTx`.
- Set `LIFI_API_KEY` only to raise rate limits; it is not required.
- Re-quote if execution fails; routes expire. The quote is saved to state for resume.
