# Stack research (verified 2026-07-22)

Method: deep-research workflow (106 agents, adversarial 3-vote verification per claim) plus four targeted follow-up agents. Every claim below was checked against a primary source on 2026-07-22. Confidence noted where it is not high.

## Decisions at a glance

| Capability | Pick | Keyless? |
|---|---|---|
| EVM keys + signing | viem 2.x local accounts (mnemonicToAccount) | yes |
| Bitcoin keys + signing | @scure/btc-signer 2.2.0 + @scure/bip32/39 | yes |
| Keystore at rest | Web3 Secret Storage v3 built on ethereum-cryptography primitives | yes |
| Chain registry | viem/chains (727 chains) + chainid.network/chains.json (2658 chains) + defineChain | yes |
| RPC reliability | viem fallback transport with rank: true | yes |
| Bitcoin data/broadcast | Esplora API: mempool.space primary, blockstream.info fallback | yes |
| Swap (EVM) | CoW Protocol primary, KyberSwap fallback, Uniswap direct-to-router backstop | yes |
| Bridge | LI.FI (optional free key raises limits) | yes |
| Solidity toolchain | solc-js for in-process compile; Foundry forge for keyless verify | yes |
| Contract verification | forge verify-contract: sourcify (default) and blockscout keyless, etherscan keyed | yes |
| Contract intelligence | Sourcify APIv2, Blockscout, Etherscan v2 (keyed), WhatsABI for unverified | mostly |
| E2E testing | real public testnets (Base Sepolia, Sepolia, signet), gas self-funded via the CDP faucet | yes |
| MCP server | @modelcontextprotocol/sdk 1.29.0, stdio, zod schemas (removed in v0.2.0; CLI + skills only) | yes |

## 1. Keys and signing

- @scure/btc-signer v2.2.0 (2026-04-28): Cure53-audited (v0.3.0, 2023), full self-audit at 2.2.0. PSBT v0 + draft v2, Taproot/Schnorr (BIP-340/341), MuSig2 (BIP-327), all major script types. Core signer is fully offline; network access is an optional Esplora provider where you supply the endpoint. Caveats: MuSig2 and UTXO selection not independently audited, P2TR-MS experimental. Sources: github.com/paulmillr/scure-btc-signer, npm registry.
- viem mnemonicToAccount: local non-custodial HD account, signs client-side, broadcasts over plain JSON-RPC. No extension, no custodian. Source: viem.sh/docs/accounts/local.
- One audited crypto family under both chains: viem delegates HD derivation to @scure/bip32 (Cure53-audited v1.0.1 in 2022, funded by the Ethereum Foundation) and @scure/bip39. The 2026 pass on the scure repos is a self-audit, not independent.
- viem has zero keystore code (verified by package inspection). Keystore v3 (AES-128-CTR + scrypt + keccak MAC) remains the interop standard (geth and `cast wallet import` read it). Build it with ethereum-cryptography 3.2.0 primitives (same noble/scure stack) rather than pulling ethers. File mode 0600. OS keychains are not headless-friendly on Linux (libsecret/dbus), so the passphrase-encrypted file is the baseline.
- ethers v6.17.0 is maintained but slower moving; viem (2.55.x, 4.94M weekly downloads vs 3.70M) is the standard for new projects.

## 2. Chain and RPC abstraction

- viem/chains ships 727 chain definitions; defineChain builds any chain at runtime from registry data.
- ethereum-lists/chains is the canonical registry, aggregated at chainid.network/chains.json: 2658 chains, 2497 with RPC URLs (chainlist.org is a frontend over it).
- viem fallback transport auto-fails-over across RPC URLs; rank: true reorders by stability and latency every 10s; retryCount 3 with exponential backoff.
- Bitcoin: mempool.space/api and blockstream.info/api are both keyless with the same Esplora shape (verified live). mempool.space returns 429 on excess; Blockstream added an optional keyed tier (500k req/month free).

## 3. Swaps (headless, no UI wallet)

- 0x Swap API: paid only in 2026. Standard plan $1,000/month; the 2023 free tier is gone (help pages 404). Confidence medium. Rejected.
- 1inch: free Dev plan (100k calls/month, 60 rpm) but mandatory KYC (Sumsub liveness + ID) before any key. Rejected for autonomous provisioning; viable if the operator does KYC once.
- CoW Protocol: public API, unauthenticated, per-IP limits (quote 10 rps, orders 5 rps). Intent model: solvers pay settlement gas, failed or cancelled orders cost nothing, and the signed limit price is enforced by the settlement contract (stronger than calldata minOut). Chains: Ethereum, Gnosis, Arbitrum, Base, Polygon, Avalanche, BNB, Lens, Linea. Latency ~15s batch auctions. Primary pick.
- KyberSwap Aggregator: free, no key, self-chosen x-client-id header, 18+ chains, actively maintained. Instant-execution fallback.
- Velora (ex-ParaSwap): keyless, ~1 rps guidance. Alternate fallback.
- Uniswap direct-to-router: fully keyless with only an RPC endpoint. Quote via on-chain V4Quoter/QuoterV2 eth_call, build calldata with @uniswap/v4-sdk + universal-router-sdk. Single-venue pricing, manual slippage. Backstop.
- Odos: now keyed + 3 bps protocol fee. Rejected. OpenOcean: 2 rps public plan (confidence medium).
- Jupiter (Solana, future): lite-api.jup.ag is being retired; keyless api.jup.ag at 0.5 rps, free key 1 rps.

