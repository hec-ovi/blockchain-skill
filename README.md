# agent-wallet (blockchain-skill)

Toolkit that lets any AI agent operate a wallet directly on-chain: create wallets, receive, send, swap, bridge, sign, deploy and verify Solidity contracts, and learn how deployed contracts work. Keys are generated and stored on your own machine (encrypted keystore v3), and transactions go straight to public RPC endpoints. No MetaMask, no exchange, no custodial anything.

Two faces over one engine: a self-contained CLI (`agent-wallet <verb>`) and one fat agent skill replicated to every discovery convention (repo root, `skills/`, Claude and Codex plugin dirs). Same verbs, same JSON envelope everywhere.

## Install

### Agent CLI (plug and play)

```
/skills add hec-ovi/blockchain-skill
```

That copies the skill pack (including the bundled CLI at `dist/agent-wallet.mjs`) into the workspace. The agent then resolves the CLI, runs `agent-wallet init` once, and uses the verbs. No second bootstrap script.

Other skill installers: `npx skills add hec-ovi/blockchain-skill`, Claude `/plugin marketplace add hec-ovi/blockchain-skill`.

### Host CLI (optional)

Requires Node >= 22.18.

```
npm i -g agent-wallet-skill@0.3.0
agent-wallet init
agent-wallet help
```

From a git checkout:

```
npm install
npm run build
./agent-wallet init
```

Fallback host bootstrap (clone + link): `bash bin/init.sh` or
`curl -fsSL https://raw.githubusercontent.com/hec-ovi/blockchain-skill/HEAD/bin/init.sh | bash`.

Put secrets in a git-ignored `.env` (see `.env.example`); the CLI loads it automatically. At minimum set `AGENT_WALLET_PASSPHRASE` (encrypts the keystore).

## How agents use it

1. Resolve CLI (on PATH, or `.noob/skills/agent-wallet/agent-wallet`, or `node …/dist/agent-wallet.mjs`).
2. `agent-wallet init` once per session (doctor + data dir).
3. Verbs: `wallet-create`, `balance`, `send`, `swap`, `bridge`, `contract-*`, `faucet`, …

Each verb is one process: JSON envelope on stdout, then exit. Not a long-running server.

## Capabilities

| Area | Verbs | Networks |
|---|---|---|
| Wallet | wallet-create, wallet-import, wallet-list, wallet-addresses | EVM + Bitcoin |
| Read | balance, utxos, fees, tx | EVM + Bitcoin |
| Send | send (native, ERC-20, BTC, sweep) | EVM + Bitcoin |
| Swap | swap-quote, swap (CoW, Kyber, Uniswap) | EVM |
| Bridge | bridge-quote, bridge, bridge-status (LI.FI) | EVM to EVM |
| Contracts | contract-compile, contract-deploy, contract-call, contract-write, contract-learn | EVM |
| Funding | faucet (self-serve testnet gas) | Base Sepolia, Ethereum Sepolia |
| Session | init, version, help | local |

Every default backend is keyless. Optional keys (Etherscan, LI.FI, CDP for faucet) only raise limits or unlock funding.

## Funding (self-serve gas)

```
agent-wallet faucet --network base-sepolia --token eth
```

Uses the Coinbase CDP faucet. Free API key: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` in `.env` or `~/.agent-wallet/config.json` (portal.cdp.coinbase.com). Base Sepolia and Ethereum Sepolia: eth, usdc, eurc, cbbtc.

## Safety

Mainnet is denied until you allow it in `~/.agent-wallet/config.json` (`{"gate":{"allowMainnet":true}}` or a per-chain allowlist, plus optional per-tx caps). Every state-changing operation passes a deterministic gate before anything is signed. Reads are never gated.

## What we verified

**Automated suite.** `npm test` builds the bundle, then runs contract tests for every layer, BIP-86/BIP-84 vectors, coin selection, envelope validation, real CLI e2e (source + bundle), and `tests/check_skill.sh` (skill copies byte-identical, versions lockstep, launcher + `dist/agent-wallet.mjs` present).

**Live public-network checks** (opt in with `RUN_LIVE=1`): Sepolia and Bitcoin signet reads, Sourcify ABI fetch, CoW / Kyber / LI.FI quotes.

**Agent-driven runs** on Base Sepolia (wallet, faucet, send, deploy, call) are documented with explorer links in git history; re-verify after major releases with a separate agent and only the skill text as instructions.

## Architecture

Contract-isolated layers under `layers/`, coupled only through one JSON envelope. Each layer owns its `CONTRACT.md`, `schema/`, `src/`, and `tests/`. `docs/INDEX.md` maps what you want to change to the one folder to open. See `docs/ARCHITECTURE.md` and `docs/RESEARCH.md`.

Layer order: core, keys, chains, read, sign, gate, send, learn, contracts, swap, bridge, faucet, agentio (CLI + init).

Release artifact: `npm run build` writes `dist/agent-wallet.mjs` (single Node ESM file). That file is what skill installs and `npm pack` ship so agents need only Node, not a source tree install.
