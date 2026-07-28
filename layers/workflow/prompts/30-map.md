# Map: understand it before you judge it

Findings written from a skim are noise. Build the map first, then audit against it. Write `map.md`.

Read the whole contract once with no goal but understanding. Then answer the following, in the source's own terms, not in generalities.

## 1. What it actually is

One sentence: what the contract does and for whom. Then say whether that matches the claim you recorded in `target.md`. A gap between claim and code is often the finding.

## 2. Entry points

Every external and public function, in a table: signature, mutability, who may call it, what state it writes, what value it moves, what it calls out to. Include `receive` and `fallback`. Include anything reachable through a modifier that is weaker than it looks.

Mark the ones that move value and the ones that change privilege. Those two sets are where you will spend most of your time.

## 3. State and who owns it

Every state variable: type, who writes it, who reads it, and what an invalid value would be. Note anything only written in the constructor, anything never written at all, and anything written from more than one place.

## 4. Privilege

- Every role, every address that holds one today, and what each can do.
- The full list of things a compromised admin key could do to user funds. Write it as a list of concrete actions, not as "the owner has privileges".
- How ownership moves, and whether it is one step or two.
- If upgradeable: the pattern, who can upgrade, and what happens to storage.

## 5. Money paths

Trace value in and value out. For each exit: which function, who can trigger it, what limits it, and what would have to be true for it to send more than intended. Draw it as a list of paths, not prose.

## 6. External dependencies

Everything it calls: tokens, routers, oracles, callbacks, other protocol contracts. For each, what it assumes about behavior and what breaks if that assumption is wrong. A token that takes a fee on transfer, an oracle that reverts, a router that returns less than quoted.

## 7. Reconstruct the invariants

The contract's authors may never have written them down. You write them: what must be true after every transaction. Solvency, conservation of supply, monotonic counters, bounds on fees, authority over settings. These become the `invariants` in the sandbox plan when you build a proof, so make them checkable.

## 8. Where you would attack

Close with your own ranked list: the three to five places you think value leaks, in order, each with the sequence you would try. The audit step works from this list, and step 65 makes you prove or drop each one.
