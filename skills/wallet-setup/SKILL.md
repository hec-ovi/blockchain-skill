---
name: wallet-setup
description: Create or import a non-custodial crypto wallet and derive receive addresses. Use when the user needs a new wallet, wants to restore one from a seed phrase, or asks for an address to receive ETH, tokens, or BTC. Trigger on create wallet, new wallet, import seed, mnemonic, recovery phrase, receive address, deposit address.
---

# wallet-setup

Keys are generated and stored locally, encrypted. No exchange, no browser extension.

## Steps

1. Ensure `AGENT_WALLET_PASSPHRASE` is exported (the keystore encryption passphrase).
2. Create a wallet (new mnemonic):
   `agent-wallet wallet-create --name main`
   MCP: `wallet_create {name}`. The response shows the mnemonic ONCE. Tell the user to back it up; it cannot be recovered from the keystore without the passphrase.
3. Or import an existing seed:
   `agent-wallet wallet-import --name main --mnemonic "word1 ... word12"`
4. List wallets: `agent-wallet wallet-list`.
5. Get a receive address:
   - EVM: `agent-wallet wallet-addresses --name main --family evm`
   - Bitcoin: `agent-wallet wallet-addresses --name main --family btc --network bitcoin` (taproot by default; add `--type p2wpkh` for native segwit)

## Notes

- One mnemonic covers every EVM chain and Bitcoin. The same wallet's EVM address is identical on all EVM chains.
- `--count N` and `--start i` derive multiple addresses.
- For key formats, derivation paths, and passphrase handling, see [references/keys.md](references/keys.md).
