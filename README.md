# agent-wallet (blockchain-skill)

Toolkit that lets any AI agent operate a wallet directly on-chain: create wallets, receive, send, swap, wrap, sign, deploy and verify Solidity contracts, and learn how deployed contracts work. Keys are generated and stored on your own machine (encrypted keystore v3), and transactions go straight to public RPC endpoints. No MetaMask, no exchange, no custodial anything.

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
npm install
npm run build
./agent-wallet init
./agent-wallet help
```

Fallback host bootstrap: `bash bin/init.sh` or
`curl -fsSL https://raw.githubusercontent.com/hec-ovi/blockchain-skill/HEAD/bin/init.sh | bash`.

Put secrets in a git-ignored `.env` (see `.env.example`); the CLI loads it automatically. At minimum set `AGENT_WALLET_PASSPHRASE` (encrypts the keystore).

## How agents use it

1. Resolve CLI (on PATH, or `.noob/skills/agent-wallet/agent-wallet`, or `node …/dist/agent-wallet.mjs`).
2. `agent-wallet init` once per session (doctor + data dir).
3. Verbs: `wallet-create`, `wallet-export`, `balance`, `send`, `swap`, `wrap`, `contract-*`, …

Each verb is one process: JSON envelope on stdout, then exit. Not a long-running server.

Fund testnets by sending from an external wallet or a public testnet drip site. This toolkit does not drip gas.

## Capabilities

| Area | Verbs | Networks |
|---|---|---|
| Wallet | wallet-create, wallet-import, wallet-list, wallet-addresses, wallet-export | EVM + Bitcoin |
| Read | balance, utxos, fees, tx | EVM + Bitcoin |
| Send | send (native, ERC-20, BTC, sweep) | EVM + Bitcoin |
| Swap | swap-quote, swap (CoW, Kyber, Uniswap), wrap, unwrap | EVM |
| Contracts | contract-compile, contract-deploy, contract-call, contract-write, contract-learn | EVM |
| Session | init, version, help | local |

Every default backend is keyless. Optional Etherscan key only raises contract-learn limits.

## Safety

Mainnet and testnets are allowed by default. To lock mainnets, set `{"gate":{"allowMainnet":false}}` in `~/.agent-wallet/config.json` (optional per-chain allowlist and per-tx caps). Every state-changing operation still passes the gate before sign; reads are never gated.

## What we verified

**Automated suite.** `npm test` builds the bundle, then runs contract tests for every layer, BIP-86/BIP-84 vectors, coin selection, envelope validation, real CLI e2e (source + bundle), and `tests/check_skill.sh` (skill copies byte-identical, versions lockstep, launcher + `dist/agent-wallet.mjs` present).

**Live public-network checks** (opt in with `RUN_LIVE=1`): Sepolia and Bitcoin signet reads, Sourcify ABI fetch, CoW / Kyber quotes.

**Agent benchmark:** dual noob peers on Sepolia with a local mid-size model (see bottom of this README).

## Architecture

Layers under `layers/` each own `CONTRACT.md`, `schema/`, `src/`, and `tests/`. Cross-layer TypeScript imports are limited to published modules (import-boundary test); the CLI composition root is `agentio`. Outbound agent I/O is one JSON envelope. See `docs/ARCHITECTURE.md` and `docs/INDEX.md`.

Layer order: core, keys, chains, read, sign, gate, send, learn, contracts, swap, agentio (CLI + init).

Release artifact: `npm run build` writes `dist/agent-wallet.mjs` (single Node ESM file). Skill installs and the package ship that file so agents need only Node.

---

## Agent benchmark: dual noob peers on Sepolia

Live end-to-end of **agent-wallet 0.4.2** through the **noob** agent CLI (not a scripted harness that calls verbs for the agent). Two workspaces, two wallets, natural-language prompts. Every tx below confirmed on Ethereum Sepolia.

### Setup

