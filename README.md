# agent-wallet (blockchain-skill)

Toolkit that lets any AI agent operate a wallet directly on-chain: create wallets, receive, send, swap, bridge, sign, deploy and verify Solidity contracts, and learn how deployed contracts work. Keys are generated and stored locally (encrypted keystore v3); transactions go straight to public RPC endpoints. No MetaMask, no exchange, no custodial anything.

Ships three faces over one engine: a CLI (`agent-wallet <verb>`), an MCP server (stdio), and Claude Code skills. Same verbs, same JSON envelope everywhere.

## Install

- CLI: `npx agent-wallet help`
- Skills: `npx skills add hec-ovi/blockchain-skill`
- Plugin: `/plugin marketplace add hec-ovi/blockchain-skill`
- MCP: register the server from `.mcp.json` (`node bin/agent-wallet.ts mcp`)

Requires Node >= 22.18 (runs the TypeScript directly). Set `export AGENT_WALLET_PASSPHRASE=...` for the keystore.

## Capabilities

| Area | Verbs | Networks |
|---|---|---|
| Wallet | wallet-create, wallet-import, wallet-list, wallet-addresses | EVM + Bitcoin |
| Read | balance, utxos, fees, tx | EVM + Bitcoin |
| Send | send (native, ERC-20, BTC, sweep) | EVM + Bitcoin |
| Swap | swap-quote, swap (CoW, Kyber, Uniswap) | EVM |
| Bridge | bridge-quote, bridge, bridge-status (LI.FI) | EVM to EVM |
| Contracts | contract-compile, contract-deploy, contract-call, contract-write, contract-learn | EVM |

Every default backend is keyless. Optional keys (Etherscan, LI.FI) only raise limits.

## Safety

Mainnet is denied until you allow it in `~/.agent-wallet/config.json` (`{"gate":{"allowMainnet":true}}` or a per-chain allowlist, plus optional per-tx caps). Every state-changing operation passes a deterministic gate before anything is signed. Reads are never gated.

## Architecture

Contract-isolated layers under `layers/`, coupled only through one JSON envelope. Each layer owns its `CONTRACT.md`, `schema/`, `src/`, and `tests/`. `docs/INDEX.md` maps what you want to change to the one folder to open. See `docs/ARCHITECTURE.md` and `docs/RESEARCH.md` for the design and the 2026 stack choices.

Layer order, easy to hard: core, keys, chains, read, sign, gate, send, learn, contracts, swap, bridge, agentio (the CLI + MCP surface).

## Tests

`npm test` runs the suite locally. End-to-end tests spin up throwaway anvil and bitcoind regtest nodes when Foundry and Bitcoin Core are installed, and skip otherwise. Network-touching quote and verification tests are opt-in with `RUN_LIVE=1`.
