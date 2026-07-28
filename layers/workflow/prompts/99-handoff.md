# Handoff: what the human gets

Write `handoff.md`. This is the only artifact most people will read, so it carries the facts they need and none of the process.

## 1. The contract

- Name, chain, address.
- Explorer link.
- Whether the source is verified, and where.
- Compiler version, optimizer runs, EVM version.
- Deploy transaction hash.

## 2. Who controls it

- The owner or admin address right now, and whether that is an EOA, a multisig, or a timelock.
- Exactly what that address can do, in plain words. If the owner can move user funds, pause withdrawals, or change a fee to 100 percent, write that sentence.
- If ownership transfer is pending acceptance, say so.
- What happens if the key is lost.

## 3. How to use it

The ordinary sequence of calls with real values, from `docs.md`. Enough that someone can use the contract without reading the source.

## 4. What was verified, and how

- The audit verdict from `audit.md` and the date.
- What the sandbox actually proved: how many steps, which negative tests, which invariants held. Name them; a count alone means nothing.
- Gas and size from `gas.md`.

Be exact about the strength of this evidence. The sandbox proves the paths that were tested on an in-process EVM. It is not a professional audit, it is not formal verification, and it is not a guarantee. If the contract will hold meaningful money, say that an independent human audit is the next step.

## 5. Known limitations and accepted risks

Every accepted risk from `audit.md`, every item from "what it does not protect against" in `docs.md`, every open question from `spec.md` that never got answered. One line each, no softening.

## 6. Files

Where everything lives: the source, the ABI, the sandbox plan, the audit. Someone re-auditing this in six months starts from that list.

## Then stop

Report the address and the two or three things the human must act on, and stop. The walk is complete. Do not deploy anything else, do not move funds, and do not start a mainnet deployment off the back of a testnet one unless they ask for it as its own decision.
