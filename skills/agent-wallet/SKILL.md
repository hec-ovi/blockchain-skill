---
name: agent-wallet
description: Operate a non-custodial blockchain wallet directly on-chain (EVM and Bitcoin), no exchange or MetaMask. Use to create or import a wallet, check balances, receive, send native coin / ERC-20 / BTC, swap tokens, bridge across chains, fund testnets, and author, deploy, verify, call, or write Solidity smart contracts. Trigger on wallet, crypto, ETH, BTC, ERC-20, token, send, transfer, swap, bridge, trade, Solidity, contract, on-chain, testnet, mainnet, faucet, sepolia.
---

# agent-wallet

You are the operator of a local non-custodial toolkit. This skill is instructions only; every on-chain action runs through the `agent-wallet` CLI (one process per verb, JSON envelope on stdout, exit). No exchange, no browser wallet, no custodial API for keys.

Envelope: `{ok, data, error, meta}`. On `ok:false`, obey `error.hint`. Do not invent a second tool path.

## Expert operating protocol

1. **Resolve CLI once** (section Setup) and reuse that exact command.
2. **`init` once per session** before keystore or chain work.
3. **Confirm network** if the user did not name one; never default to mainnet silently. State the network in every answer that involves balances or txs.
4. **Route the user intent** to the right verb (table below). Prefer the smallest correct path.
5. **Read before write.** Quote before swap/bridge. `contract-learn` before calling an unknown contract. Balance before send.
6. **Gate is law.** Mainnet is DENIED by default. `GATE_DENIED` is fixed only by editing `~/.agent-wallet/config.json` (or `$AGENT_WALLET_HOME/config.json`), never by arguing in chat.
7. **Report concrete results:** addresses, amounts with units, tx hashes, explorer links when `data.explorer` exists, and the network name.

### Intent → verb (route here first)

| User wants | Do this |
|---|---|
| Set up / is it working? | `init` then `version` if needed |
| New wallet / backup seed | `wallet-create` (show mnemonic once, tell user to back it up) |
| Restore seed | `wallet-import` |
| "My address" / receive | `wallet-addresses` (EVM or BTC) |
| Balance / holdings | `wallet-addresses` then `balance <chain> <address>` (+ `--token` for ERC-20) |
| Gas price / fees | `fees <chain>` |
| BTC UTXOs | `utxos <btc-network> <address>` |
| Tx status | `tx <chain> <hash>` |
| Transfer / pay / send ETH or BTC | `send` |
| Transfer ERC-20 | `send` with `--token 0x..` |
| Swap / trade / "change token A to B" | `swap-quote` then `swap` (same chain) |
| Move value to another chain | `bridge-quote` then `bridge` then `bridge-status` |
| Free testnet gas | `faucet` (CDP keys required) |
| What does this contract do? | `contract-learn` |
| Read contract state | `contract-call` (after ABI from learn/deploy) |
| Write contract state | `contract-write` |
| Deploy new contract | `contract-compile` then `contract-deploy` |
| Is RPC alive? | `chain-check` |
| Resolve chain id/RPC | `chain-resolve` |

Native ETH transfers use `send`. Token→token on the **same** chain uses `swap`. Cross-chain uses `bridge`. Do not use `swap` for "send USDC to my friend" (that is `send --token`).

## Setup (first use only)

Requires Node >= 22.18. When this skill pack is installed, it ships `dist/agent-wallet.mjs` (no npm install required).

### 1. Resolve the CLI (once per session)

Pick the first that works; reuse it for every later verb:

```sh
command -v agent-wallet
test -x .noob/skills/agent-wallet/agent-wallet && echo .noob/skills/agent-wallet/agent-wallet
test -f .noob/skills/agent-wallet/dist/agent-wallet.mjs && echo "node .noob/skills/agent-wallet/dist/agent-wallet.mjs"
test -x ./agent-wallet && echo ./agent-wallet
test -f ./dist/agent-wallet.mjs && echo "node ./dist/agent-wallet.mjs"
# optional when published: npx --yes agent-wallet-skill@0.3.2
```

Below, `agent-wallet` means your resolved form.

### 2. init (session doctor)

```sh
agent-wallet init
```

Read `data.ready`, `data.nextActions`, `data.notes`, `data.passphraseSet`, `data.walletCount`, `data.cdpKeySet`. Do not replace init with ad-hoc probes.

### 3. Passphrase

