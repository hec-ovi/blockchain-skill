---
name: wallet-swap
description: Swap one token for another on an EVM chain without a UI wallet, using DEX aggregators (CoW, Kyber, Uniswap). Use to trade tokens, get the best rate across aggregators, or preview a swap quote. Trigger on swap, trade, exchange token, convert token, best price, DEX, slippage. For same-token cross-chain moves use wallet-bridge; for a plain transfer use wallet-send.
---

# wallet-swap

Non-custodial: you approve the aggregator's spender and either sign a router transaction (Kyber) or sign an intent order that solvers fill (CoW). Amounts are base units of the sell token.

## Quote (read-only)

`agent-wallet swap-quote <chain> --sell 0xSELL --buy 0xBUY --amount 1000000000000000000 --from 0xYOU`

Returns the best `buyAmount` across supported adapters, plus `minBuyAmount` after slippage. Add `--adapter cow|kyber|uniswap` to force one, `--slippage 50` for basis points (default 50 = 0.5%).

## Execute

`agent-wallet swap <chain> --sell 0xSELL --buy 0xBUY --amount 1000000000000000000 --wallet main --wait`

The sender is derived from the wallet. The layer approves the spender if allowance is short (an `approvalTx`), then:
- Kyber: signs and broadcasts a router call (`swapTx`).
- CoW: signs an EIP-712 order and posts it; solvers execute and pay gas (`orderUid`). Track at explorer.cow.fi.

## Expect

- Swaps usually run on mainnet, which is DENIED by default. Enable the chain in `~/.agent-wallet/config.json` first (see the agent-wallet router's safety reference).
- CoW is preferred where available (gasless, MEV-protected, protocol-enforced limit price). Uniswap is quote-only here; execute via Kyber or CoW.
- Re-quote if execution fails; routes and fees expire quickly.

Details on adapters, slippage, and CoW orders: [references/adapters.md](references/adapters.md).
