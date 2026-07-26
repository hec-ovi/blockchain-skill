---
name: agent-wallet
description: Operate a non-custodial blockchain wallet on-chain (EVM and Bitcoin), no exchange or MetaMask. Create or import a wallet, balances, send native/ERC-20/BTC, swap tokens, compile/deploy/call Solidity. Trigger on wallet, crypto, ETH, BTC, ERC-20, token, send, transfer, swap, trade, Solidity, contract, on-chain, testnet, mainnet, sepolia.
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

**Passphrase** (signing verbs). Do this once, then stop touching it:

1. If cwd `.env` already has `AGENT_WALLET_PASSPHRASE`, use it (CLI auto-loads `.env`). Do not invent another.
2. Else create `.env` once with `AGENT_WALLET_PASSPHRASE=<random >=8 chars>` and `AGENT_WALLET_HOME=./.agent-wallet-data` (or keep default home). Never print the passphrase in chat.
3. On `PASSPHRASE_WRONG`: stop. Do not brute-force, dump keystore JSON, or reverse-engineer the bundle.

Fund testnets by receiving from an external wallet or a public testnet drip site. This toolkit does not drip gas.

## When to use which

| Intent | Verb |
|---|---|
| Session ready? | `init` |
| New / restore wallet | `wallet-create` / `wallet-import` |
| Receive address | `wallet-addresses` |
| Export key / backup secrets | `wallet-export` (prefer `--out`) |
| Balance / fees / tx / UTXOs | `balance` / `fees` / `tx` / `utxos` |
| Pay someone (native, ERC-20, BTC) | `send` |
| Same-chain token A → B | `swap-quote` then `swap` (sell WETH not bare ETH; `wrap` first if needed) |
| ETH ↔ WETH | `wrap` / `unwrap` |
| Unknown contract | `contract-learn` then call/write |
| Deploy | `contract-compile` then `contract-deploy` |
| Chain meta / RPC alive | `chain-resolve` / `chain-check` |

`send` = transfer to an address. `swap` = convert tokens for yourself. Never default to mainnet silently; ask which network; state it in answers.

**Amounts:** never invent vague sizes ("tiny", "a bit"). Use an explicit number the user gave, or pick a concrete value and state it (e.g. `0.00001` ETH display, or raw base units for swap). Leave gas headroom on the balance.

**Use this CLI only** for wallet/chain ops. Do not quote swaps via random web APIs (0x, Uniswap web, curl to aggregators). `swap-quote` / `swap` on the CLI are the path.

## Commands

Examples use `agent-wallet`; substitute your resolved CLI. Chain = name (`sepolia`, `base`, `ethereum`) or id. One mnemonic → same EVM address on every EVM chain.

### Wallet

```
agent-wallet wallet-create --name main
agent-wallet wallet-import --name main --mnemonic "..."
agent-wallet wallet-list
agent-wallet wallet-addresses --name main --family evm
agent-wallet wallet-addresses --name main --family btc --network signet
# secrets: prefer file (0600); only when the user asks
agent-wallet wallet-export --name main --family evm --out ./wallet-export.json
agent-wallet wallet-export --name main --family evm --include-mnemonic --out ./wallet-full.json
```

Mnemonic is shown **ONCE** at create; tell the user to back it up; the keystore cannot recover it without the passphrase. `wallet-export` returns address + private key (and optional mnemonic). Prefer `--out <file>` so secrets go to a mode-0600 file; hand the user that file or its contents only if they asked. Never export unprompted.

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

### Swap / wrap (base units for swap sell amount)

```
agent-wallet wrap <chain> --amount 0.0001 --wallet main --wait
agent-wallet unwrap <chain> --amount 0.0001 --wallet main --wait
agent-wallet swap-quote <chain> --sell 0xWETH --buy 0xTOKEN --amount <raw> --from 0xYOU
agent-wallet swap <chain> --sell 0xWETH --buy 0xTOKEN --amount <raw> --wallet main --wait
```

Quote first with an **exact** raw amount. Do not sell bare native: `wrap` then sell WETH. Prefer CoW where liquid; Uniswap works on Sepolia when pools exist; Kyber on mainnets. Optional `--adapter cow|kyber|uniswap`, `--slippage 50` (bps). Re-quote if stale.

### Contracts

```
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
- Gated: send, swap, wrap, unwrap, contract-deploy, contract-write. Reads and quotes are not.
- Keys: `keystore/<name>.json` Web3 v3 scrypt; passphrase never logged.

## Anti-patterns

- Never skip `agent-wallet init` on first use in a session.
- Never re-bootstrap (curl/clone) when `dist/agent-wallet.mjs` is already in the skill pack.
- Never default to mainnet silently; ask the network first.
- Never put the passphrase in chat; use env or `.env`.
- Never invent a new passphrase after `wallet-create`; one `.env` for the session/workspace.
- Never brute-force after `PASSPHRASE_WRONG`; never `cat` keystore files to recover secrets.
- Never `balance` with a wallet name; always an address.
- Never `swap` when the user asked to transfer to someone; use `send` (`--token` if ERC-20).
- Never `send` when they asked to convert A→B for themselves; use `swap`.
- Never retry `GATE_DENIED` except via config.json.
- Never execute a stale swap quote; re-quote.
- Never call an unknown contract before `contract-learn`.
