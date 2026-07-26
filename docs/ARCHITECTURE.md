# Architecture

One repo ships two faces over one engine: a self-contained CLI (any OS, any agent that can shell out to Node) and one fat agent skill replicated to every discovery convention (root, `skills/`, Claude and Codex plugin dirs). Both call the same layer code and emit the same envelope, so behavior is identical no matter how an agent reaches it.

Working name: `agent-wallet` (CLI bin, plugin name). npm package name: `agent-wallet-skill`. Repo stays `blockchain-skill`.

The ship unit for agents is `dist/agent-wallet.mjs`: one ESM file produced by `npm run build` (esbuild). Skill installers that copy this repo (noob `/skills add`, root `SKILL.md`) include that file, so the agent runs verbs with only Node on PATH. Host installs use the same file via `npm i -g agent-wallet` or `./agent-wallet` after build.

## Non-negotiables

- Non-custodial, barehand: keys are generated locally, stored only as a passphrase-encrypted keystore v3 file (mode 0600), and signing happens in-process. Broadcast goes straight to public RPC / Esplora endpoints. No MetaMask, no exchange, no hosted signer.
- Keyless by default: every default backend works with zero API keys (see docs/RESEARCH.md). Keyed backends (Etherscan v2, 1inch, LI.FI key) are optional accelerators, never requirements.
- Chain-agnostic: EVM chains resolve from viem/chains + chainid.network (2658 chains) via defineChain; Bitcoin ships mainnet/signet/testnet4. New chain families are new adapters, not rewrites.
- Fail closed: every value crossing a layer boundary is a schema-validated JSON envelope. A deterministic gate layer authorizes every state-changing operation before signing. Prompt text is never an enforcement mechanism.

## Layers (easy to hard, each a blackbox)

Each layer folder owns `CONTRACT.md`, `schema/`, `src/`, `tests/`, `fixtures/`, optional `SKILL.md` (maintenance notes). Outsiders read only CONTRACT.md + schema/. Cross-layer calls are function calls carrying envelope-shaped, schema-validated data; no layer imports another layer's src internals, only its published entry.

| # | Layer | Purpose | Network |
|---|---|---|---|
| 0 | `layers/core` | Envelope type, JSON Schema validation (fail closed), closed error codes, trace ids, state-file store for multi-step flows | none |
| 1 | `layers/keys` | Create/import BIP-39 wallet, HD derivation (EVM secp256k1, BTC taproot/segwit), keystore v3 encrypt/decrypt, list accounts/addresses | none |
| 2 | `layers/chains` | Resolve any chain (id, name, alias) to RPC endpoints, explorer, currency; viem fallback transport with ranking; Esplora endpoint selection for BTC | read |
| 3 | `layers/read` | Balances (native + ERC-20), UTXOs, tx lookup/history, fee estimation, receive addresses | read |
| 4 | `layers/sign` | Build + sign offline: EVM tx (EIP-1559), EIP-712 typed data, messages, BTC PSBT | none |
| 5 | `layers/gate` | Deterministic policy: chain allowlist (default testnet only, mainnet is explicit opt-in), per-tx spend caps, dry-run required flags. Returns allow/deny + reason. Fail closed | none |
| 6 | `layers/send` | Broadcast signed tx, nonce management, confirmation tracking, fee bump/replace | write |
| 7 | `layers/learn` | Contract intelligence: verified source + ABI via Sourcify -> Blockscout -> Etherscan v2 (keyed, optional) -> WhatsABI for unverified; proxy resolution | read |
| 8 | `layers/contracts` | Scaffold, compile (forge, solc-js fallback), deploy, verify (sourcify/blockscout keyless, etherscan keyed), call/write deployed contracts | write |
| 9 | `layers/swap` | Quote + execute, ports-and-adapters: CoW (primary), KyberSwap (fallback), Uniswap direct-to-router (backstop) | write |
| 10 | `layers/bridge` | Cross-chain route/quote/execute/status via LI.FI adapter | write |
| 11 | `layers/agentio` | The only composition point: CLI (`agent-wallet <verb>`) exposing every layer's verbs with the same envelopes; session `init` doctor; resume of multi-step state | n/a |

Ripple rule: `src/`-only changes ripple nowhere. Contract changes are additive (contractVersion minor bump) or new-shape-alongside for breaking.

### Envelope (every CLI response, every cross-layer value)

```json
{
  "contractVersion": "1.0.0",
  "ok": true,
  "data": { },
  "error": { "code": "GATE_DENIED", "message": "", "hint": "actionable next step" },
  "meta": { "layer": "send", "backend": "viem", "chain": "sepolia", "elapsedMs": 0, "traceId": "" }
}
```

Errors are a closed set per layer, declared in that layer's CONTRACT.md. `hint` carries steering text for the calling agent (what to do next), which is where tool-error context engineering lives.

### Security model

