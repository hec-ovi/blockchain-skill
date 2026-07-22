# agent-wallet (blockchain-skill)

Toolkit that lets any AI agent operate a wallet directly on-chain: create wallets, receive, send, swap, bridge, sign, deploy and verify Solidity contracts, and learn how deployed contracts work. Keys are generated and stored on your own machine (encrypted keystore v3), and transactions go straight to public RPC endpoints. No MetaMask, no exchange, no custodial anything.

Ships three faces over one engine: a CLI (`agent-wallet <verb>`), an MCP server (stdio), and Claude Code skills. Same verbs, same JSON envelope everywhere.

## Install

- CLI: `npx agent-wallet help`
- Skills: `npx skills add hec-ovi/blockchain-skill`
- Plugin: `/plugin marketplace add hec-ovi/blockchain-skill`
- MCP: register the server from `.mcp.json` (`node bin/agent-wallet.ts mcp`)

Requires Node >= 22.18 (runs the TypeScript directly). Put secrets in a git-ignored `.env` (see `.env.example`); the CLI and MCP server load it automatically. At minimum set `AGENT_WALLET_PASSPHRASE` (encrypts the keystore).

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

Every default backend is keyless. Optional keys (Etherscan, LI.FI) only raise limits.

## Funding (self-serve gas)

An agent can load its own testnet gas headlessly, no captcha or browser, with the `faucet` verb:

```
agent-wallet faucet --network base-sepolia --token eth
```

It uses the Coinbase CDP faucet and needs a free API key (`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`) in `.env` or `~/.agent-wallet/config.json`. Get one at portal.cdp.coinbase.com. Base Sepolia and Ethereum Sepolia are supported, with eth, usdc, eurc, and cbbtc. Bitcoin test faucets still require a human, so use an EVM testnet for automated funding.

## Safety

Mainnet is denied until you allow it in `~/.agent-wallet/config.json` (`{"gate":{"allowMainnet":true}}` or a per-chain allowlist, plus optional per-tx caps). Every state-changing operation passes a deterministic gate before anything is signed. Reads are never gated.

## What we verified

The toolkit was checked at three levels: an automated suite, live calls against real public networks, and a full run driven by a separate AI agent acting as a first-time user.

**Automated suite.** `npm test` runs 95 tests with no external network: schema and contract tests for every layer, key derivation checked against the official BIP-86 and BIP-84 vectors, Bitcoin coin selection, envelope validation, and end-to-end runs of the real CLI and MCP server.

**Live public-network checks** (opt in with `RUN_LIVE=1`): balance and tip reads on Ethereum Sepolia and Bitcoin signet, a keyless Sourcify ABI fetch for WETH, and live swap and bridge quotes from CoW, KyberSwap, and LI.FI.

**Agent-driven, end to end.** A separate model (Claude Haiku), given only the skill and the CLI, was asked in plain language to create a wallet, hand over an address, check a balance, and send funds. Every command it produced was well-formed and correct, the send landed on-chain, and the safety gate refused a mainnet send with a clear reason. One ambiguity showed up (it assumed a network when none was named), so the skill now tells the agent to ask first.

**On Base Sepolia (real, clickable).** In one run the agent funded a fresh wallet, sent a transfer, deployed the `Counter` contract, and called `increment()` (count went from 41 to 42, confirmed by a raw call straight to the chain). It funded itself through the CDP faucet first, with no human faucet visit:

- Wallet: https://sepolia.basescan.org/address/0xE5f6d3E30259EC65CB373de402647DA3D6Bd7E84
- Faucet funding: https://sepolia.basescan.org/tx/0x34adadc142150cbd51bf5c8f44766c5fcd0cc7ae4aeb53ec52247a6af25f6ff5
- Transfer: https://sepolia.basescan.org/tx/0x1e1a51bea96eb6e8b727a0dfcc4a978b2b6ad236ac199f2224d4b48992ad7f97
- Contract: https://sepolia.basescan.org/address/0xbeaf85138e51c30fe3511f78e7bf868356ec7373
- Deploy tx: https://sepolia.basescan.org/tx/0x924108df1061ddd917e0785127512a67027d69f3af326c5952488bcce54d5d10
- increment(): https://sepolia.basescan.org/tx/0xd5e42c9da194487ba261cb6c481cda6a19b7a18c42105a87007c7496ba7236ec

## Architecture

Contract-isolated layers under `layers/`, coupled only through one JSON envelope. Each layer owns its `CONTRACT.md`, `schema/`, `src/`, and `tests/`. `docs/INDEX.md` maps what you want to change to the one folder to open. See `docs/ARCHITECTURE.md` and `docs/RESEARCH.md` for the design and the 2026 stack choices.

Layer order, easy to hard: core, keys, chains, read, sign, gate, send, learn, contracts, swap, bridge, faucet, agentio (the CLI + MCP surface).
