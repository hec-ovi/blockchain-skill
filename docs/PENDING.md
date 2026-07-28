# Pending

State as of 2026-07-28, release v0.5.0. What is proven, what is not, and what to pick up next.

## Proven

The wallet and chain surface is done. 25 of the 26 CLI verbs were driven by an agent and recorded by a shim over the bundled CLI, so coverage is counted rather than asserted. Eight Sepolia transactions, all confirmed: agent-to-agent payment, wrap, approve, Uniswap swap, contract deploy, cross-agent contract call, unwrap. The README benchmark section carries the matrix.

Solidity specifically: the local Qwen3.6-35B compiled and deployed a real contract to Sepolia at `0xece19429032df2f9d36E91B80Ef992C754bEf890` (tx `0x6d82a333`), verified independently against the chain (bytecode recompiled and compared, every ABI selector found in the deployed code, `owner()` read back, live `ping()` write). Claude Haiku 4.5 did the same at `0xc91b4aba57f3f5ce5cc13ec1e08946cb5e5498ca`.

The sandbox layer is well covered: the fixture pair proves a reentrancy exploit drains the vulnerable vault and that the checks-effects-interactions version stops the same plan, across every hardfork from London to Osaka.

## Not proven

**The walk has never been completed end to end by an agent.** Best run reached step 11 of 14 (`90-deploy-plan`), twice, before hitting noob's 50-round input cap. Both real deployments happened via `contract-deploy` after the walk stalled, not through step `95-deploy`.

Artifacts an agent has produced: `spec.md`, `threat.md`, `design.md`, `contract.sol`, `compile.json`, `plan.json`, `sandbox.json`, `audit.md`, `gas.md`, `docs.md`.

Artifacts no agent has ever produced: **`deploy.md`** (step 90) and **`handoff.md`** (step 99). Those two step bodies have been served but never carried out, so their instructions are untested against a real model.

**`review` and `ship` modes have never been run by an agent at all.** Both pass the unit tests that walk their sequences, but no model has followed `10-target`, `30-map`, `65-poc` or `90-report` on a real contract. The review mode is the one that audits someone else's code and writes runnable exploit proofs, so it is the least validated part of the release.

`contract-verify` has never been driven by an agent. It was wired to the CLI during the post-release audit (the layer had implemented it since 0.4.x but nothing exposed it, and the deploy step told agents to run a verb that did not exist). It also needs the `forge` binary, which nothing else in the toolkit does.

## Known weaknesses, unfixed

- Asked to act without naming a chain ("unwrap 0.0002 weth"), the model assumed Ethereum mainnet, read a zero balance and reported the wallet empty. It stopped and asked rather than acting, and the gate refuses unauthorized writes regardless, but the rule to ask which network first did not carry. The rule appears once in `SKILL.md` under "When to use which"; it is probably not load-bearing enough for a small model.
- A malformed `--abi` file returns `CLI_CRASH: Unexpected end of JSON input` instead of a coded error with a hint.
- Skill activation is unreliable on a mid-task resume prompt. "Finish deploying the ping contract to sepolia" did not load `agent-solidity`; naming the skill did.

## Next

1. **Trim the step prompts.** One walk pass is about 8 minutes of generation on a 35B at 43 t/s, and almost all of it is prose: `spec.md` came out 3.3 KB, `threat.md` 5.4 KB, `design.md` 3.5 KB. Every gate wants specific facts, not essays. Rewriting the steps to ask for tables and short answers should cut the walk substantially without weakening a single gate. Do this before benchmarking the walk again.
2. **Finish one walk end to end**, through `95-deploy` and `99-handoff`, so `deploy.md` and `handoff.md` exist and their instructions are tested. Needs either the trimmed prompts or several `noob exec` inputs, since the 50-round cap is hard-coded in noob with no env knob.
3. **Run `review` mode** against a real deployed contract, ideally one with a known bug, and check whether `65-poc` actually produces a runnable exploit rather than a plausible-sounding claim.
4. **Strengthen the ask-the-network rule** so a chain-less request does not get a mainnet guess.
5. Optional, never done: npm publish (`agent-wallet-skill` is unclaimed) and a GitHub release page. This repo has only ever shipped git tags.

## Reproducing the benchmark

Workspaces are outside this repo at `/home/hec/workspace/noob-peers/` (peerA, peerB) and `/home/hec/workspace/noob-e2e-ping/`, each with its own keystore and `.env`. Roughly 0.017 Sepolia ETH is spread across the three wallets. The passphrase for `noob-e2e-ping` leaked into transcripts during the run; treat that wallet as disposable.

The verb shim is `dist/agent-wallet.mjs` replaced by a logger that appends `$2` to `verb-coverage.log` and then imports `agent-wallet.real.mjs`. Recreate it with `noob-peers/setup.sh`.