## 4. Bridging

- LI.FI: fully usable keyless; a key is optional and only raises limits. Keyless caps: /quote and /advanced/routes 75 requests per 2 hours, stepTransaction 50 per 2 hours. Free Partner Portal key lifts to 100 rpm default. Fine for agent-paced bridging, not for quote polling. Sources: docs.li.fi.
- EVM to Bitcoin bridging is a different animal (THORChain-style); treated as a later adapter, not the first bridge.

## 5. Solidity toolchain

- Foundry v1.7.1 stable (2026-05-08), 1.0 since Feb 2025, stable releases every 1-2 months, nightlies daily. Single static binary via foundryup (Linux/macOS; Windows needs Git Bash or WSL). forge auto-manages solc versions and drives keyless source verification. solc-js compiles in-process for deploy.
- Hardhat 3.11.0 (viem-based toolbox, Rust EDR node) is credible but is a Node project framework, heavier to drive programmatically. Not picked.
- solc npm (solc-js 0.8.36, tracks upstream) as the light in-process compile path, deploying via viem deployContract, at the cost of manual import/remapping handling.

## 6. Contract verification and intelligence

- Etherscan API v2 is the only Etherscan (V1 dead since 2025-08-15): one key, 60+ chains, chainid query param. Keyed.
- forge verify-contract supports etherscan, sourcify (default), blockscout, oklink, custom. Sourcify and Blockscout paths are keyless (a counter-claim was refuted 0-3).
- Sourcify APIv2: GET /v2/contract/{chainId}/{address} returns source, ABI, metadata, proxy info. No key (verified live with WETH/USDT). v1 turned off 2026-07-07.
- Blockscout: Etherscan-style module=contract getabi/getsourcecode keyless, includes IsProxy + ImplementationAddress (verified live). Rate limits vary per instance (confidence medium).
- WhatsABI v0.27.0 (2026-07-10): guesses ABI + resolves proxies from bytecode for unverified contracts; provider-agnostic; default loader chains Sourcify + EtherscanV2.

## 7. Test environments

- Headless funding is the key: the Coinbase CDP faucet (free API key) drips gas to any address on Base Sepolia and Ethereum Sepolia, so an agent self-funds and the e2e suite runs on real public networks. Bitcoin test faucets still need a human, so Bitcoin e2e stays read-only.
- Ethereum testnets: Sepolia (11155111) live and default; its announced 2026-09-30 EOL slipped, successor unnamed (confidence medium on timing). Holesky is shut down. Hoodi (560048) is for staking, not app deploys. Etherscan v2 free tier, Sourcify, and Blockscout all cover Sepolia.
- Bitcoin testnets: signet is the stable public choice; testnet4 suffers block storms and BIP-95 (testnet5) is drafted to replace it; blockstream.info serves only testnet3 publicly, mempool.space serves testnet4 and signet.
- Faucets: nothing is cleanly headless in 2026 (PoW faucets need a browser session, Google Cloud faucet needs sign-in, signetfaucet.com drips with IP caps). Realistic pattern: fund a treasury wallet once manually; the toolkit self-funds child wallets from it.

## 8. MCP and prior art

Update 2026-07-26: the MCP face was discontinued in v0.2.0 (the CLI and the skills remained the supported surfaces). The notes below are kept as the point-in-time record.

- @modelcontextprotocol/sdk 1.29.0 (2026-03-30), Node >=18, zod v3/v4. v2 beta (@modelcontextprotocol/server 2.0.0-beta.5) targets stable 2026-07-28; v1 keeps fixes for 6+ months. stdio remains the standard transport for local Claude Code servers. Decision: build on 1.29.0, revisit v2 after it settles.
- Nobody ships the full combo (local keys + swap + bridge + Solidity deploy across EVM and Bitcoin as MCP + CLI + skill). Closest: strangelove-ventures/web3-mcp (multi-chain incl. Bitcoin UTXO + THORChain swaps, abandoned 2025-03), mcpdotdirect/evm-mcp-server (EVM transfers/writes, active, no swap/bridge/deploy), Coinbase Agentic Wallets (polished but keys live in Coinbase TEE), thirdweb (custodial-leaning Engine wallets), GOAT SDK (archived). Foundry MCPs exist separately (PraneshASP/foundry-mcp-server).
- Gaps this project fills: Bitcoin UTXO spend with local keys, sign + swap + bridge in one local-key server, Solidity deploy integrated with the wallet, and non-custodial MCP + CLI + skill packaging.

## Open questions

- Sepolia successor naming/launch (watch ethereum-magicians thread; re-check before hardcoding testnet defaults long-term).
- Whether to add THORChain adapter for native BTC-EVM swaps in a later phase.
- ~~MCP SDK v2 migration once 2.0 stable proves out~~ (moot: MCP face removed in v0.2.0).
