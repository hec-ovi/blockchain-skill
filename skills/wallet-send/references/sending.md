# Sending details

## Amount units

- `--amount` is display units: ETH on EVM, the token's own units for `--token`, BTC on Bitcoin.
- `--amount-raw` is base units: wei, token smallest unit, or sats. `--amount-raw all` sweeps every confirmed Bitcoin UTXO to the recipient (single output, no change).

## EVM

- Fees are EIP-1559; the layer reads `maxFeePerGas`/`maxPriorityFeePerGas` from the node and adds a 20 percent gas-limit buffer over the estimate.
- Balance is pre-checked against worst-case `value + gasLimit * maxFeePerGas`; a shortfall returns `INSUFFICIENT_FUNDS` with nothing broadcast.
- ERC-20 sends encode `transfer(to, amount)` to the token contract; the recipient is the token argument, not the tx `to`.

## Bitcoin

- Only confirmed UTXOs are spent. Coinbase outputs on regtest are unspendable until 100 confirmations.
- Coin selection is largest-first; change returns to the sender's own address. Change below the 546-sat dust threshold folds into the fee.
- Fee rate defaults to the half-hour estimate; override with `--fee-rate <sat/vB>`.
- Taproot (p2tr) is the default address type; pass `--type p2wpkh` to spend from native segwit.

## Confirmation

EVM `--wait` blocks for the receipt (default 120s) and reports `confirmed` or `reverted`. Bitcoin is always asynchronous: the send returns a txid, and you poll `agent-wallet tx <network> <txid>` until `confirmed`.
