# Document: what a stranger needs before they trust this

The people who read this next are a user deciding whether to send money, and a developer integrating against it. Neither has your context. Write `docs.md`.

## 1. NatSpec completeness

Go back into `contract.sol` and make sure it is actually there, not just intended:

- `@title` and `@notice` on the contract, saying what it does in a user's words.
- `@notice` on every external and public function, describing the effect, not the implementation.
- `@param` for every argument, `@return` for every return value.
- `@dev` wherever the reason for something is not obvious from the code.
- A `@notice` on every custom error explaining when a caller sees it.

If you change the source here, re-run compile and sandbox before advancing. Comments cannot break a contract, but edits made while editing comments can.

## 2. The integration surface

A table of every external and public function: signature, who may call it, what it changes, what it returns, which events it emits, and which errors it can revert with. This is what someone builds against.

Then the events: name, indexed fields, and what a listener should conclude when it fires.

## 3. How to use it

The ordinary path, as a sequence of calls with real values. If the contract needs setup (approve a token, transfer ownership, set a parameter), show that first and in order. Someone should be able to follow this without reading the source.

## 4. What it does not protect against

Carry the accepted risks forward from `audit.md` and the "not defending against" list from `design.md`, in plain words a non-specialist understands. Admin key powers belong here, spelled out: say exactly what the owner can do to a user's funds. This is the part people most want to leave vague and most need to read.

## 5. Deployment facts

- Compiler version and the exact settings used, including optimizer runs and the EVM version. Anyone verifying the source needs these to reproduce the bytecode.
- Constructor arguments, with their meaning.
- Which chain, and whether it is a testnet.
- Runtime size in bytes and deploy gas, from `sandbox.json`.

## 6. Write it plainly

No marketing. No adjective triads. Name the thing, give the number, move on. If a sentence sounds good read aloud but carries no fact, cut it.
