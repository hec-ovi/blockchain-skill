# Design: answer the threat list before you write code

Still no Solidity. This step decides the shape, and the shape is what makes the code safe or not. A well written function inside a bad design is still a loss.

Read `spec.md` and `threat.md`. Write `design.md`.

## 1. Contracts and files

Name each contract, say what it owns, and say why it is separate. Prefer one contract. Every additional contract is another trust boundary and another external call.

This toolkit compiles the sources you hand it and resolves imports only among those sources. Nothing is fetched from npm or a remote registry. So either write the contract self-contained, or list every file you will author and how they import each other by relative path. If you want a well-known base such as an ownership pattern, an ERC-20, or a reentrancy guard, you implement it inline and you own it. That is a real constraint: prefer the smallest correct implementation over a partial copy of a large library you cannot fully review.

## 2. Storage layout

A table: slot order, name, type, who writes it, who reads it.

- Pack deliberately. Values that fit together in 32 bytes and are read together should sit together.
- `immutable` for anything set once in the constructor. `constant` for compile-time values. Neither uses a storage slot.
- Choose the smallest type that cannot overflow the real range, then justify it. `uint96` for a token amount is a truncation bug waiting for a large holder.
- If the contract is upgradeable, say which storage pattern holds the layout stable. Namespaced storage under ERC-7201 is the current answer, and solc {{SOLC_VERSION}} computes the base slot for you with the `erc7201` builtin.

## 3. Access control

- Every privileged action and the exact check that guards it.
- Prefer explicit roles over one owner when there is more than one kind of privilege. Least privilege: the pauser should not also be able to move funds.
- Two-step ownership transfer. A one-step transfer to a mistyped address is unrecoverable.
- What the contract looks like at the instant the constructor finishes. There must be no window where it is unowned or unconfigured and reachable.
- If any role is a plain EOA at launch, write that down here. It will show up in the audit.

## 4. Answer the threat list

Take the ranked list from `threat.md` and answer every row with the design decision that removes it, or with an explicit accepted risk and why it is acceptable. An unanswered row fails the audit later.

## 5. The patterns you are committing to

State which of these apply and where:

- **Checks, effects, interactions.** Write state before you call out. This is the default for every function that both changes state and calls anything external.
- **Pull over push.** Let people withdraw what they are owed instead of pushing payments to them. One reverting recipient then cannot block anyone else.
- **Reentrancy guard** on any function that hands control out and cannot be made CEI-clean. On Cancun and later a transient storage guard is the cheap form; say which you use.
- **Custom errors** rather than revert strings. Cheaper and typed, and the sandbox matches them by name.
- **Events on every state change**, with the values needed to rebuild state from logs alone. Index what people will filter by.
- **Slippage and deadline parameters** supplied by the caller on anything price sensitive.
- **Explicit rounding direction** on every division, always against the user and toward the protocol, stated per formula.

## 6. External calls

For each call out: to whom, with what value, what you do with the return value, what happens if it reverts, and what state is already written when it happens. If you call an ERC-20, say how you handle tokens that return nothing, tokens that return false, and tokens that take a fee on transfer.

## 7. Interfaces

The full external surface: every public and external function with its signature, mutability, access, events emitted, and the errors it can revert with. This is the contract's public promise, and step 50 tests exactly this list.

## 8. What you are not defending against

Written plainly, so it can end up in the handoff: admin key compromise, a chain reorg, a malicious token the user chooses to use, an oracle that lies within its bounds. The human deserves to see this before deployment, not after.
