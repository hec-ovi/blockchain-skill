# Proof: make each finding run, or drop it

A finding you cannot demonstrate is a guess, and a report full of guesses is worse than no report: it burns the reader's trust and buries the real ones. In this step every critical and high finding from `audit.md` either becomes a runnable exploit or gets downgraded.

Write `poc.md`.

## For each critical and high finding

1. **State the claim as an outcome**, not a category. "An account with no role can call `setFeeTo` and redirect every future fee" is a claim. "Missing access control" is a label.
2. **Build the plan** that produces that outcome in the sandbox. Deploy the target from its real source with realistic constructor arguments, fund the accounts the exploit needs, and run the sequence. Where the exploit needs a hostile contract, write one as a second source.
3. **Assert the bad outcome happens.** This is the inversion that catches wishful findings: the step that should fail is written as `"expect": "ok"`, and the invariant the contract claims is written so it BREAKS. A run where `pass` is false because the solvency invariant did not hold is your proof.

       agent-wallet sandbox-run --plan ./poc-<n>.json

4. **Record the evidence**: the plan file, the exact steps, the final balances, the invariant that broke, and the gas the attack cost. An exploit that costs more gas than it takes is not economically real, and saying so is part of an honest finding.
5. **Then prove the fix.** Apply the minimal change to a copy of the source, run the same plan unchanged, and show the exploit now reverts and the invariant holds. A fix suggestion that has not been run is a suggestion, not a recommendation.

## When the proof fails

The exploit does not work. That is a result, and a good one. Do not reshape the plan until something goes red. Instead work out why: the code has a guard you missed, the ordering does not allow it, the economics do not close. Downgrade the finding, write the reason in `poc.md`, and move on.

Findings that survive as unproven may still be reported, but they are labelled clearly as unproven, with what would be needed to settle them. Never present an unproven finding as demonstrated.

## Medium and low findings

These do not need a running exploit. They do need a specific file and line, a concrete consequence, and a fix. A medium finding with no consequence stated is a low finding. A low finding with no line number is a note.

## What goes into the report

For each finding: severity, title, file and line, the claim, the proof (plan file plus the observed result) or the reason it is unproven, the fix, and the fix's own proof. That is the shape step 90 expects, so write it that way here.