- Keystore: mnemonic encrypted to Web3 Secret Storage v3 (scrypt) using ethereum-cryptography primitives; interops with `cast wallet import` and geth. Passphrase comes from `AGENT_WALLET_PASSPHRASE` env or interactive prompt; it is never written to disk or logs.
- Data dir: `~/.agent-wallet/` (override `AGENT_WALLET_HOME`): `keystore/`, `state/` (multi-step flow files), `config.json` (gate policy, chain allowlist, optional API keys).
- Gate defaults ship safe: testnets allowed, mainnet denied until the user flips `config.json`. Every sign/send/deploy/swap/bridge passes the gate first; deny returns the reason and the exact config change that would allow it.
- External content (RPC responses, fetched contract source) is untrusted data: schema-validated, never executed, fenced when surfaced to an agent.

## gbrain skills (context engineering)

One fat skill, replicated to every discovery convention so any agent CLI finds it (mirrors the sibling research-skill layout):

- `SKILL.md` (repo root): the canonical skill, self-contained (operations plus reference appendixes, no external links).
- `skills/agent-wallet/SKILL.md`: byte-identical copy (container-dir convention for skill installers).
- `plugins/agent-wallet/skills/agent-wallet/SKILL.md` + `plugins/agent-wallet/.claude-plugin/plugin.json`: the Claude Code plugin.
- `plugins/agent-wallet-codex/` (`.codex-plugin/plugin.json`, same skill copy, `commands/agent-wallet.md`): the Codex plugin.
- Marketplaces: `.claude-plugin/marketplace.json` (Claude) and `.agents/plugins/marketplace.json` (Codex/agents).

`tests/check_skill.sh` enforces the copies stay byte-identical, frontmatter stays pushy, versions stay in lockstep, and the load-bearing safety rules survive edits. It runs as part of `npm test`.

Rules applied (from Anthropic skill-authoring guidance, researched 2026-07-22):

- One self-contained SKILL.md: purpose sentence, when to use, imperative numbered checklists of CLI calls per operation, then reference appendixes (keys, sending, adapters, Solidity) and anti-patterns.
- The description is a pushy trigger statement with explicit actions and chain names.
- Multi-step flows (swap, bridge, deploy) externalize progress to `~/.agent-wallet/state/<op>.json` so an agent can resume without replaying context.
- CLI verbs are thick (deploy = compile + estimate + gate + sign + broadcast + verify), with enum-constrained params (chain, asset), unit-suffixed names (amountWei), and steering errors.

`docs/INDEX.md` is the resolver: "the thing you want to change" to "the one folder to open", for both users of the toolkit and future maintainer agents.

## Delivery

- TypeScript, Node >= 22.18. Runtime deps kept minimal: viem, @scure/btc-signer (+ @scure/bip32/39), ethereum-cryptography, zod. Foundry is an external binary the contracts layer detects (with solc-js as the no-Foundry fallback).
- Packaging mirrors the siblings: root `SKILL.md`, `skills/agent-wallet/`, `plugins/agent-wallet/` (Claude), `plugins/agent-wallet-codex/` (Codex), `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`, npm package `agent-wallet` with bin `dist/agent-wallet.mjs`. Versions in lockstep across all manifests, enforced by `tests/check_skill.sh` and the distribution test (which also bans em/en dashes in docs).
- Install routes: `/skills add hec-ovi/blockchain-skill` (agent skill pack + bundled CLI), `npm i -g agent-wallet-skill` (when published), host `bin/init.sh`.
- Build: `npm run build` -> `dist/agent-wallet.mjs`. Committed so skill add works without a local compile. `pretest` rebuilds it.

## Testing

- Unit + contract tests per layer: schema round-trips validated against `schema/` exactly as shipped; external boundaries faked with fixtures; no network. This is the default `npm test`.
- Real public-network suites are opt-in: `RUN_LIVE=1` for keyless reads and quotes (Sepolia, signet, Sourcify, CoW, Kyber, LI.FI), and a self-funding end-to-end suite on Base Sepolia that pulls gas from the faucet layer (needs a free CDP key). No local node is used anywhere.
- Distribution test: manifest lockstep, skill descriptions, contract/schema links, no em/en dashes.

## Build order (one commit per step, pushed)

1. Scaffold: package.json, tsconfig, test runner (vitest), layout, README stub.
2. `core` (envelope + validation + errors + state store).
3. `keys` (mnemonic, HD, keystore v3). 4. `chains`. 5. `read`. 6. `sign`. 7. `gate`. 8. `send` (first full e2e: create wallet, fund via faucet, send on a public testnet, confirm).
9. `learn`. 10. `contracts` (second e2e: author, deploy, call on Base Sepolia). 11. `swap`. 12. `bridge`.
13. `agentio` (CLI grows per layer from step 2).
14. Skills + plugin + INDEX resolver. 15. Hardening: distribution tests, docs, repo surface.

## Out of scope for now

- Solana family (Jupiter adapter documented in research, not built this stage).
- THORChain-style native BTC-EVM swaps (bridge stays EVM-to-EVM first).
- Hardware wallets and OS keychains (passphrase-encrypted file is the baseline).
