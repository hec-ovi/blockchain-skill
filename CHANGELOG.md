# Changelog

## 0.5.0

- New `agent-solidity` skill: a gated contract workflow served one step at a time (`contract-step`), with modes for build, review and ship. Artifact gate refuses to advance past a step that produced nothing; loop shield stops an agent circling.
- New `layers/sandbox`: a real EVM in the CLI process (@ethereumjs/vm v10, London through Amsterdam). `sandbox-run --plan` deploys and exercises contracts, decodes events and revert reasons including custom errors and Panic codes, measures gas, checks runtime size against EIP-170, and evaluates declared invariants. Offline and deterministic: no Foundry, no node, no funds, no install.
- New `layers/workflow`: the step machine and its prompts, inlined into the bundle at build time (`npm run prompts`).
- `contracts`: multi-file compile with relative import resolution and solc warnings surfaced.
- Audit step scores ten dimensions against the EEA EthTrust Security Levels and the OWASP Smart Contract Top 10 (2026).
- `wallet-import` takes `--mnemonic-file <path>` or `--mnemonic -` (stdin), so a seed phrase no longer has to enter shell history.
- Fixed: `.env` is found by walking up from the working directory, and a relative `AGENT_WALLET_HOME` resolves against the project root. Running a verb from a subdirectory used to lose the wallet.
- Fixed: `contract-step --mode <mode>` resumes an in-progress walk instead of wiping it; only `--reset` discards work.
- Benchmarked: two agent peers on Sepolia, all 25 verbs measured, wallet through to a deployed contract called by the other peer.

## 0.4.2

- Gate default: mainnet allowed (set allowMainnet false to lock).
- README: dual noob peer Sepolia agent benchmark (local Qwen3.6-35B Q8), on-chain tx matrix.

## 0.4.1

- Removed faucet (CDP) layer and CLI verb. Fund testnets externally.

## 0.4.0

- Removed cross-chain bridge (LI.FI layer and CLI verbs) from the toolkit and skill.

## 0.3.6

- wrap/unwrap native↔WETH; Uniswap Sepolia quote+execute; LI.FI User-Agent; swap refuses bare native sell with wrap hint.

## 0.3.5

- `wallet-export`: address + private key (optional mnemonic); prefer `--out` file mode 0600.

## 0.3.4

- Vendor solc beside the CLI so skill-pack installs can compile without a local node_modules.
- Resolve hyphenated chain names (base-sepolia, etc.).

## 0.3.3

- Lean fat skill rewrite (websearch-shaped): intent table, full verbs, safety, anti-patterns. Dropped playbook bloat. Enforced <220 lines.

## 0.3.2

- Expert skill rewrite: intent-to-verb routing, complete verb catalog (including faucet, chain-*, all contract/swap/bridge flows), multi-step playbooks (transfer, swap, bridge, deploy, return funds), error playbook, send-vs-swap-vs-bridge routing rules.

## 0.3.1

- Send layer offline tests: mainnet gate denial, invalid amount/address, wrong passphrase, full signet transfer with mocked Esplora.
- Import-boundary test: cross-layer imports must hit published modules only.
- Architecture doc states the real isolation model (published TypeScript surfaces + envelope CLI, not process blackboxes) and includes the faucet layer.
- MIT LICENSE; skill guidance from live noob e2e (durable passphrase, no keystore brute-force, balance needs an address).

## 0.3.0

- Self-contained CLI bundle `dist/agent-wallet.mjs` for plug-and-play skill packs.
- Session `init` doctor verb.
- Skill-root and `bin/agent-wallet` launchers; Node-only runtime after skill install.
- Skill install primary path: `/skills add hec-ovi/blockchain-skill`.

## 0.2.0

- Dropped MCP face; CLI + skills only.
- Faucet layer (CDP); live verification on public testnets.
