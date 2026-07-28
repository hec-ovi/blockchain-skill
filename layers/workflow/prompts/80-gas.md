# Gas: measured, not guessed

Every gas claim in this step comes from a number in `sandbox.json`. No estimates from intuition, and no optimization applied without a before and after.

Write `gas.md`.

## 1. Baseline

Copy the current numbers out of `sandbox.json`: deploy gas per contract, runtime size in bytes, and gas per step. Sort the steps by cost. The top three are the only ones worth your attention; everything below them is noise a user never notices.

## 2. What is actually expensive

In order of magnitude, and only these matter:

- Writing a storage slot that was zero. Roughly an order of magnitude more than one that already held a value, and far more than anything else in a normal function.
- Reading a storage slot repeatedly instead of caching it in memory once.
- Storage layout: two values read together that do not share a 32-byte slot cost a second cold read.
- Loops that touch storage per iteration.
- Deployment size, which you pay once, against runtime cost, which every user pays forever. Optimize the one your contract actually incurs: a contract called a million times is a different problem from one deployed a thousand times.

## 3. The changes worth making

Apply only what your baseline justifies:

- Cache a repeatedly read storage variable in a local.
- Pack struct and state variable declarations so co-read values share a slot.
- `immutable` and `constant` for values that never change; they cost no storage read at all.
- Custom errors instead of revert strings, if any string survived step 40.
- `calldata` instead of `memory` for external function array and bytes parameters.
- Short-circuit the cheap check first in a compound condition.
- Raise `--optimize-runs` for a hot contract, lower it for a large one you deploy often. The compiler's optimizer is on at 200 runs by default here.

## 4. What not to do

- Do not use `unchecked` for gas without the bound proof step 40 requires. Saving 40 gas is not worth an overflow.
- Do not drop a validation check, an event, or an access guard to save gas. Those are the things that make the contract correct.
- Do not reach for inline assembly. The savings are small on a normal contract and the review cost is large.
- Do not restructure logic for gas at the price of readability. Step 60 has to audit this again.

## 5. Prove the behavior did not change

Re-run the full plan after every change:

    agent-wallet sandbox-run --plan ./plan.json

`pass` must still be true, every step must still return what it returned, and every invariant must still hold. An optimization that changes a single decoded return value or a revert reason is not an optimization, it is a rewrite that needs the audit again.

## 6. The table

Close `gas.md` with before and after for deploy gas, runtime size, and each of the steps you touched, plus the percentage change. If a change saved less than a few percent, revert it and say you did. Complexity that buys nothing is a cost paid by the next person to read the code.
