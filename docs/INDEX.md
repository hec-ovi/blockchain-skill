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
| Cross-chain bridging | `layers/bridge/` |
| Self-serve testnet funding (CDP faucet) | `layers/faucet/` |
| CLI verbs, MCP tools, output formatting | `layers/agentio/` |
| Agent-facing skills (SKILL.md, references) | `skills/<operation>/` |
| Packaging, manifests, install routes | repo root + `.claude-plugin/` |

Build status: all layers shipped and tested. This table is the contract for where things live; update it the moment a layer lands or moves.