```sh
export AGENT_WALLET_PASSPHRASE=...   # never paste into chat; >= 8 chars
```

Prefer a gitignored workspace `.env` with `AGENT_WALLET_PASSPHRASE=...` (CLI auto-loads cwd `.env`). Do not invent a random passphrase into `/tmp` and lose it. Do not override an existing env/`.env` passphrase.

`PASSPHRASE_WRONG` / `PASSPHRASE_TOO_SHORT`: stop. No brute-force, no dumping keystore JSON, no reverse-engineering the bundle.

### 4. Optional keys

| Env | Enables |
|---|---|
| `AGENT_WALLET_PASSPHRASE` | All signing verbs |
| `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` | `faucet` |
| `ETHERSCAN_API_KEY` | Faster/extra contract verification lookup |
| `LIFI_API_KEY` | Higher bridge rate limits (not required) |

## Chain references

Names (`ethereum`, `base`, `sepolia`, `base-sepolia`), numeric ids (`1`, `8453`, `11155111`), or Bitcoin (`bitcoin`, `signet`, `testnet`). One address holds different balances per network. Always scope reads/writes to one network and name it in the answer.

Common testnets (allowed by default): `sepolia`, `base-sepolia`, Bitcoin `signet`. Mainnets denied until config opt-in.

## Verb catalog (complete)

### Session

- `agent-wallet version`
- `agent-wallet init`
- `agent-wallet help`

### Wallet

```sh
agent-wallet wallet-create --name main
agent-wallet wallet-import --name main --mnemonic "word1 ... word12"
agent-wallet wallet-list
agent-wallet wallet-addresses --name main --family evm
agent-wallet wallet-addresses --name main --family btc --network signet
agent-wallet wallet-addresses --name main --family btc --network bitcoin --type p2wpkh
```

One mnemonic covers all EVM chains (same 0x address everywhere) and Bitcoin (different derivation). Mnemonic is shown **ONCE** at create; tell the user to back it up; the keystore cannot recover it without the passphrase.

### Chains and reads

```sh
agent-wallet chain-resolve sepolia
agent-wallet chain-check sepolia
agent-wallet balance sepolia 0xADDRESS
agent-wallet balance sepolia 0xADDRESS --token 0xTOKEN
agent-wallet fees sepolia
agent-wallet utxos signet tb1p...
agent-wallet tx sepolia 0xHASH
```

`balance` requires the **address**, not a wallet name (no `--wallet` on balance). Resolve with `wallet-addresses` first if needed. `wallet-list` does not need a passphrase.

### Send (transfer native, ERC-20, or BTC)

```sh
# native
agent-wallet send sepolia --to 0xTO --amount 0.01 --wallet main --wait
# ERC-20 (amount in token display units)
agent-wallet send sepolia --to 0xTO --amount 10 --token 0xTOKEN --wallet main --wait
# base units / sweep BTC
agent-wallet send sepolia --to 0xTO --amount-raw 1000000000000000 --wallet main
agent-wallet send signet --to tb1p... --amount-raw all --wallet main
```

- `--amount` = display units (ETH, token units, BTC). `--amount-raw` = wei / token raw / sats (`all` = BTC sweep).
- EVM `--wait` blocks for receipt (`confirmed` / `reverted`). BTC always returns `broadcast` + txid; poll `tx`.
- `INSUFFICIENT_FUNDS` and `GATE_DENIED` stop before broadcast when possible.

### Swap (same-chain token → token)

Amounts for swap verbs are **base units** of the sell token (not display ETH).

```sh
agent-wallet swap-quote <chain> --sell 0xSELL --buy 0xBUY --amount 1000000000000000000 --from 0xYOU
agent-wallet swap <chain> --sell 0xSELL --buy 0xBUY --amount 1000000000000000000 --wallet main --wait
# optional: --adapter cow|kyber|uniswap  --slippage 50
```

- Always quote first; check `buyAmount` / `minBuyAmount`; then execute if the user wants the trade.
- Prefer CoW where available (gasless settlement, limit price enforced). Kyber executes a normal router tx. Uniswap is **quote-only**; execute via CoW or Kyber.
- CoW chains include Ethereum, Base, Arbitrum, Polygon, Avalanche, Gnosis, **Sepolia**.
- Mainnet swaps need gate open. Re-quote after any failure; routes expire.
- Native sell/buy may use the chain's native representation the adapter expects; if a quote fails on native, try the chain's wrapped native token (WETH) address after `contract-learn` or known WETH for that chain.

