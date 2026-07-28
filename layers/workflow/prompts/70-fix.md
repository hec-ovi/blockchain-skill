# Fix: close the findings, then prove it

If `audit.md` says PASS with no critical or high finding open, there is nothing to do here. Say so and run NEXT.

Otherwise, work the findings in severity order, critical first. One finding at a time.

For each:

1. **Name the root cause**, not the symptom. "The balance is written after the call" is a cause. "Reentrancy" is a category.
2. **Fix the contract**, in the smallest change that removes the cause. Resist the rewrite: a large diff at this point invalidates everything the sandbox already proved and reintroduces bugs the audit already cleared.
3. **Add the test that would have caught it** to `plan.json`, with the finding's id or title in the step `name`. A fix with no test is a fix that regresses silently.
4. **Re-run the walk from compile**: `agent-wallet contract-step --mode build --step 45-compile`. Compile, then sandbox, then audit again from cold. The audit is only worth something when it reads the code as it now stands.

## What a fix must not be

- Loosening an assertion in `plan.json` so a failure goes green.
- Deleting the function that had the finding, unless the spec really did not need it. If you remove it, update `spec.md` and `design.md` and say so.
- Adding a comment that acknowledges the problem instead of removing it.
- A guard that only stops the exact sequence the test used. Fix the class, then check that the class is gone.

## Accepting a risk instead of fixing it

Some findings are genuinely a design tradeoff the human owns: an admin key that is an EOA at launch, an oracle that can be wrong within its bounds, an upgrade path someone wants deliberately. Those may be accepted rather than fixed, but only when all three are true: the human is told in plain words, the acceptance is written into `audit.md` with its consequence, and it carries into the handoff report. Never accept a critical finding, and never accept anything silently.

## If you keep going round

If the same finding survives two fixes, or the walk has served this step several times, stop. The gate will cut you off at {{MAX_VISITS}} visits anyway. Tell the human what keeps failing, what you tried, and what you think the real constraint is. A contract that cannot be made to pass is a design problem, and that is a decision for a person, not another loop.
