# Report: what you found, what you proved

Write `report.md`. The reader is deciding whether to use, fix, or walk away from this contract. Give them what they need for that decision and nothing else.

## 1. Summary

Four lines at the top:

- What was reviewed: contract name, address, chain, source version, and whether it is verified.
- The verdict, in one sentence.
- Counts by severity: critical, high, medium, low.
- The one thing to do first.

## 2. Scope

What you looked at and what you did not, carried from `target.md`. Which files, which addresses, which compiler. If it is a proxy, both addresses, and which one the findings apply to. If the source could not be matched to deployed bytecode, that goes here in plain words.

## 3. Findings

Ordered by severity, critical first. For each:

- **Title**: the outcome, not the category.
- **Severity**, and why it is that severity. Critical means funds can be taken or permanently locked. High means funds are at risk under a plausible condition, or a privileged action is reachable by the wrong party. Medium breaks an invariant or a stated requirement without direct loss. Low is hygiene, gas, or documentation.
- **Location**: file and line.
- **What happens**: the concrete sequence, with who calls what in what order.
- **Proof**: the plan file from `poc.md` and what the sandbox showed, or clearly labelled UNPROVEN with what would settle it.
- **Fix**: the specific change, and the result of running the same plan against the fixed source.

## 4. Privilege and centralization

A plain-words list of what the admin address can do to user funds. This is not a finding, it is a fact users deserve, and it is usually the largest real risk in a contract that has no bugs at all. Include whether the key is an EOA, a multisig, or a timelock, and what happens if it is lost.

## 5. What was tested

The sandbox coverage: which functions were exercised, which negative tests fired, which invariants were checked and held. Name them. A statement that "the contract was tested" carries no information.

## 6. Limits of this review

Say it exactly:

- This is an automated review with sandbox proofs on an in-process EVM, not an independent professional audit and not formal verification.
- Which classes were checked by reasoning rather than by execution.
- What was out of scope: external protocols, off-chain components, the deployment and key management, economic modelling under adversarial market conditions.
- If the contract holds meaningful value, an independent human audit is still the next step.

## 7. Write it flat

No hedging, no softening, no adjective triads. A critical finding is stated as a critical finding. If you found nothing critical, say that plainly too, and resist inflating a low finding to look thorough. The value of this report is that its severities can be trusted.
