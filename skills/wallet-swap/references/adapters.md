# Swap adapters

All adapters are keyless. Quote picks the best `buyAmount` unless you name one with `--adapter`.

## CoW Protocol (preferred)

- Intent model: you sign an EIP-712 order (GPv2 settlement `0x9008D19f58AAbD9eD0D60971565AA8510560ab41`); solvers execute and pay settlement gas. Failed or unfilled orders cost nothing.
- The signed limit price (buyAmount after slippage) is enforced by the settlement contract, which is stronger than calldata `minOut`.
- One-time approval to the vault relayer `0xC92E8bdf79f0507f65a392b0ab4667716BFE0110`.
- Chains: Ethereum, Gnosis, Base, Arbitrum, Polygon, Avalanche, and Sepolia (testnet). Settlement is a batch auction (~15s), so execution is not instant.

## KyberSwap (fallback)

- Aggregator API returns router calldata; the swap is a normal signed transaction to the router, gated like any write.
- Instant execution, 9+ chains. Slippage guard is the router's `minAmountOut`.

## Uniswap (quote backstop)

- On-chain QuoterV2 read, needs only an RPC, no API. Single-venue pricing (no aggregation).
- Quote-only in this version; execute via CoW or Kyber.

## Slippage

`--slippage` is basis points (50 = 0.5%). `minBuyAmount = buyAmount * (10000 - bps) / 10000`. The quote is persisted to `~/.agent-wallet/state/` before execution so a failed broadcast is resumable.
