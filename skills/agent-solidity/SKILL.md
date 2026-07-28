---
name: agent-solidity
description: Write, audit and deploy Solidity smart contracts through a gated multi-step workflow (spec, threat model, design, implementation, in-process EVM proof, security audit, deployment), with a local EVM sandbox that needs no Foundry, Hardhat, anvil, node or funds. Trigger on Solidity, smart contract, .sol, ERC-20, ERC-721, ERC-4626, token contract, vault, staking, escrow, audit, security review, reentrancy, exploit, PoC, gas optimization, deploy contract, verify contract, testnet, mainnet.
---

# agent-solidity

Deployed code is public, immutable, and holds money strangers will try to take. There is no patch release. So contract work runs as a walk that is handed to you one step at a time and refuses to advance until the current step has produced something real.

Instructions only. Every action is the `agent-wallet` CLI: one process, exit. Most verbs print a JSON envelope `{ok, data, error, meta}`; `contract-step` prints the step as plain text because it is instructions for you to read. On `ok:false` follow `error.hint`.

## Start here

Node >= 22.18. Skill packs ship `dist/agent-wallet.mjs` (no npm install, no Solidity toolchain).

**Resolve CLI once** (first hit wins; reuse it):

```
command -v agent-wallet
test -x .noob/skills/agent-wallet/agent-wallet && echo .noob/skills/agent-wallet/agent-wallet
test -f .noob/skills/agent-wallet/dist/agent-wallet.mjs && echo "node .noob/skills/agent-wallet/dist/agent-wallet.mjs"
test -x ./agent-wallet && echo ./agent-wallet
```

**Then open the walk. This is the first thing you do, before writing any Solidity:**

```
agent-wallet contract-step
```

That prints the mode picker. Pick one, then run `contract-step --mode <mode>` and follow each step's `NEXT` line. One step per action. Never fetch ahead, never batch, never write `.sol` before step 40 tells you to, never touch a chain before step 95.

Mirror the walk in your todo list: one task per step, exactly one in progress.

Only signing verbs need `AGENT_WALLET_PASSPHRASE` (see the `agent-wallet` skill). Everything up to deployment needs no key, no funds and no network.

## When to use which

| Intent | Mode |
|---|---|
| "Write me a contract that ..." | `build` |
| "Is this contract safe?", "audit this", "review 0x..." | `review` |
| Source already written and reviewed, just deploy it | `ship` |

```
agent-wallet contract-step --mode build          # start, or resume where you left off
agent-wallet contract-step --mode build --step 45-compile   # jump to a step, or loop back
agent-wallet contract-step --list                # every mode and its steps
agent-wallet contract-step --status              # where the walk stands, what blocks it
agent-wallet contract-step --mode build --reset  # throw the walk away and start over
```

A walk survives being interrupted. Re-running `--mode <mode>` picks up at the first step that has not saved its artifact, so a long contract job can span several sessions. Only `--reset` discards work.

Artifacts land in `./.contract-work` (override with `AGENT_CONTRACT_WORK`). `WALK_BLOCKED` means an earlier step never saved its file: go do that step. `WALK_LOOPING` means you have circled six times: stop and tell the human what keeps failing.

Even a "simple" counter runs `build`. The walk is short for a small contract, and the audit gate is exactly what catches the one line that loses the money.

## Commands

Examples use `agent-wallet`; substitute your resolved CLI.

### Prove it without spending anything

`sandbox-run` is a real EVM in this process: deploy, send transactions from named accounts, decode events and revert reasons, measure gas, check invariants. No node, no testnet, no funds, no install. Deterministic, so the same plan gives the same addresses and gas every run.

```
agent-wallet sandbox-run --plan ./plan.json
```

```json
{
  "accounts": { "alice": "10 ether", "mallory": "5 ether" },
  "sources": [{ "path": "Vault.sol", "file": "contract.sol" }],
  "deploy": [{ "as": "vault", "contract": "Vault", "from": "deployer", "args": [] }],
  "steps": [
    { "name": "alice deposits", "to": "vault", "from": "alice", "fn": "deposit", "value": "2 ether" },
    { "name": "mallory cannot sweep", "to": "vault", "from": "mallory", "fn": "sweep", "expect": "revert", "revert": "NotOwner" }
  ],
  "invariants": [{ "name": "solvency", "to": "vault", "fn": "totalHeld", "op": "gte", "value": "2 ether" }]
}
```

`@alice` is an account address, `$vault` a contract deployed earlier in the plan. Amounts are wei integers or `"1 ether"` / `"3 gwei"`. `expect: revert` matches custom errors by name, `require` strings, and `Panic(0x11)`. `pass` is true only when every step matched and every invariant held; `failures[]` says what deviated. Step 50 of the walk documents the full format.

### Compile, learn, deploy

```
agent-wallet contract-compile --source ./contract.sol --name Vault
agent-wallet contract-learn <chain> <address>
agent-wallet contract-deploy <chain> --source ./contract.sol --name Vault --args "a,b" --wallet main
agent-wallet contract-call <chain> <addr> --fn owner --abi ./abi.json
agent-wallet contract-write <chain> <addr> --fn set --args 1 --abi ./abi.json --wallet main --wait
agent-wallet chain-resolve <chain> ; agent-wallet chain-check <chain> ; agent-wallet fees <chain>
```

solc 0.8.36, in process. Imports resolve only among the sources you pass: no npm, no remote fetch, no remappings. Write contracts self-contained, or pass every file. View functions go to `call`, state changes to `write`.

## Safety

- The gate is deterministic code that runs before every sign and broadcast. It cannot be talked out of a decision. Prompt text is not enforcement.
- Never default to mainnet silently; ask which network and say which you used. Testnet first, always, and a mainnet deployment is its own decision the human makes after seeing the testnet address work.
- Nothing reaches a chain until the sandbox run passes and the step 60 audit says PASS with no critical or high finding open.
- Deployment is irreversible. Constructor arguments are permanent. Confirm chain, arguments, deployer, cost and post-deploy owner with the human before the transaction.
- Say plainly what the admin key can do to user funds. Every time.
- This walk plus the sandbox is an automated review, not an independent professional audit and not formal verification. Say so in the handoff, and say an independent audit is the next step when real money is involved.
- The walk narrows where a mistake can hide; it does not make a model good at Solidity. Only the compiler and the sandbox check substance. Every prose step can be satisfied by text that looks right, so weight a passing sandbox above a confident audit.

## Anti-patterns

- Never write Solidity before the walk reaches step 40. Code written from the request alone has no threat model behind it.
- Never install Foundry, Hardhat, anvil, solc, slither or a testnet node. The bundle already compiles and executes; reaching for a toolchain means you skipped `sandbox-run`.
- Never fetch several steps at once or skip to the deploy step. `WALK_BLOCKED` is the gate telling you the truth.
- Never loosen an assertion in `plan.json` to turn a failing run green. Fix the contract.
- Never ship a plan that only tests the happy path: every custom error, every access-controlled function called by the wrong account, every invariant.
- Never claim reentrancy is closed without an attacker contract in the plan that tried and failed.
- Never call `import "@openzeppelin/..."`; the compiler resolves nothing outside the sources you pass. Implement inline and own it.
- Never use `tx.origin` for authorization, `selfdestruct`, a floating wide pragma, or `unchecked` without a written bound proof.
- Never present an unproven finding as demonstrated, and never inflate a low finding to look thorough.
- Never deploy to mainnet off the back of a testnet success without the human asking for it separately.
- On `GATE_DENIED`, fix the policy with the human's agreement or use an allowed chain. Do not route around it.