### Bridge (cross-chain EVM → EVM)

```sh
agent-wallet bridge-quote --from-chain ethereum --to-chain arbitrum --from-token 0xFROM --to-token 0xTO --amount 100000000 --address 0xYOU
agent-wallet bridge --from-chain ethereum --to-chain arbitrum --from-token 0xFROM --to-token 0xTO --amount 100000000 --wallet main --wait
agent-wallet bridge-status 0xSOURCE_TX --from-chain ethereum --to-chain arbitrum
```

Two-phase: source tx you sign, then async delivery. Track until `DONE` / `FAILED`. Source chain must pass the gate. Re-quote if stale.

### Faucet (testnet self-fund)

```sh
agent-wallet faucet --network base-sepolia --token eth --wallet main
agent-wallet faucet --network sepolia --token eth --address 0x...
```

Networks: `base-sepolia`, `sepolia`. Tokens: `eth`, `usdc`, `eurc`, `cbbtc` (CDP availability). Needs free CDP API keys. Not a substitute for mainnet funding.

### Contracts

```sh
agent-wallet contract-learn sepolia 0xCONTRACT
agent-wallet contract-compile --source ./My.sol --name MyToken
agent-wallet contract-deploy sepolia --source ./My.sol --name MyToken --args "arg1,arg2" --wallet main
agent-wallet contract-call sepolia 0xC --fn balanceOf --args 0xHOLDER --abi ./abi.json
agent-wallet contract-write sepolia 0xC --fn transfer --args "0xTO,1000" --abi ./abi.json --wallet main --wait
```

- Learn first on unknowns; check `verified`. Save ABI from learn/deploy for call/write.
- View/pure → `contract-call`. State-changing → `contract-write`. Payable: `--value <wei>`.
- Compile is in-process solc (optimizer 200). Deploy is gated and signed locally.

## Multi-step playbooks

### A. First-time testnet session

1. Resolve CLI → `init`
2. Ensure passphrase in `.env`
3. `wallet-create --name main` (user backs up mnemonic)
4. `wallet-addresses --name main --family evm` → give user the address + network
5. Fund: `faucet` if CDP set, else ask user to send testnet ETH
6. `balance sepolia <address>` until non-zero

### B. Pay someone (transfer)

1. Confirm network + asset (native vs token address)
2. Resolve your address; `balance` enough for amount + gas
3. `send <chain> --to ... --amount ... [--token ...] --wallet main --wait`
4. Report hash / explorer / `tx` if needed

### C. Change token A into token B (same chain)

1. Confirm chain; resolve sell/buy token addresses (user symbol → address if known; otherwise ask for 0x)
2. Amount to base units (respect token decimals; if unknown, `contract-learn` / `balance --token` metadata or on-chain decimals via call)
3. `swap-quote` → show expected out and min out
4. If user confirms and gate allows: `swap ... --wait`
5. `balance` both tokens after

### D. Move value to another chain

1. `bridge-quote` with from/to chain and token addresses
2. Confirm min out and source gas
3. `bridge ... --wait` → keep `sourceTx`
4. Poll `bridge-status` until terminal

### E. Deploy and poke a contract

1. Write/read Solidity file
2. `contract-compile` → fix compiler errors from `error.hint`
3. `contract-deploy` on chosen testnet
4. Save `address` + `abi`
5. `contract-call` / `contract-write` as needed

### F. Return funds / sweep

1. `balance` sender
2. Leave gas headroom on EVM; or BTC `--amount-raw all` to sweep
3. `send` to user's address with `--wait`
4. Give them the tx hash

## Safety model

The gate is deterministic code before sign/broadcast. It cannot be talked out of a decision.

Defaults (no config):

- Testnets allowed (Sepolia, Base Sepolia, Bitcoin signet, …)
- Every mainnet denied
- No per-tx cap

Config: `~/.agent-wallet/config.json` (or `$AGENT_WALLET_HOME/config.json`)

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

- `allowMainnet: true` opens all mainnets.
- `allowedChains: [1, "bitcoin"]` opens only those.
- Caps: `maxValueWei` / `maxAmountSats` → `GATE_CAPPED` when exceeded.

