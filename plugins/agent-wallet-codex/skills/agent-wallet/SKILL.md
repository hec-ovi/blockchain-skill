---
name: agent-wallet
description: Operate a non-custodial blockchain wallet directly on-chain (EVM and Bitcoin), no exchange or MetaMask. Use to create or import a wallet, check balances, receive, send native coin / ERC-20 / BTC, swap tokens, bridge across chains, and author, deploy, verify, call, or write Solidity smart contracts. Trigger on wallet, crypto, ETH, BTC, ERC-20, token, send, swap, bridge, Solidity, contract, on-chain, testnet, mainnet.
---

# agent-wallet

This skill is instructions only. Every operation runs through the `agent-wallet` CLI (one Node process per verb, JSON on stdout, then exit). Keys stay local and encrypted. No exchange, no browser extension, no custodial service.

Every response is one JSON envelope `{ok, data, error, meta}`. On `ok:false`, read `error.hint` and act on it.

## Setup (first use only)

Requires Node >= 22.18. No npm install step when this skill pack is already on disk (it ships a self-contained `dist/agent-wallet.mjs`).

### 1. Resolve the CLI (once per session)

Pick the first that works and reuse that exact command for every later verb:

```sh
# A) on PATH (npm i -g agent-wallet, or a prior host install)
command -v agent-wallet

# B) skill pack installed by noob /skills add (workspace-relative)
test -x .noob/skills/agent-wallet/agent-wallet && echo .noob/skills/agent-wallet/agent-wallet

# C) direct Node entry next to this skill
test -f .noob/skills/agent-wallet/dist/agent-wallet.mjs && echo "node .noob/skills/agent-wallet/dist/agent-wallet.mjs"

# D) this repo checked out as the workspace
test -x ./agent-wallet && echo ./agent-wallet
test -f ./dist/agent-wallet.mjs && echo "node ./dist/agent-wallet.mjs"

# E) optional registry one-shot when published (needs network + npm)
# npx --yes agent-wallet-skill@0.3.1
```

Examples below write `agent-wallet`; replace with your resolved form (for example `.noob/skills/agent-wallet/agent-wallet` or `node .noob/skills/agent-wallet/dist/agent-wallet.mjs`).

### 2. Run init once

```sh
agent-wallet init
```

Read `data.ready`, `data.nextActions`, and `data.notes`. Do not probe the install by hand (`which`, `ls`, random version checks) instead of init. Init prepares `~/.agent-wallet/` (or `$AGENT_WALLET_HOME`) and reports what is missing.

### 3. Passphrase (required before any keystore verb)

```sh
export AGENT_WALLET_PASSPHRASE=...   # never paste into chat; at least 8 characters
```

Prefer a durable workspace `.env` (gitignored) with `AGENT_WALLET_PASSPHRASE=...` so later turns reuse it. The CLI loads `.env` from the current directory automatically. Do not invent a random passphrase into `/tmp` and lose it. Do not override an existing `AGENT_WALLET_PASSPHRASE` already set in the environment or `.env`.

If a verb returns `PASSPHRASE_WRONG` or `PASSPHRASE_TOO_SHORT`, stop. Do not brute-force the keystore, dump keystore JSON, or reverse-engineer the bundle. Fix the passphrase or create a new wallet name with a known passphrase.

Then re-run `agent-wallet init` if you want an updated report. Mainnet is DENIED by default; testnets work immediately (see Safety model).

### 4. Optional faucet keys

Headless testnet funding needs a free CDP key (`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`). Without them, wallet create / balance / send still work; only `faucet` fails.

## Chain references

Any chain works: a name (`ethereum`, `base`, `sepolia`), a numeric id (`8453`), or a Bitcoin network (`bitcoin`, `signet`, `testnet`). Amounts are decimal strings in base units (wei/sats) unless a verb takes display units.

