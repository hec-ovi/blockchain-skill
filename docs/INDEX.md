# Resolver

The thing you want to touch, mapped to the one folder to open. Read that folder's CONTRACT.md + schema/ only; never another layer's src/.

| You want to change | Open |
|---|---|
| Envelope shape, error codes, schema validation, state files | `layers/core/` |
| Wallet creation, mnemonics, HD derivation, keystore encryption | `layers/keys/` |
| Chain resolution, RPC endpoints, transport fallback, Esplora selection | `layers/chains/` |
| Balances, UTXOs, history, fees, receive addresses | `layers/read/` |
| Transaction building and offline signing (EVM, EIP-712, PSBT) | `layers/sign/` |
| Policy: allowlists, spend caps, mainnet opt-in, deny reasons | `layers/gate/` |
| Broadcasting, nonces, confirmations, fee bumping | `layers/send/` |
| Fetching ABI/source, proxy resolution, unverified contracts | `layers/learn/` |
| Compiling, deploying, verifying, calling contracts | `layers/contracts/` |
| Swap quotes and execution, aggregator adapters | `layers/swap/` |
| CLI verbs, init doctor, output formatting | `layers/agentio/` |
| Bundled CLI build (esbuild) | `scripts/build.mjs` -> `dist/agent-wallet.mjs` |
| Agent-facing skill (fat SKILL.md and its copies) | `SKILL.md` (canonical), `skills/`, `plugins/` |
| Packaging, manifests, install routes | repo root + `.claude-plugin/` + `.agents/` + `plugins/` |
| Live dual-agent noob benchmark (Sepolia, local Qwen3.6-35B Q8) | `docs/BENCHMARK.md` |

Build status: all layers shipped and tested. This table is the contract for where things live; update it the moment a layer lands or moves.
