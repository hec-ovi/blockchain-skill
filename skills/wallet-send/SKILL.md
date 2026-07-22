---
name: wallet-send
description: Check balances and send crypto directly on-chain, non-custodially. Use to send native coin (ETH, MATIC, ...), an ERC-20 token, or BTC, to sweep a Bitcoin address, or to look up a balance or transaction. Trigger on send, transfer, pay, withdraw, balance, how much, sweep, receive confirmation, check transaction. Not for token-for-token trades (use wallet-swap) or cross-chain (use wallet-bridge).
---

# wallet-send

## Read first

- Balance: `agent-wallet balance <chain> <address>` (add `--token 0x..` for an ERC-20).
- Fees: `agent-wallet fees <chain>`.
- Bitcoin UTXOs: `agent-wallet utxos <btc-network> <address>`.
- Transaction: `agent-wallet tx <chain> <hash-or-txid>`.

## Send

Native coin:
`agent-wallet send <chain> --to 0x.. --amount 0.5 --wallet main --wait`

ERC-20 token (amount in display units of the token):
`agent-wallet send <chain> --to 0x.. --amount 100 --token 0xTOKEN --wallet main`

Bitcoin (amount in BTC, or base units / sweep):
`agent-wallet send bitcoin --to bc1p.. --amount 0.001 --wallet main`
`agent-wallet send signet --to tb1p.. --amount-raw all --wallet main` (sweep)

MCP: `send {chain, to, amount|amountRaw, token?, wallet, wait?}`.

## Expect

- Mainnet is denied by default; a `GATE_DENIED` error's hint shows the exact config change to allow it.
- EVM `--wait` returns a confirmed/reverted status; without it you get `broadcast` plus a hash.
- Bitcoin returns `broadcast` plus a txid; track with `agent-wallet tx <network> <txid>`.
- Insufficient funds are caught before broadcast (`INSUFFICIENT_FUNDS`).

For fee strategy, ERC-20 vs native, and Bitcoin coin selection, see [references/sending.md](references/sending.md).