Every balance, read, send, or contract call is scoped to ONE network. The same address holds different funds on each chain. If the user has not named a network, ask which one; never default to mainnet silently. State the network in your answer.

Start every task with `agent-wallet init` if you have not this session, confirm a wallet exists, then jump to the operation.

## 1. Wallet setup

1. Ensure `AGENT_WALLET_PASSPHRASE` is exported (the keystore encryption passphrase).
2. Create a wallet (new mnemonic):
   `agent-wallet wallet-create --name main`
   The response shows the mnemonic ONCE. Tell the user to back it up; it cannot be recovered from the keystore without the passphrase.
3. Or import an existing seed:
   `agent-wallet wallet-import --name main --mnemonic "word1 ... word12"`
4. List wallets: `agent-wallet wallet-list`.
5. Get a receive address:
   - EVM: `agent-wallet wallet-addresses --name main --family evm`
   - Bitcoin: `agent-wallet wallet-addresses --name main --family btc --network bitcoin` (taproot by default; add `--type p2wpkh` for native segwit)

Notes:

- One mnemonic covers every EVM chain and Bitcoin. The same wallet's EVM address is identical on all EVM chains.
- `--count N` and `--start i` derive multiple addresses.

## 2. Balances and reads

Balances and every read are per-network: an address holds different amounts on Ethereum, Base, a testnet, or a local node. If the user has not said which network, ASK before checking; do not silently assume mainnet. Always state which network a balance refers to (the result's `meta.chain`).

- Balance: `agent-wallet balance <chain> <address>` (add `--token 0x..` for an ERC-20). **Requires the 0x address**, not a wallet name. There is no `--wallet` flag on balance. Resolve the address first with `wallet-addresses --name main --family evm` (needs passphrase) or reuse the address from `wallet-create` / a prior turn.
- Fees: `agent-wallet fees <chain>`.
- Bitcoin UTXOs: `agent-wallet utxos <btc-network> <address>`.
- Transaction: `agent-wallet tx <chain> <hash-or-txid>`.
- `wallet-list` does not need a passphrase; unlocking does.

## 3. Send

Native coin:
`agent-wallet send <chain> --to 0x.. --amount 0.5 --wallet main --wait`

ERC-20 token (amount in display units of the token):
`agent-wallet send <chain> --to 0x.. --amount 100 --token 0xTOKEN --wallet main`

Bitcoin (amount in BTC, or base units / sweep):
`agent-wallet send bitcoin --to bc1p.. --amount 0.001 --wallet main`
`agent-wallet send signet --to tb1p.. --amount-raw all --wallet main` (sweep)

Expect:

- Mainnet is denied by default; a `GATE_DENIED` error's hint shows the exact config change to allow it.
- EVM `--wait` returns a confirmed/reverted status; without it you get `broadcast` plus a hash.
- Bitcoin returns `broadcast` plus a txid; track with `agent-wallet tx <network> <txid>`.
- Insufficient funds are caught before broadcast (`INSUFFICIENT_FUNDS`).

## 4. Swap

Non-custodial: you approve the aggregator's spender and either sign a router transaction (Kyber) or sign an intent order that solvers fill (CoW). Amounts are base units of the sell token.

Quote (read-only):

`agent-wallet swap-quote <chain> --sell 0xSELL --buy 0xBUY --amount 1000000000000000000 --from 0xYOU`

Returns the best `buyAmount` across supported adapters, plus `minBuyAmount` after slippage. Add `--adapter cow|kyber|uniswap` to force one, `--slippage 50` for basis points (default 50 = 0.5%).

Execute:

`agent-wallet swap <chain> --sell 0xSELL --buy 0xBUY --amount 1000000000000000000 --wallet main --wait`

The sender is derived from the wallet. The layer approves the spender if allowance is short (an `approvalTx`), then:

- Kyber: signs and broadcasts a router call (`swapTx`).
- CoW: signs an EIP-712 order and posts it; solvers execute and pay gas (`orderUid`). Track at explorer.cow.fi.

Expect:

- Swaps usually run on mainnet, which is DENIED by default. Enable the chain in `~/.agent-wallet/config.json` first (see "Safety model").
- CoW is preferred where available (gasless, MEV-protected, protocol-enforced limit price). Uniswap is quote-only here; execute via Kyber or CoW.
- Re-quote if execution fails; routes and fees expire quickly.

## 5. Bridge

Bridging is two-phase: a source-chain transaction you sign and broadcast, then asynchronous delivery on the destination. EVM-to-EVM in this version.

Quote (read-only):

`agent-wallet bridge-quote --from-chain ethereum --to-chain arbitrum --from-token 0xUSDC_ETH --to-token 0xUSDC_ARB --amount 100000000 --address 0xYOU`

Returns the route, `toAmountMin`, and the source `transactionRequest`. Amounts are base units.

Execute:

`agent-wallet bridge --from-chain ethereum --to-chain arbitrum --from-token 0xUSDC_ETH --to-token 0xUSDC_ARB --amount 100000000 --wallet main --wait`

The source address is derived from the wallet. The layer approves the bridge spender if needed, then signs and broadcasts the source tx and returns `sourceTx`.

Track delivery:

`agent-wallet bridge-status <sourceTx> --from-chain ethereum --to-chain arbitrum`

`PENDING` until the destination fills, then `DONE` (or `FAILED`).

Expect:

- Mainnet bridges are DENIED by default; enable the source chain in `~/.agent-wallet/config.json` first.
- Native-token bridges need no approval; ERC-20 bridges insert an `approvalTx`.
- Set `LIFI_API_KEY` only to raise rate limits; it is not required.
- Re-quote if execution fails; routes expire. The quote is saved to state for resume.

## 6. Contract deploy

Compile with solc-js in-process, deploy through the wallet (gated, signed locally, broadcast directly), verify keyless on Sourcify.

Compile:

`agent-wallet contract-compile --source ./MyToken.sol --name MyToken`

Returns ABI and bytecode for each deployable contract. Fix any `COMPILE_FAILED` using the compiler message in `error.hint`.

Deploy:

`agent-wallet contract-deploy <chain> --source ./MyToken.sol --name MyToken --args "arg1,arg2" --wallet main --rpc <url>`

Returns the deployed `address` and the `abi` ready to call. Constructor args are comma-separated; large integers are passed as strings.

Verify (optional):

Verification uses `forge` against a Foundry project directory. Sourcify (default) and Blockscout are keyless; Etherscan needs a key. If you only have a source string, deploy first, then verify from a Foundry project that contains the same source.

Expect:

- Deploys to mainnet are DENIED by default; enable the chain in config first. Testnets (Sepolia, Base Sepolia) work immediately.
- A reverting constructor is caught at gas estimation (`GAS_ESTIMATE_FAILED`) before broadcast.
- Compilation is deterministic (optimizer runs 200).

## 7. Contract use

Learn what a contract is:

`agent-wallet contract-learn <chain> <address>`

Returns the ABI, verified source, compiler, and proxy target. Keyless-first (Sourcify, then Blockscout); for an unverified contract it guesses an ABI from bytecode (`source: whatsabi`, `verified: false`). Add `--verified-only` to fail instead of guessing. Use this before calling an unknown contract to get its ABI and to check `verified`.

Call (read-only):

`agent-wallet contract-call <chain> <address> --fn balanceOf --args 0xHOLDER --abi ./abi.json`

No transaction, no gas. Returns the decoded result (bigints as strings). `FUNCTION_NOT_FOUND` lists the available functions.

Write (state-changing):

`agent-wallet contract-write <chain> <address> --fn transfer --args "0xTO,1000" --abi ./abi.json --wallet main --wait`

Gated, signed locally, broadcast. View/pure functions are rejected (`NOT_WRITABLE`, use call). `--value <wei>` attaches native value to a payable call.

Expect:

- Get the ABI from `contract-learn` or from a `contract-deploy` result, then pass it to call/write.
- Writes to mainnet are DENIED by default; enable the chain in config first.
- A reverting call returns `CALL_REVERTED`; a reverting write is caught at gas estimation before broadcast.

## Safety model

The gate is deterministic code that runs before anything is signed or broadcast. It cannot be talked out of a decision; prompt text is not an enforcement mechanism.

Defaults (no config file):

- Testnets (Sepolia, Base Sepolia, Bitcoin signet): allowed.
- Every mainnet (Ethereum, Bitcoin, Base, ...): denied.
- No per-transaction cap.

Config: `~/.agent-wallet/config.json`

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

What is gated: every state-changing operation: `send`, `swap`, `bridge`, `contract-deploy`, `contract-write`, and raw signing. Reads (`balance`, `tx`, `contract-call`, `swap-quote`, `bridge-quote`, `contract-learn`) are never gated.

Keys at rest: the mnemonic is stored only in `~/.agent-wallet/keystore/<name>.json`, encrypted with your passphrase (Web3 keystore v3, scrypt). The passphrase is never written to disk or logs. Back up the mnemonic shown at creation; the keystore cannot recover it without the passphrase.

## Reference: keys, derivation, and storage

Derivation paths:

- EVM: `m/44'/60'/0'/0/i` (secp256k1), address index `i`.
- Bitcoin taproot (default): `m/86'/coin'/0'/0/i`, `coin` = 0 mainnet, 1 for signet/testnet.
- Bitcoin native segwit: `m/84'/coin'/0'/0/i`.

Derivation matches the official BIP-86 and BIP-84 vectors, so addresses line up with any other standard wallet restored from the same seed.

Keystore format: Web3 Secret Storage v3: scrypt (N=262144 by default) + aes-128-ctr + keccak MAC, holding the BIP-39 entropy. Interoperable with geth and `cast wallet import`. Files are written mode 0600 under `~/.agent-wallet/keystore/`.

Set `AGENT_WALLET_SCRYPT_N` to a smaller power of two (>= 1024) only for tests; production should keep the default.

Passphrase: comes from `AGENT_WALLET_PASSPHRASE` or `--passphrase`. It is NFKC-normalized before key derivation and never written to disk or logs. A wrong passphrase returns `PASSPHRASE_WRONG`; there is no recovery path without it.

Data directory: override the root with `AGENT_WALLET_HOME` (default `~/.agent-wallet`). It holds `keystore/`, `state/` (multi-step operation resume files), `cache/` (chain registry), and `config.json`.

## Reference: sending details

Amount units:

- `--amount` is display units: ETH on EVM, the token's own units for `--token`, BTC on Bitcoin.
- `--amount-raw` is base units: wei, token smallest unit, or sats. `--amount-raw all` sweeps every confirmed Bitcoin UTXO to the recipient (single output, no change).

EVM:

- Fees are EIP-1559; the layer reads `maxFeePerGas`/`maxPriorityFeePerGas` from the node and adds a 20 percent gas-limit buffer over the estimate.
- Balance is pre-checked against worst-case `value + gasLimit * maxFeePerGas`; a shortfall returns `INSUFFICIENT_FUNDS` with nothing broadcast.
- ERC-20 sends encode `transfer(to, amount)` to the token contract; the recipient is the token argument, not the tx `to`.

Bitcoin:

- Only confirmed UTXOs are spent.
- Coin selection is largest-first; change returns to the sender's own address. Change below the 546-sat dust threshold folds into the fee.
- Fee rate defaults to the half-hour estimate; override with `--fee-rate <sat/vB>`.
- Taproot (p2tr) is the default address type; pass `--type p2wpkh` to spend from native segwit.

Confirmation: EVM `--wait` blocks for the receipt (default 120s) and reports `confirmed` or `reverted`. Bitcoin is always asynchronous: the send returns a txid, and you poll `agent-wallet tx <network> <txid>` until `confirmed`.

## Reference: swap adapters

All adapters are keyless. Quote picks the best `buyAmount` unless you name one with `--adapter`.

CoW Protocol (preferred):

- Intent model: you sign an EIP-712 order (GPv2 settlement `0x9008D19f58AAbD9eD0D60971565AA8510560ab41`); solvers execute and pay settlement gas. Failed or unfilled orders cost nothing.
- The signed limit price (buyAmount after slippage) is enforced by the settlement contract, which is stronger than calldata `minOut`.
- One-time approval to the vault relayer `0xC92E8bdf79f0507f65a392b0ab4667716BFE0110`.
- Chains: Ethereum, Gnosis, Base, Arbitrum, Polygon, Avalanche, and Sepolia (testnet). Settlement is a batch auction (~15s), so execution is not instant.

KyberSwap (fallback):

- Aggregator API returns router calldata; the swap is a normal signed transaction to the router, gated like any write.
- Instant execution, 9+ chains. Slippage guard is the router's `minAmountOut`.

Uniswap (quote backstop):

- On-chain QuoterV2 read, needs only an RPC, no API. Single-venue pricing (no aggregation).
- Quote-only in this version; execute via CoW or Kyber.

Slippage: `--slippage` is basis points (50 = 0.5%). `minBuyAmount = buyAmount * (10000 - bps) / 10000`. The quote is persisted to `~/.agent-wallet/state/` before execution so a failed broadcast is resumable.

## Reference: Solidity deploy details

Compiler:

- solc-js, current 0.8.x, invoked in-process (no Foundry project needed for compile+deploy).
- Optimizer enabled, 200 runs. Output is ABI, creation bytecode, and deployed bytecode per contract.
- A source can hold several contracts; `--name` picks one, otherwise the last concrete contract is deployed. Interfaces and abstract contracts are skipped (`NO_DEPLOYABLE_CONTRACT` if none remain).

Constructor arguments:

- CLI: `--args "a,b,c"` (comma-separated).
- Pass large integers (uint256) as decimal strings. Addresses as `0x..`. Booleans as `true`/`false`.
- Encoding uses the compiled ABI; a mismatch surfaces as `GAS_ESTIMATE_FAILED` (the constructor reverts) before anything is broadcast.

Verification: `forge verify-contract` drives the verifiers. Provide a Foundry project (`foundry.toml`) whose source matches the deployed bytecode.

- `sourcify` (default): keyless, multi-chain.
- `blockscout`: keyless, needs `verifierUrl` (the instance `/api` base).
- `etherscan`: needs an API key (`learn.etherscanApiKey` or `ETHERSCAN_API_KEY`); Etherscan API v2 covers 60+ chains with one key.

`verified: true` in the result reflects the explorer's answer; `detail` is forge's output tail for debugging a failed verification.

After deploy: the deploy result includes the ABI. Use `contract-call` / `contract-write` with it, or fetch it later with `contract-learn`.

## Anti-patterns

- Never skip `agent-wallet init` on the first use in a session; it is the readiness check.
- Never invent a second install path (curl scripts, re-cloning) when the skill pack already has `dist/agent-wallet.mjs`.
- Never default to mainnet silently when the user did not name a network; ask first.
- Never pass the passphrase as a command argument visible in chat logs beyond `--passphrase`; prefer the environment variable or workspace `.env`.
- Never brute-force, reverse-engineer, or dump a keystore after `PASSPHRASE_WRONG`; fix the passphrase or use a new wallet name.
- Never call `balance` with a wallet name or `--wallet`; always pass the 0x (or bc1) address.
- Never retry a gated mainnet operation by editing anything other than `~/.agent-wallet/config.json`; the gate cannot be bypassed by prompt text.
- Never broadcast a swap or bridge on a stale quote; re-quote first.
- Never call an unknown contract before `contract-learn`; check `verified` first.
