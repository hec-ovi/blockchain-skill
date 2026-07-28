# Implement: write the Solidity

Now write it. Read `design.md` and implement exactly that, no more. A feature that is not in the design is a feature nobody threat-modelled.

Save the main contract to `contract.sol` in the WORK DIR. Extra files go beside it and import by relative path (`./Errors.sol`). The compiler resolves imports only among the files you pass it, so nothing may import from npm, a remote URL, or a package name.

## Hard rules

These are not style preferences. Each one maps to a class of real loss.

1. **`// SPDX-License-Identifier: MIT`** on line one, and a pragma of `^{{MIN_PRAGMA}}` or tighter. Never a wide floating range: the bytecode you audited must be the bytecode you deploy.
2. **Checks, effects, interactions**, in that order, in every function. State is written before any external call, any native transfer, any token hook. When you cannot, add the reentrancy guard and say why in a comment.
3. **Custom errors**, not revert strings: `error NotOwner();` then `if (msg.sender != owner) revert NotOwner();`. Give each error the parameters a caller needs to understand the failure.
4. **An event for every state change**, carrying enough to reconstruct the new state from logs alone. Index the fields people filter on, at most three.
5. **Explicit visibility and mutability** on every function and state variable. Mark `view` and `pure` honestly; the sandbox uses them to decide whether a step is a read or a transaction.
6. **Validate every input.** Reject the zero address where an address is required, reject zero amounts where zero is meaningless, reject values above their bound. Do it at the top, with a custom error.
7. **`immutable` and `constant`** for anything that never changes after deployment.
8. **Handle the return of every external call.** `(bool ok, ) = to.call{value: v}(""); if (!ok) revert SendFailed();` Never leave a low-level call's bool unread. For ERC-20, treat a missing return value as success and a `false` return as failure, both.
9. **No `tx.origin`** for authorization, ever. `msg.sender` only.
10. **No `selfdestruct`.** It no longer does what old code assumed and it is deprecated.
11. **No `delegatecall`** to an address anyone but the contract's own admin controls, and none at all unless the design called for it.
12. **`unchecked` only where you can state the proof** in a comment on the line above, naming what bounds the value. Watch casts: a downcast that silently truncates is not covered by 0.8 overflow checks.
13. **No unbounded loop** over an array that anyone can grow. If a list can grow with user actions, paginate or make it pull-based.
14. **No randomness from chain data.** `block.timestamp`, `blockhash`, `block.prevrandao` are all visible or influenceable by whoever produces the block.
15. **NatSpec on every external and public function**: `@notice` in the words of the person calling it, `@param` for each argument, `@return`, and `@dev` for anything non-obvious. Also on the contract itself and on every custom error.

## Write it to be read

Order the file the conventional way, so a reviewer's eye lands where it expects: type declarations, state variables, events, errors, modifiers, constructor, receive and fallback, external, public, internal, private, and view/pure last within each group.

Keep functions short enough to hold in your head at once. A function you cannot fully reason about is one you cannot audit, and step 60 will ask you to audit it.

Comment the reasoning, not the syntax. `// effect before interaction: a malicious receiver must not see a stale balance` earns its line. `// set the owner` does not.

## Before you leave this step

Reread your own code once, slowly, against `threat.md`. For each ranked threat, point at the line that stops it. If you cannot point at a line, you have not implemented the design yet.

Do not compile in this step and do not test in this step. The next steps do that, and they do it in a way that produces evidence.
