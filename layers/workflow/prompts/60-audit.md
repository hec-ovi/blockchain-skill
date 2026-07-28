# Audit: the gate

Step back and review the contract as a senior auditor who did not write it and does not care whose feelings are involved. This is a GATE. Nothing advances toward a chain while any dimension fails.

Read every artifact in the WORK DIR that exists: `spec.md`, `threat.md`, `design.md`, `contract.sol`, `compile.json`, `sandbox.json`, `map.md`, `target.md`. Then read the source itself, line by line, top to bottom. Do not audit from your memory of writing it; the whole value of this step is looking at it cold.

Score each dimension PASS or REVISE. A REVISE carries the file and line, what is wrong, the concrete consequence, and the fix. "Consider adding a check" is not a finding. "Line 74 sends before zeroing the balance, so a contract receiver re-enters `withdrawAll` and drains the pool, proven by the `pwn` step in sandbox.json; move the write above the call" is a finding.

Write `audit.md`: the per-dimension verdict, the findings, and the overall verdict.

## The dimensions

**1. Access control.** Every function that changes ownership, roles, fees, addresses, limits, or that moves value, has a guard, and the guard is the right one. No privileged path is reachable from an unprivileged caller. The constructor leaves no unowned or unconfigured window. If upgradeable, the initializer cannot be called twice and cannot be called by anyone. Ownership transfer is two-step. Every guard has a negative test in `sandbox.json` that actually fired. This is the largest single cause of real losses; be slowest here.

**2. Business logic.** The rules themselves cannot be played. Same-block deposit and withdraw is not profitable. The first depositor is not special. A direct transfer into the contract's balance cannot skew a share price or an accounting ratio. No decision is made on a balance an outsider can inflate. Every economic path from `threat.md` has an answer in the code.

**3. Value flow and external calls.** Every path value can leave by is guarded and intended. Every low-level call's return value is read. ERC-20 handling accepts tokens that return nothing and rejects tokens that return false. A reverting recipient cannot block anyone else (pull over push). No call hands control out before state is written, or the reentrancy guard covers it and a comment says why.

**4. Reentrancy, including read-only.** Checks, effects, interactions holds in every function that both writes state and calls out. Cross-function reentrancy is closed: re-entering a *different* function mid-call cannot see inconsistent state. Read-only reentrancy is closed: a view function another protocol reads cannot return a half-updated value during your external call. If the contract makes any external call, `sandbox.json` contains an attacker contract that tried and failed.

**5. Input validation.** Every external parameter is checked: zero address where an address is required, zero amount where zero is meaningless, values above their bound, the contract's own address, duplicates in arrays, arrays long enough to exhaust gas. Rejections use custom errors and each one has a test that fired.

**6. Arithmetic and rounding.** Every division states which way it rounds and who that favors, and it favors the protocol, not the caller. No division before multiplication. Every `unchecked` block carries a proof in a comment naming what bounds the value. Every cast to a smaller type cannot truncate a realistic value. No `Panic` appears in `sandbox.json` outside a step that expected it.

**7. Oracles, prices, and ordering.** No price comes from a spot balance or a pool ratio readable inside one transaction. Feeds have a staleness bound and a sanity range, and a zero or reverting feed is handled. Price-sensitive actions take slippage and deadline from the caller. Nothing valuable is decided by `block.timestamp`, `blockhash`, or `prevrandao`. Signatures are bound to a nonce, a deadline, `chainid`, and this contract's address.

**8. Denial of service and gas.** No loop iterates over a list anyone can grow without bound. No single failing element blocks a batch. No function's gas cost grows with total usage until it stops fitting in a block. Deployed size is under {{CODE_SIZE_LIMIT}} bytes.

**9. Compiler and language hygiene.** Pragma is pinned at `^{{MIN_PRAGMA}}` or tighter, not a wide floating range. No `tx.origin` used for authorization. No `selfdestruct`. No `delegatecall` to an address a non-admin controls. No inline assembly unless the design called for it, and each block documented. Every solc warning in `sandbox.json` is either fixed or has a written reason. Explicit visibility and honest mutability throughout.

**10. Observability and documentation.** Every state change emits an event carrying enough to rebuild state from logs alone, with sensible indexing. NatSpec covers the contract, every external and public function, and every custom error. The code implements what `design.md` says, and where it does not, the design was updated rather than quietly diverged from.

## Coverage check

Before the verdict, confirm against `sandbox.json`:

- Every external and public function appears in at least one step.
- Every custom error has fired in at least one step.
- Every privileged function was called by an unauthorized account and refused.
- Every invariant from `spec.md` is in `invariants` and held.

Any gap here is a REVISE on the dimension it belongs to, not a note. Untested code is unaudited code.

## Severity

Rate each finding: **critical** (funds can be taken or permanently locked), **high** (funds at risk under a plausible condition, or a privileged action reachable by the wrong party), **medium** (breaks an invariant or a stated requirement without direct loss), **low** (hygiene, gas, documentation). Report them in that order.

## The verdict

PASS only when all ten dimensions pass and there is no critical or high finding open. Anything else is REVISE.

State the verdict in one line at the top of `audit.md` so it cannot be missed. If REVISE, the next step fixes it, and you will run this audit again from cold after the fix. Do not carry a failing contract toward a deployment step, and do not soften a finding because fixing it is inconvenient.
