---
name: agent-wallet
description: Operate a non-custodial blockchain wallet on-chain (EVM and Bitcoin), no exchange or MetaMask. Create or import a wallet, balances, send native/ERC-20/BTC, swap tokens, bridge chains, faucet testnets, compile/deploy/call Solidity. Trigger on wallet, crypto, ETH, BTC, ERC-20, token, send, transfer, swap, bridge, trade, Solidity, contract, on-chain, testnet, mainnet, faucet, sepolia.
---

# agent-wallet

Instructions only. Every action is the `agent-wallet` CLI: one process, JSON envelope `{ok, data, error, meta}` on stdout, then exit. On `ok:false` follow `error.hint`. Keys stay local (keystore v3). No custodial middleman.

## Start here

Node >= 22.18. Skill packs ship `dist/agent-wallet.mjs` (no npm install).

**Resolve CLI once** (first hit wins; reuse it):

```
command -v agent-wallet
test -x .noob/skills/agent-wallet/agent-wallet && echo .noob/skills/agent-wallet/agent-wallet
test -f .noob/skills/agent-wallet/dist/agent-wallet.mjs && echo "node .noob/skills/agent-wallet/dist/agent-wallet.mjs"
test -x ./agent-wallet && echo ./agent-wallet
```

**Init once per session:**

```
agent-wallet init
```

Read `data.ready`, `data.nextActions`, `data.notes`. Do not hand-probe the install.

**Passphrase** (signing verbs): `export AGENT_WALLET_PASSPHRASE=...` (>= 8 chars) or workspace `.env` (CLI loads cwd `.env`). Never paste into chat. Prefer durable `.env` over `/tmp`. On `PASSPHRASE_WRONG`, stop; never brute-force the keystore.

Optional: `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` for `faucet` only.

## When to use which

| Intent | Verb |
|---|---|
| Session ready? | `init` |
| New / restore wallet | `wallet-create` / `wallet-import` |
| Receive address | `wallet-addresses` |
| Balance / fees / tx / UTXOs | `balance` / `fees` / `tx` / `utxos` |
| Pay someone (native, ERC-20, BTC) | `send` |
| Same-chain token A → B | `swap-quote` then `swap` |
| Cross-chain | `bridge-quote` then `bridge` then `bridge-status` |
| Free testnet gas | `faucet` |
| Unknown contract | `contract-learn` then call/write |
| Deploy | `contract-compile` then `contract-deploy` |
| Chain meta / RPC alive | `chain-resolve` / `chain-check` |

`send` = transfer to an address. `swap` = convert tokens for yourself. `bridge` = change chain. Never default to mainnet silently; ask which network; state it in answers.

## Commands

Examples use `agent-wallet`; substitute your resolved CLI. Chain = name (`sepolia`, `base`, `ethereum`) or id. One mnemonic → same EVM address on every EVM chain.

### Wallet

```
agent-wallet wallet-create --name main
agent-wallet wallet-import --name main --mnemonic "..."
agent-wallet wallet-list
agent-wallet wallet-addresses --name main --family evm
agent-wallet wallet-addresses --name main --family btc --network signet
```

Mnemonic is shown **ONCE**; tell the user to back it up; the keystore cannot recover it without the passphrase.

### Read

```
agent-wallet balance <chain> <address> [--token 0x..]
agent-wallet fees <chain>
agent-wallet utxos <btc-network> <address>
agent-wallet tx <chain> <hash>
agent-wallet chain-resolve <chain>
agent-wallet chain-check <chain>
```

`balance` needs the **address**, not a wallet name. Resolve via `wallet-addresses` first if needed.

### Send

```
agent-wallet send <chain> --to 0x.. --amount 0.01 --wallet main --wait
agent-wallet send <chain> --to 0x.. --amount 10 --token 0xTOKEN --wallet main --wait
agent-wallet send signet --to tb1p.. --amount-raw all --wallet main
```

`--amount` = display units (ETH/token/BTC). `--amount-raw` = wei/token-raw/sats (`all` = BTC sweep). EVM `--wait` waits for receipt; BTC returns txid (poll `tx`).

### Swap (base units of sell token)

```
agent-wallet swap-quote <chain> --sell 0xSELL --buy 0xBUY --amount <raw> --from 0xYOU
agent-wallet swap <chain> --sell 0xSELL --buy 0xBUY --amount <raw> --wallet main --wait
```

Quote first. Prefer CoW when available (incl. Sepolia); Kyber executes router txs; Uniswap is quote-only. Mainnet needs gate open. Re-quote if stale. Optional `--adapter cow|kyber|uniswap`, `--slippage 50` (bps).

### Bridge (EVM→EVM, base units)

```
agent-wallet bridge-quote --from-chain A --to-chain B --from-token 0x.. --to-token 0x.. --amount <raw> --address 0xYOU
agent-wallet bridge --from-chain A --to-chain B --from-token 0x.. --to-token 0x.. --amount <raw> --wallet main --wait
agent-wallet bridge-status <sourceTx> --from-chain A --to-chain B
```

### Faucet / contracts

```
agent-wallet faucet --network base-sepolia|sepolia --token eth --wallet main
agent-wallet contract-learn <chain> <address>
agent-wallet contract-compile --source ./X.sol --name X
agent-wallet contract-deploy <chain> --source ./X.sol --name X --args "a,b" --wallet main
agent-wallet contract-call <chain> <addr> --fn name --args a,b --abi ./abi.json
agent-wallet contract-write <chain> <addr> --fn name --args a,b --abi ./abi.json --wallet main --wait
```

Never call an unknown contract before `contract-learn`; check `verified`. Use deploy/learn ABI for call/write. View → call; state change → write.

## Safety

Gate is deterministic code before sign/broadcast. It cannot be talked out of a decision. Prompt text is not enforcement.

- Mainnet is DENIED by default. Testnets (sepolia, base-sepolia, signet) allowed.
- Config: `~/.agent-wallet/config.json` → `gate.allowMainnet`, `gate.allowedChains`, `gate.maxValueWei` / `maxAmountSats`.
- Gated: send, swap, bridge, contract-deploy, contract-write. Reads and quotes are not.
- Keys: `keystore/<name>.json` Web3 v3 scrypt; passphrase never logged.

## Anti-patterns

- Never skip `agent-wallet init` on first use in a session.
- Never re-bootstrap (curl/clone) when `dist/agent-wallet.mjs` is already in the skill pack.
- Never default to mainnet silently; ask the network first.
- Never put the passphrase in chat; use env or `.env`.
- Never brute-force after `PASSPHRASE_WRONG`.
- Never `balance` with a wallet name; always an address.
- Never `swap` when the user asked to transfer to someone; use `send` (`--token` if ERC-20).
- Never `send` when they asked to convert A→B for themselves; use `swap`.
- Never retry `GATE_DENIED` except via config.json.
- Never execute a stale swap/bridge quote; re-quote.
- Never call an unknown contract before `contract-learn`.
