# keys

contractVersion: 1.0.0

## Purpose

Creates and unlocks wallets: BIP-39 mnemonics encrypted at rest (keystore v3), HD address derivation for EVM and Bitcoin.

## Inputs

- createWallet: [schema/create-wallet-input.json](schema/create-wallet-input.json). Preconditions: name unused, passphrase >= 8 chars.
- importWallet: [schema/import-wallet-input.json](schema/import-wallet-input.json). Preconditions: valid BIP-39 english mnemonic.
- getAddresses: [schema/address-query-input.json](schema/address-query-input.json). Preconditions: wallet exists, passphrase unlocks it, count <= 100.

## Outputs

All wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- Wallet created/imported: [schema/wallet-created-output.json](schema/wallet-created-output.json). Postcondition: keystore file written 0600 under `$AGENT_WALLET_HOME/keystore/<name>.json`; the mnemonic appears in this response once and nowhere else.
- Wallet list: [schema/wallet-list-output.json](schema/wallet-list-output.json).
- Addresses: [schema/address-list-output.json](schema/address-list-output.json). Postcondition: EVM path `m/44'/60'/0'/0/i`; BTC `m/86'` (p2tr, default) or `m/84'` (p2wpkh).

`unlockMnemonic(name, passphrase)` is process-internal for the sign layer; it never crosses the CLI/MCP boundary.

## Events

None.

## Errors

`WALLET_NAME_INVALID`, `WALLET_EXISTS`, `WALLET_NOT_FOUND`, `PASSPHRASE_TOO_SHORT`, `PASSPHRASE_WRONG`, `MNEMONIC_INVALID`, `KEYSTORE_UNSUPPORTED`, `KEYSTORE_MAC_MISMATCH`, `KEY_DERIVE_FAILED`, `RANGE_INVALID`.

## Dependencies

`core` (envelope, home dir). Crypto: @scure/bip32, @scure/bip39, @scure/btc-signer, viem/accounts, ethereum-cryptography.

## Invariants

- Non-custodial: secrets exist only in this layer's process memory and the encrypted keystore file. No network access in this layer, ever.
- Keystore is Web3 Secret Storage v3 (scrypt N=262144 r=8 p=1 default, aes-128-ctr, keccak MAC) holding BIP-39 entropy, flagged by `xAgentWallet.secret = "bip39-entropy"`.
- Passphrases are NFKC-normalized before key derivation. Nothing in this layer logs or persists a mnemonic or passphrase.

## How to modify this blackbox safely

New derivation families (e.g. another purpose path) are additive: extend the enums in `src/contract.ts`, bump minor here, run `npm run schemas`. Never change existing paths or keystore semantics in place; a wallet written by version N must decrypt under N+1. Test with the fast scrypt params, keep the BIP-86 and anvil-account-0 vectors green.
