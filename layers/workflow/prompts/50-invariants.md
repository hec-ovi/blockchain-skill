# Test plan: turn the spec into something a machine can fail

Write a sandbox plan that exercises the contract on a real EVM. Save it as `plan.json` in the WORK DIR. Step 55 runs it.

The sandbox is in-process: no node, no testnet, no funds, no waiting. Gas is metered but never deducted, and the block never advances, so the same plan gives the same addresses, the same gas and the same balances every time. That means a failure is reproducible and a pass is evidence.

## The plan format

```json
{
  "hardfork": "{{SANDBOX_DEFAULT_FORK}}",
  "accounts": { "alice": "10 ether", "mallory": "5 ether" },
  "sources": [
    { "path": "Vault.sol", "file": "contract.sol" },
    { "path": "Attacker.sol", "file": "attacker.sol" }
  ],
  "deploy": [
    { "as": "vault", "contract": "Vault", "from": "deployer", "args": [], "value": "0" },
    { "as": "attacker", "contract": "Attacker", "from": "mallory", "args": ["$vault"], "value": "1 ether" }
  ],
  "steps": [
    { "name": "alice deposits", "to": "vault", "from": "alice", "fn": "deposit", "value": "2 ether" },
    { "name": "balance reads back", "to": "vault", "from": "alice", "fn": "balanceOf", "args": ["@alice"], "returns": "2000000000000000000" },
    { "name": "mallory cannot sweep", "to": "vault", "from": "mallory", "fn": "sweep", "expect": "revert", "revert": "NotOwner" }
  ],
  "invariants": [
    { "name": "pool holds what was deposited", "to": "vault", "fn": "totalHeld", "op": "eq", "value": "2 ether" },
    { "name": "attacker gained nothing", "balanceOf": "attacker", "op": "lte", "value": "1 ether" }
  ]
}
```

Rules that matter:

- `accounts` maps a name to a starting balance. `deployer` always exists with `100 ether`. Give the attacker a realistic amount, not an unlimited one, unless you are modelling a flash loan on purpose.
- `sources[]` takes either `{path, file}` reading from the WORK DIR, or `{path, content}` inline. Imports resolve only among these files.
- `deploy[]` runs in order. `as` is the handle everything else uses.
- Amounts are wei as a plain integer, or a unit string: `"1 ether"`, `"0.05 ether"`, `"3 gwei"`. Never a vague size.
- Address arguments: `"@alice"` is an account, `"$vault"` a contract deployed earlier in this plan. Numbers stay strings so 256-bit values survive JSON.
- `kind` defaults to `auto`: `view` and `pure` become reads, everything else a transaction. Force it with `"kind": "call"` or `"send"`.
- `expect` is `ok` by default. `"expect": "revert"` with `"revert": "NotOwner"` requires that specific failure. The matcher understands custom errors by name, `require` strings, and `Panic(0x11)` for overflow.
- `returns` compares a read's value as a string. Big numbers are decimal strings, addresses lowercase hex.
- `invariants` run after the last step. Either a view call (`to` + `fn` + `args`) or a native balance (`balanceOf`, naming an account or a contract handle). `op` is one of `eq ne lt lte gt gte`.
- `hardfork` accepts `london paris shanghai cancun prague osaka amsterdam`. Sources compile for the same fork, so pick the one your target chain actually runs.

## What the plan must cover

A plan that only shows the contract working is not a test plan. Cover all of this, and say in a comment field or the step `name` which requirement each step comes from.

1. **The happy path**, end to end, in the order a real user does it.
2. **Every revert path you wrote.** One step per custom error, each with `expect: revert` and the error named. An error nobody can trigger is dead code, and an error that fires when it should not is a broken contract. This is the cheapest test in the walk and the one most often skipped.
3. **Every access-controlled function called by the wrong person.** At least {{MIN_NEGATIVE_TESTS}} negative test per privileged function, from an account that must be refused. Access control is the single largest cause of real losses; prove each guard fires.
4. **Boundaries.** Zero, one, the maximum, one over the maximum. The empty case (first user, empty pool, no deposits). Repeated calls when only one should be allowed.
5. **The invariants from `spec.md`**, all of them, as `invariants` entries. If an invariant cannot be expressed as a view call or a balance, add a view function to the contract that exposes it. That is a legitimate reason to change the code.
6. **The ranked threats from `threat.md`.** For every threat you claimed the design removes, add the step sequence that would exploit it if the design were wrong, and assert it fails. If the threat needs a hostile contract, write one.

## Writing the attacker

If the contract makes any external call, sends native value, or has any hook a receiver can implement, write an attacker contract as a second source and deploy it in the plan. It is the only way to prove reentrancy is actually closed. A minimal one:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^{{MIN_PRAGMA}};

interface ITarget { function deposit() external payable; function withdrawAll() external; }

contract Attacker {
    ITarget public immutable target;
    uint256 public constant CHUNK = 1 ether;
    constructor(address t) payable { target = ITarget(t); }
    function pwn() external { target.deposit{value: CHUNK}(); target.withdrawAll(); }
    receive() external payable { if (address(target).balance >= CHUNK) target.withdrawAll(); }
}
```

Then assert the exploit fails and the invariant holds:

```json
{ "name": "reentrancy is closed", "to": "attacker", "from": "mallory", "fn": "pwn", "expect": "revert" }
```

The guard on re-entry matters: an attacker that re-enters forever runs the target out of balance and reverts for the wrong reason, which reads as a pass when it is not. Stop re-entering when the target can no longer pay.

## Before you leave this step

Count them. Every custom error has a step. Every privileged function has a refused caller. Every invariant in `spec.md` is in `invariants`. Every ranked threat has either a step that tries it or a written reason it cannot be expressed. If any of those is missing, the plan is not done.
