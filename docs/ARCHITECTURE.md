# Architecture

One repo ships two faces over one engine: a self-contained CLI (any OS, any agent that can shell out to Node) and one fat agent skill replicated to every discovery convention (root, `skills/`, Claude and Codex plugin dirs). Both call the same layer code and emit the same envelope, so behavior is identical no matter how an agent reaches it.

Working name: `agent-wallet` (CLI bin, plugin name). npm package name: `agent-wallet-skill`. Repo stays `blockchain-skill`.

The ship unit for agents is `dist/agent-wallet.mjs`: one ESM file produced by `npm run build` (esbuild). Skill installers that copy this repo (noob `/skills add`, root `SKILL.md`) include that file, so the agent runs verbs with only Node on PATH. Host installs use the same file via `./agent-wallet` after build, or `npm i -g agent-wallet-skill` when the package is published.

## Non-negotiables

- Non-custodial, barehand: keys are generated locally, stored only as a passphrase-encrypted keystore v3 file (mode 0600), and signing happens in-process. Broadcast goes straight to public RPC / Esplora endpoints. No MetaMask, no exchange, no hosted signer.
- Keyless by default: every default backend works with zero API keys (see docs/RESEARCH.md). Keyed backends (Etherscan v2) are optional accelerators, never requirements.
- Chain-agnostic: EVM chains resolve from viem/chains + chainid.network via defineChain; Bitcoin ships mainnet/signet/testnet4. New chain families are new adapters, not rewrites.
- Fail closed: CLI responses and multi-step state are schema-shaped JSON envelopes. A deterministic gate layer authorizes every state-changing operation before signing. Prompt text is never an enforcement mechanism.

## Layers

Each layer folder owns `CONTRACT.md`, `schema/`, `src/`, `tests/` (and optional fixtures). `docs/INDEX.md` maps "what you want to change" to one folder.

### Isolation model (what is true today)

This is **module isolation with published surfaces**, not process isolation and not a microservices mesh.

- **Human / agent maintainers** of another layer should open only that layer's `CONTRACT.md` + `schema/` first. That is the contract for inputs, outputs, and errors.
- **TypeScript callers** may import only the *published* modules of another layer (for example `keys/src/wallet.ts`, `gate/src/policy.ts`, `sign/src/evm.ts`, `*/src/api.ts`). Private files (for example `keys/src/keystore.ts`) are not for cross-layer import. Enforced by `tests/import-boundary.test.ts`.
- **`agentio`** is the only composition root for the CLI. It wires verbs to layer APIs and formats envelopes for stdout.
- **`core`** is the shared leaf (envelope, home, config, state). Every layer may use it.
- Values that leave the process (CLI stdout, state files) go through the envelope shape. In-process calls use typed functions; they are not re-serialized at every hop.

Ripple rule for contracts: additive changes bump a minor `contractVersion`; breaking shapes are added alongside and callers migrate. Pure private-src edits that keep published modules stable do not force callers to change.

| # | Layer | Purpose | Network |
|---|---|---|---|
| 0 | `layers/core` | Envelope type, JSON Schema validation (fail closed), closed error codes, trace ids, state-file store for multi-step flows | none |
| 1 | `layers/keys` | Create/import BIP-39 wallet, HD derivation (EVM secp256k1, BTC taproot/segwit), keystore v3 encrypt/decrypt, list accounts/addresses | none |
| 2 | `layers/chains` | Resolve any chain (id, name, alias) to RPC endpoints, explorer, currency; viem fallback transport with ranking; Esplora endpoint selection for BTC | read |
| 3 | `layers/read` | Balances (native + ERC-20), UTXOs, tx lookup/history, fee estimation | read |
| 4 | `layers/sign` | Build + sign offline: EVM tx (EIP-1559), EIP-712 typed data, messages, BTC PSBT | none |
| 5 | `layers/gate` | Deterministic policy: chain allowlist (default testnet only, mainnet is explicit opt-in), per-tx spend caps. Returns allow/deny + reason. Fail closed | none |
| 6 | `layers/send` | End-to-end transfer: gate, sign, broadcast, optional EVM wait | write |
| 7 | `layers/learn` | Contract intelligence: verified source + ABI via Sourcify -> Blockscout -> Etherscan v2 (keyed, optional) -> WhatsABI for unverified; proxy resolution | read |
| 8 | `layers/contracts` | Compile (solc-js), deploy, verify (sourcify/blockscout keyless, etherscan keyed), call/write deployed contracts | write |
| 9 | `layers/swap` | Quote + execute (CoW, Kyber, Uniswap), wrap/unwrap native↔WETH | write |
| 10 | `layers/sandbox` | In-process EVM (@ethereumjs/vm v10): deploy and exercise contracts from a scenario plan, decode events and reverts, measure gas, check invariants | none |
| 11 | `layers/workflow` | The Solidity walk: numbered prompts served one step at a time, artifact gate, loop shield | none |
| 12 | `layers/agentio` | CLI composition (`agent-wallet <verb>`), session `init` doctor, help/version | n/a |

