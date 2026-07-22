# Keys, derivation, and storage

## Derivation paths

- EVM: `m/44'/60'/0'/0/i` (secp256k1), address index `i`.
- Bitcoin taproot (default): `m/86'/coin'/0'/0/i`, `coin` = 0 mainnet, 1 for signet/testnet/regtest.
- Bitcoin native segwit: `m/84'/coin'/0'/0/i`.

Derivation matches the official BIP-86 and BIP-84 vectors, so addresses line up with any other standard wallet restored from the same seed.

## Keystore format

Web3 Secret Storage v3: scrypt (N=262144 by default) + aes-128-ctr + keccak MAC, holding the BIP-39 entropy. Interoperable with geth and `cast wallet import`. Files are written mode 0600 under `~/.agent-wallet/keystore/`.

Set `AGENT_WALLET_SCRYPT_N` to a smaller power of two (>= 1024) only for tests; production should keep the default.

## Passphrase

Comes from `AGENT_WALLET_PASSPHRASE` or `--passphrase`. It is NFKC-normalized before key derivation and never written to disk or logs. A wrong passphrase returns `PASSPHRASE_WRONG`; there is no recovery path without it.

## Data directory

Override the root with `AGENT_WALLET_HOME` (default `~/.agent-wallet`). It holds `keystore/`, `state/` (multi-step operation resume files), `cache/` (chain registry), and `config.json`.
