# Safety model

The gate is deterministic code that runs before anything is signed or broadcast. It cannot be talked out of a decision; prompt text is not an enforcement mechanism.

## Defaults (no config file)

- Testnets (Sepolia, Base Sepolia, Bitcoin signet): allowed.
- Every mainnet (Ethereum, Bitcoin, Base, ...): denied.
- No per-transaction cap.

## Config: `~/.agent-wallet/config.json`

```json
{
  "gate": {
    "allowMainnet": false,
    "allowedChains": [],
    "maxValueWei": null,
    "maxAmountSats": null
  },
  "learn": { "etherscanApiKey": "" }
}
```

- `allowMainnet: true` opens every mainnet.
- `allowedChains: [1, "bitcoin"]` opens only those, leaving `allowMainnet` false.
- `maxValueWei` / `maxAmountSats` cap the native amount per send/swap/bridge on EVM / Bitcoin. Over-limit operations return `GATE_CAPPED`.

## What is gated

Every state-changing operation: `send`, `swap`, `bridge`, `contract_deploy`, `contract_write`, and raw `sign`. Reads (`balance`, `tx_status`, `contract_call`, `*_quote`, `contract_learn`) are never gated.

## Keys at rest

The mnemonic is stored only in `~/.agent-wallet/keystore/<name>.json`, encrypted with your passphrase (Web3 keystore v3, scrypt). The passphrase is never written to disk or logs. Back up the mnemonic shown at creation; the keystore cannot recover it without the passphrase.