### Envelope (every CLI response)

```json
{
  "contractVersion": "1.0.0",
  "ok": true,
  "data": { },
  "error": { "code": "GATE_DENIED", "message": "", "hint": "actionable next step" },
  "meta": { "layer": "send", "backend": "viem", "chain": "sepolia", "elapsedMs": 0, "traceId": "" }
}
```

Errors are a closed set per layer, declared in that layer's CONTRACT.md. `hint` steers the calling agent (what to do next).

### Security model

- Keystore: mnemonic encrypted to Web3 Secret Storage v3 (scrypt) using ethereum-cryptography primitives; interops with `cast wallet import` and geth. Passphrase from `AGENT_WALLET_PASSPHRASE` or `--passphrase`; never written to disk or logs.
- Data dir: `~/.agent-wallet/` (override `AGENT_WALLET_HOME`): `keystore/`, `state/`, `cache/`, `config.json`.
- Gate defaults: mainnet and testnets allowed. Set `gate.allowMainnet=false` to lock mainnets. Every send/swap/deploy/write still passes the gate before sign (caps / denylist).
- External content (RPC responses, fetched contract source) is untrusted data: never executed as code.

## Skills (context engineering)

Two fat skills, each replicated to every discovery convention, in one plugin.

- `agent-wallet`: the wallet and chain surface. Canonical at `SKILL.md` (repo root), byte-identical at `skills/agent-wallet/SKILL.md` and in both plugin dirs.
- `agent-solidity`: the contract workflow. Canonical at `skills/agent-solidity/SKILL.md`, copied into both plugin dirs.
- Plugins: `plugins/agent-wallet/` (Claude) and `plugins/agent-wallet-codex/` (Codex), each carrying both skills.
- Marketplaces: `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`.

`tests/check_skill.sh` keeps copies byte-identical, versions lockstep, and load-bearing safety rules present. Runs as part of `npm test`.

The split is deliberate. A session that only sends ETH should not carry the Solidity workflow in context, and a contract session should not have to page past wallet verbs to find the walk. Depth lives one level down: the skill body is the entry point, and the step prompts in `layers/workflow/prompts/` load one at a time, only when the walk reaches them.

Agent flow: resolve CLI (PATH or skill-pack launcher / `dist/agent-wallet.mjs`) -> `init` once per session -> verbs. Each verb is one process, JSON on stdout, exit. `contract-step` is the documented exception: it prints the step as plain markdown, because the output is instructions for a model to read rather than data to parse. `--json` returns the envelope.

## Delivery

- TypeScript, Node >= 22.18. Runtime deps: viem, @scure/*, ethereum-cryptography, solc, @ethereumjs/* (vm, evm, common, block, tx, util, statemanager), zod. All pure JavaScript: no native module, no binary, no daemon.
- npm package `agent-wallet-skill`, bin `dist/agent-wallet.mjs`. Versions lockstep across package.json and plugin manifests.
- Install routes: `/skills add hec-ovi/blockchain-skill` (primary for agents), host `npm run build && ./agent-wallet`, optional `bin/init.sh`, optional npm global when published.
- Build: `npm run build` runs `npm run prompts` (inlines `layers/workflow/prompts/*.md` into `prompts.generated.ts`) then esbuild. Output is one file, `dist/agent-wallet.mjs`, plus `dist/vendor/` for solc. Both are committed so skill add works without a local compile. `pretest` rebuilds them.

## Testing

- Default `npm test`: build bundle, vitest (schema/contract, offline unit, CLI e2e, import boundary, distribution), `tests/check_skill.sh`.
- Send layer: offline gate denials and a full signet transfer with mocked Esplora (sign + broadcast path without a live node).
- Sandbox layer: the fixture pair is the ground truth. The vulnerable `Vault` must stay drainable by the `Attacker` reentrancy PoC, and `SafeVault` must stop the same plan. Both run on the in-process EVM across every advertised hardfork.
- Workflow layer: every mode walked end to end, the artifact gate and loop shield exercised, the generated prompt module checked against the `.md` files.
- Opt-in live: `RUN_LIVE=1` for public testnet reads/quotes.

## Out of scope for now

- Solana family.
- Cross-chain bridging (out of scope).
- Hardware wallets and OS keychains (passphrase-encrypted file is the baseline).
- Process-per-layer isolation or network RPC between layers.