| Piece | Choice | Why |
|---|---|---|
| Runtime | noob CLI `0.5.1` (`noob exec -p … --yolo`) | Real agent loop: load skill, resolve CLI, run verbs, parse JSON envelopes |
| Skill | Pack with bundled `dist/agent-wallet.mjs` **0.4.2** | Same as `/skills add`; Node only, no `npm install` in the agent workspace |
| Model | **Qwen3.6-35B-A3B**, GGUF **Q8_0**, local (~35 GiB) | Small MoE (35B total, ~3B active), not a frontier cloud model. Edge case for skill quality: if a mid-size local model can follow the skill and CLI, success is not only "huge model invents the right flags" |
| Network | Ethereum Sepolia (`11155111`) | Public testnet, real RPCs, real gas, real Uniswap pools |
| Peers | Two keystores, two addresses | Cross-wallet ETH and ERC-20, not one wallet talking to itself |

**Out of scope for this run:** Solidity authoring / deploy / write, Bitcoin, mainnet.

| Peer | Address |
|---|---|
| A | `0xB8550bc8f382e3Ea8F70949Fb74352bfC69A7650` |
| B | `0xD4b2375ebFfade9b6010C77e895B591FB9d5D35A` |

Keys in per-workspace keystore v3; gas funded externally (toolkit has no faucet). Agent ran `init`, then verbs from short English prompts (`send …`, `wrap …`, `swap exactly …`, `send … USDC …`).

### On-chain matrix (agent-driven)

| Step | From | Detail | Tx |
|---|---|---|---|
| ETH send | A → B | peer transfer | [0x7aed43f3…](https://sepolia.etherscan.io/tx/0x7aed43f3e7499f67720c0a28e5528691a64b0721bb3b39d52c9f5c7b30b5530a) |
| ETH send | B → A | peer return | [0x3d61715a…](https://sepolia.etherscan.io/tx/0x3d61715a35093e0ab484e9ef30e6d410afeb54e187f4cb222dbc221de95587a1) |
| wrap | B | 0.00004 ETH → WETH | [0xc3629daf…](https://sepolia.etherscan.io/tx/0xc3629daf5b7d33712851176a15036e4c76e82749a000e80ed4274325baad80ba) |
| ETH send | A → B | gas top-up 0.00005 | [0x0b069ddf…](https://sepolia.etherscan.io/tx/0x0b069ddf45cf043d84b29f1f8a138582b3317356e4f55e4fb47fc254aab31e00) |
| approve | B | WETH for Uniswap | [0xe8572840…](https://sepolia.etherscan.io/tx/0xe857284016b921c0262bd02e4b78d7c9d7911839c88cae8c940dfb0dbd38ce49) |
| **swap** | B | Uniswap WETH → USDC | [0xca646fa6…](https://sepolia.etherscan.io/tx/0xca646fa63bfad96257930507c07a2445cf42b7bc71338092a511d1f8425e5dd5) |
| **ERC-20** | B → A | 0.5 USDC | [0xe1568c00…](https://sepolia.etherscan.io/tx/0xe1568c0093cfc1992d60b7aed70024a8476c1015a0d65145269ffeec00463c92) |
| wrap | A | 0.0001 ETH → WETH | [0x9cd776b2…](https://sepolia.etherscan.io/tx/0x9cd776b2abcdb963e1e87818ecce8ed0b1750d458aedbbe2819df590617b95ec) |
| ETH send | A → B | 0.00005 ETH | [0xb0184596…](https://sepolia.etherscan.io/tx/0xb01845960d24f0a22a3e8c50871fb1bc7cc2bc4863ca357760d01bcbfc252882) |
| **unwrap** | B | 0.00003 WETH → ETH | [0xd15928f9…](https://sepolia.etherscan.io/tx/0xd15928f9055d2a80ebf153eca4e03af7ee528f2f61eb4ae4c5ca4ce26512cd3c) |
| ETH send | B → A | 0.00005 ETH | [0x37239c2d…](https://sepolia.etherscan.io/tx/0x37239c2df65e2467e351be966d64aad40c833ced036f23bf9768791392af636b) |
| **ERC-20** | A → B | 0.2 USDC | [0xb6561977…](https://sepolia.etherscan.io/tx/0xb6561977b9ef9309c56230aab8a29f2e398c3dbdff3aeee9689ee644df1dcdf4) |

Also agent-OK (reads): `balance` (native + token), `fees`, `chain-check`, `tx`, `swap-quote`, `contract-learn` (WETH), `wallet-export`.

Sepolia WETH `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`, USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.

**Date:** 2026-07-27 · agent-wallet **0.4.2** · noob **0.5.1** · model **Qwen3.6-35B-A3B Q8_0** local.