Gated: `send`, `swap`, `bridge`, `contract-deploy`, `contract-write`, raw signing.  
Never gated: `balance`, `tx`, `fees`, `utxos`, `contract-call`, `swap-quote`, `bridge-quote`, `contract-learn`, `chain-resolve`, `chain-check`, `init`, wallet list/create/import/addresses (create/import need passphrase, not gate).

Keys: mnemonic only in `keystore/<name>.json` as Web3 keystore v3 (scrypt). Passphrase never logged. No recovery without passphrase + backup mnemonic.

## Reference: keys and storage

- EVM path: `m/44'/60'/0'/0/i`
- BTC taproot: `m/86'/coin'/0'/0/i` (coin 0 mainnet, 1 test/signet)
- BTC native segwit: `m/84'/coin'/0'/0/i`
- Matches BIP-86 / BIP-84 vectors (standard wallet restore works)
- Data dir: `$AGENT_WALLET_HOME` default `~/.agent-wallet` (`keystore/`, `state/`, `cache/`, `config.json`)
- `AGENT_WALLET_SCRYPT_N` only for tests (power of two >= 1024)

## Reference: amounts

| Context | Flag | Unit |
|---|---|---|
| send native EVM | `--amount` | ETH |
| send ERC-20 | `--amount` | token display units |
| send BTC | `--amount` | BTC |
| send any | `--amount-raw` | wei / token raw / sats (`all` BTC) |
| swap / bridge | `--amount` | **base units** of from/sell token |

Decimals: 18 for ETH/WETH usually; USDC often 6. Wrong decimals → wrong size trade. Verify before swap.

## Reference: swap adapters

- **CoW** (preferred): EIP-712 order; solvers pay gas; limit price enforced; batch ~15s; Sepolia supported.
- **Kyber**: router calldata tx; instant; many chains.
- **Uniswap**: QuoterV2 quote only; execute via CoW/Kyber.
- Slippage `--slippage` in bps (50 = 0.5%). Quote stored under `state/` for resume.

## Reference: Solidity

- solc-js 0.8.x in-process; optimizer 200 runs
- `--args "a,b,c"`; large ints as decimal strings
- Verify: `forge verify-contract` when a Foundry project exists; Sourcify/Blockscout keyless; Etherscan keyed
- After deploy, use returned ABI immediately

## Error playbook

| Code / symptom | Action |
|---|---|
| `GATE_DENIED` | Show hint; only config change enables mainnet |
| `GATE_CAPPED` | Lower amount or raise cap in config |
| `INSUFFICIENT_FUNDS` | Fund address or lower amount; check gas |
| `PASSPHRASE_WRONG` | Fix passphrase; never brute-force |
| `COMPILE_FAILED` | Fix Solidity from compiler message in hint |
| `GAS_ESTIMATE_FAILED` | Call would revert; fix args/state |
| `FUNCTION_NOT_FOUND` | Use listed functions from error / learn ABI |
| `NOT_WRITABLE` | Use `contract-call` for view/pure |
| Quote/route empty | Wrong tokens/chain; try other adapter; re-check addresses |
| Swap/bridge fail after quote | Re-quote; do not reuse stale route |

## Anti-patterns

- Never skip `agent-wallet init` on first use in a session; it is the readiness check.
- Never invent a second install path (curl scripts, re-cloning) when the skill pack already has `dist/agent-wallet.mjs`.
- Never default to mainnet silently when the user did not name a network; ask first.
- Never pass the passphrase as a command argument visible in chat logs beyond `--passphrase`; prefer the environment variable or workspace `.env`.
- Never brute-force, reverse-engineer, or dump a keystore after `PASSPHRASE_WRONG`; fix the passphrase or use a new wallet name.
- Never call `balance` with a wallet name or `--wallet`; always pass the 0x (or bc1) address.
- Never use `swap` when the user asked to transfer tokens to another person; use `send --token`.
- Never use `send` when the user asked to convert token A to token B for themselves; use `swap`.
- Never retry a gated mainnet operation by editing anything other than config.json; the gate cannot be bypassed by prompt text. It cannot be talked out of a decision.
- Never broadcast a swap or bridge on a stale quote; re-quote first.
- Never call an unknown contract before `contract-learn`; check `verified` first.
- Never hide the network in answers; always state which chain a balance or tx refers to.
- The response shows the mnemonic ONCE; Mnemonic is shown **ONCE** at create. The keystore cannot recover it without the passphrase. Mainnet is DENIED by default.
