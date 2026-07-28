# agent-wallet (blockchain-skill)

Toolkit that lets any AI agent operate a wallet directly on-chain: create wallets, receive, send, swap, wrap, sign, deploy and verify Solidity contracts, and learn how deployed contracts work. Keys are generated and stored on your own machine (encrypted keystore v3), and transactions go straight to public RPC endpoints. No MetaMask, no exchange, no custodial anything.

Two faces over one engine: a self-contained CLI (`agent-wallet <verb>`) and fat agent skills replicated to every discovery convention (repo root, `skills/`, Claude and Codex plugin dirs). Same verbs, same JSON envelope everywhere.

Two skills ship in the pack. `agent-wallet` is the wallet and chain surface below. `agent-solidity` is a gated workflow for writing and auditing contracts, with a local EVM to prove them on. See [Solidity workflow](#solidity-workflow).

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
| Solidity workflow | contract-step, sandbox-run | local |
| Session | init, version, help | local |

Every default backend is keyless. Optional Etherscan key only raises contract-learn limits.

## Solidity workflow

Deployed code is immutable and holds money, so contract work runs as a walk that is handed to the agent one step at a time and refuses to advance until the current step has produced a file.

```
agent-wallet contract-step                    # the mode picker
agent-wallet contract-step --mode build       # spec, threat model, design, implement,
                                              # compile, test plan, sandbox, audit gate,
                                              # fix, gas, docs, deploy plan, deploy, handoff
agent-wallet contract-step --mode review      # audit existing source or an on-chain address
agent-wallet contract-step --mode ship        # deploy already-reviewed source
agent-wallet contract-step --status           # where the walk stands, what blocks it
```

Artifacts land in `./.contract-work`. Skipping a step returns `WALK_BLOCKED` naming the step you owe; circling one step six times returns `WALK_LOOPING` and tells the agent to hand back to the human. Step bodies live in `layers/workflow/prompts/` and are inlined into the bundle at build time, so they load one at a time rather than all at once.

`sandbox-run` is a real EVM inside the CLI process (`@ethereumjs/vm` v10, hardforks through Amsterdam). It compiles with solc 0.8.36, deploys, sends transactions from named accounts, decodes events and revert reasons (custom errors by name, `Panic` codes with their meaning), measures gas, reports runtime size against the EIP-170 limit, and checks invariants you declare.

```
agent-wallet sandbox-run --plan ./plan.json
```

```json
{
  "accounts": { "alice": "10 ether", "mallory": "5 ether" },
  "sources": [{ "path": "Vault.sol", "file": "contract.sol" }],
  "deploy": [{ "as": "vault", "contract": "Vault", "from": "deployer" }],
  "steps": [
    { "to": "vault", "from": "alice", "fn": "deposit", "value": "2 ether" },
    { "to": "vault", "from": "mallory", "fn": "sweep", "expect": "revert", "revert": "NotOwner" }
  ],
  "invariants": [{ "name": "solvency", "to": "vault", "fn": "totalHeld", "op": "gte", "value": "2 ether" }]
}
```

No Foundry, no Hardhat, no anvil, no node, no testnet funds, no `npm install`. It is deterministic (fixed block, zero base fee, keys derived from account names), so a failure reproduces and a pass is evidence. Gas is metered but never deducted, which keeps balance assertions exact.

The audit step scores ten dimensions against the EEA EthTrust Security Levels and the OWASP Smart Contract Top 10 (2026), and gates on all ten passing with no critical or high finding open. It is an automated review with runnable proofs, not an independent professional audit.

## Safety

Mainnet and testnets are allowed by default. To lock mainnets, set `{"gate":{"allowMainnet":false}}` in `~/.agent-wallet/config.json` (optional per-chain allowlist and per-tx caps). Every state-changing operation still passes the gate before sign; reads are never gated.

## What we verified

**Automated suite.** `npm test` builds the bundle, then runs contract tests for every layer, BIP-86/BIP-84 vectors, coin selection, envelope validation, real CLI e2e (source + bundle), and `tests/check_skill.sh` (skill copies byte-identical, versions lockstep, launcher + `dist/agent-wallet.mjs` present).

**Sandbox ground truth.** The fixture pair is a deliberately reentrant `Vault` and its `Attacker`. The suite asserts the exploit actually drains the vault (attacker deposits 1 ETH, walks away with 3, invariant breaks) and that the checks-effects-interactions version stops the same plan unchanged. It runs on every advertised hardfork from London to Osaka.

**Live public-network checks** (opt in with `RUN_LIVE=1`): Sepolia and Bitcoin signet reads, Sourcify ABI fetch, CoW / Kyber quotes.

**Agent benchmark:** two peers on Sepolia, all 25 CLI verbs measured (see bottom of this README). Covers wallet creation, agent-to-agent payment, swap, and the full Solidity path from spec to a deployed contract that the other agent then calls.

## Architecture

Layers under `layers/` each own `CONTRACT.md`, `schema/`, `src/`, and `tests/`. Cross-layer TypeScript imports are limited to published modules (import-boundary test); the CLI composition root is `agentio`. Outbound agent I/O is one JSON envelope. See `docs/ARCHITECTURE.md` and `docs/INDEX.md`.

Layer order: core, keys, chains, read, sign, gate, send, learn, contracts, swap, sandbox, workflow, agentio (CLI + init).

Release artifact: `npm run build` writes `dist/agent-wallet.mjs` (single Node ESM file). Skill installs and the package ship that file so agents need only Node.

---

## Agent benchmark: two peers on Sepolia, wallet and Solidity

Live end-to-end of **agent-wallet 0.5.0**: two independent agent workspaces, two wallets, ordinary English prompts. No verb was chosen for the agents. Every command below is one an agent picked and typed itself after reading the skill.

### Setup

| Piece | Choice | Why |
|---|---|---|
| Runtime | noob CLI `0.5.1` (`noob exec -p ... --yolo`) | Real agent loop: load skill, resolve CLI, run verbs, read JSON envelopes |
| Install | `git clone` of this repo into `.noob/skills/`, the route `/skills add` takes | Node only, no `npm install` in the agent workspace |
| Model (bulk) | **Qwen3.6-35B-A3B**, GGUF **Q8_0**, local | Small MoE, ~3B active. The question is not whether it writes good Solidity; it is whether the skill carries a weak model through the job |
| Model (tail) | **Claude Haiku 4.5** | A second model family on the same skill, for the last verbs |
| Server | llama.cpp Vulkan, AMD Strix Halo (gfx1151), **64K context, one slot** | Deliberately tight: one request at a time, compaction at 48K |
| Network | Ethereum Sepolia (`11155111`) | Public testnet, real RPCs, real gas, real Uniswap pools |

| Peer | Address |
|---|---|
| A | `0x0C694913133AF426Dbb25504d3c13C0849C7F60b` |
| B | `0x9B2947f51003e4A6A5EE02a7e9f508CCF9171477` |

Each agent created its own wallet from a plain request. Peer A was funded once from outside; every transfer after that is agent-driven.

### Verb coverage

**25 of 25 verbs, measured.** A shim over the bundled CLI in each workspace logged every verb the models actually invoked, so this is counted, not asserted.

```
init            version         wallet-create   wallet-import   wallet-list
wallet-addresses wallet-export  balance         fees            tx
utxos           chain-resolve   chain-check     send            wrap
unwrap          swap-quote      swap            contract-learn  contract-compile
contract-deploy contract-call   contract-write  contract-step   sandbox-run
```

### On-chain matrix (agent-driven)

| Block | From | Action | Tx |
|---|---|---|---|
| 11368256 | (external) | funding peer A, 0.009 ETH | [0xe311e2f5…](https://sepolia.etherscan.io/tx/0xe311e2f5f9014dd41161b97f86bef8fe4efdb6dc4884b5b4517ffccb21fc5ce1) |
| 11368267 | peer A | **pays peer B** 0.002 ETH | [0x350f2f7f…](https://sepolia.etherscan.io/tx/0x350f2f7ff73c5aace4bb6e9f3d2eb14576cd8e0877847c7124bab06d86168c63) |
| 11368345 | peer A | wrap 0.001 ETH to WETH | [0x95d31902…](https://sepolia.etherscan.io/tx/0x95d31902382fd3a9f97f765bfe1f45692be98edbe09490b70535a91a461dc646) |
| 11368350 | peer A | approve router | [0x778253c4…](https://sepolia.etherscan.io/tx/0x778253c46fa128e7c051c45342c741d65b94f7f8aefe1408adfb5077e8f50e6f) |
| 11368351 | peer A | **swap** WETH to USDC (Uniswap) | [0x6bdd23dd…](https://sepolia.etherscan.io/tx/0x6bdd23dd6c0359d9834131bfe1750224cf4a07e28aa457441cfaf25e0c832a5b) |
| 11368687 | peer B | **calls a contract peer A deployed** | [0x2e732600…](https://sepolia.etherscan.io/tx/0x2e7326005cb56deb1c7af0dba745e0c1775153d06f0f7e72dc1d5cbcad6520b6) |
| 11368697 | peer A | **deploys** `Ping` | [0x7d4cc4f9…](https://sepolia.etherscan.io/tx/0x7d4cc4f9829d5c8806ab72b7bb4f8ef34b7d37fdb51c73bb222bea05505b5c0e) |
| 11368699 | peer A | unwrap 0.0002 WETH | [0xcd4316c9…](https://sepolia.etherscan.io/tx/0xcd4316c9644c4068747be5f91b0abf10560d6e61ccb219a3b17429eb584ace1d) |

Sepolia WETH `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`, USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.

### The Solidity side

From `"make a contract that has a ping function, deploy it on sepolia"` and nothing else, the local 35B loaded the workflow skill off its description, mirrored the 14 steps into its own todo list, and walked them in order. Unprompted, it produced custom errors, two-step ownership, an indexed event, NatSpec, and an attacker contract for the reentrancy proof. Along the way:

- The compile gate caught a real mistake (`indexed` on a custom error, which Solidity rejects) and the agent fixed it.
- The sandbox ran 17 steps with 5 access-control negatives all reverting `OwnableNotOwner()`, 3 invariants holding, zero compiler warnings, 899 bytes of runtime code.
- The artifact gate fired for real: the agent tried to reach the audit without saving `sandbox.json`, got `WALK_BLOCKED`, and complied.
- The audit gate passed all ten dimensions after re-reading the source cold.
- The walk survived a context compaction at 75% of the 64K window without losing its place.

Deployed contracts were checked independently rather than taken from the agent's report: runtime bytecode recompiled and compared byte for byte (metadata stripped), every ABI selector confirmed present in the deployed code, `owner()` read back, and a live `ping()` write landed.

### What this run cost, honestly

The wallet surface is quick: 20s to create a wallet, 50s to send, 137s to wrap and swap, 48s to unwrap. The whole two-peer wallet and swap sequence was 27 minutes.

The contract walk is not quick. One pass is about 8 minutes of generation on a 35B at 43 t/s, because the steps ask for substantial written artifacts (the spec, threat model and design came out 3 to 5 KB each). Two limits are worth stating rather than hiding:

- noob caps a single input at 50 rounds. The 14-step walk needs more than that on this model, stopping at step 11 twice in a row. The walk resumes across inputs by design, so it is pacing, not failure.
- Each compaction forces the server to reprocess the whole rewritten context, about 50 seconds at 40K tokens. Thirty-one of those over the session.

Claude Haiku 4.5 ran the same skill against the same CLI and finished four verbs in 115 seconds and two more in 80.

### What the agents found

Four defects, every one surfaced by an agent doing ordinary work, all fixed in 0.5.0:

- `.env` was read only from the exact working directory, and a relative `AGENT_WALLET_HOME` resolved against it, so an empty keystore was quietly created beside the scratch files. The contract walk tells the agent to work in a scratch subdirectory, so the wallet appeared to vanish the moment it did.
- Agents inlined `AGENT_WALLET_PASSPHRASE=...` on every command, putting the secret in transcripts and shell history. After the skill was changed to forbid it, a rerun showed zero occurrences.
- `contract-step --mode <mode>` wiped the work directory, which is exactly the command an agent reaches for to continue an interrupted walk. It now resumes at the first unsaved step.
- `wallet-import` only accepted `--mnemonic "twelve words"`, so a seed phrase necessarily entered shell history. There is now `--mnemonic-file` and `--mnemonic -`.

One weakness is not fixed and is worth knowing: asked to unwrap without naming a chain, the model assumed mainnet, read a zero balance there and reported the wallet empty. It stopped and asked rather than acting, and the gate refuses unauthorized writes regardless, but the instruction to ask which network first did not carry.

**Out of scope for this run:** Bitcoin spends (read-only), mainnet, explorer source verification.

**Date:** 2026-07-28 · agent-wallet **0.5.0** · noob **0.5.1** · **Qwen3.6-35B-A3B Q8_0** local and **Claude Haiku 4.5**.
