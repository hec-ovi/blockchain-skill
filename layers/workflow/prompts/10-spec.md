# Spec: what this contract owes, to whom

Do not write Solidity in this step. You are pinning down what the contract must do, so the later steps have something to check against. Most contract losses trace back to a requirement nobody wrote down, not to a language mistake.

Read what the human asked for. Where the request is silent on something below, pick a concrete answer, write it down as YOUR assumption, and flag the ones the human should confirm. Do not leave a blank, and do not ask ten questions before starting. Ask only where a wrong guess would lose money or make the contract useless.

Write `spec.md` with these sections.

## 1. One sentence

What the contract is, in one sentence a non-programmer understands. If you cannot fit it in one sentence, the contract is doing two jobs and should be two contracts, or one contract with a much narrower scope. Say so.

## 2. Actors

A table of every party who can touch the contract, and what each may do:

| Actor | Who they are | What they may do | What they must never do |
|---|---|---|---|

Include the deployer, the owner or admin roles, ordinary users, and anyone external the contract calls or that calls it (a router, a relayer, another protocol). "Anyone on the internet" is an actor. Name them explicitly.

## 3. Assets and the money path

- What of value does the contract hold or move: native coin, ERC-20, NFTs, an accounting balance, voting power, nothing at all.
- Where does value enter, and by which function.
- Where does value leave, and by which function. Every exit is a place an attacker aims at, so list them all.
- Who is entitled to each unit of value at rest, and how the contract knows.

If the contract holds nothing, say so plainly. That single fact removes most of the risk surface and the later steps will be short.

## 4. State

The facts the contract must remember between transactions, in plain words, not yet as Solidity types. For each: who writes it, who reads it, and what makes a value invalid.

## 5. Invariants

The statements that must be true after EVERY transaction, no matter what anyone calls in what order. These become executable checks in step 50, so write them as things a computer can compare. Aim for at least three. Typical shapes:

- Solvency: the contract's balance is at least the sum of what it owes.
- Conservation: total supply equals the sum of balances.
- Monotonicity: a counter or a timestamp never decreases.
- Authority: only an address holding role R can change setting S.
- Bounds: a fee is never above the declared maximum.

## 6. What must never happen

The failure list, in the human's terms. "A user cannot withdraw more than they deposited." "Nobody but the owner can pause." "Funds cannot be locked forever if the owner disappears." That last one is a real requirement, not a nicety; write down what happens if the admin key is lost.

## 7. Lifecycle and admin posture

- Is the contract immutable once deployed, or upgradeable? Default to immutable. Upgradeability is a live admin key over user funds forever, and it is the single biggest thing you can add to the attack surface. If the human wants it, write down why.
- Who owns it after deployment, and does ownership transfer to a multisig or timelock?
- Is there a pause, and who can unpause?
- Can value be recovered if something goes wrong, and who decides?

## 8. Environment

- Which chain or chains, and are they mainnets or testnets. Ask if unstated; never assume mainnet.
- Which standards apply (ERC-20, ERC-721, ERC-1155, ERC-4626, ERC-2612 permit). Naming the standard now means the audit step can check conformance later.
- Compiler: solc {{SOLC_VERSION}}, pragma pinned at `^{{MIN_PRAGMA}}` or tighter.
- Any external contract this one must call, by name and address if known.

## 9. Out of scope

What you are deliberately NOT building. This protects you from scope drift in step 40 and protects the human from thinking they got something they did not.

## 10. Open questions for the human

Only the ones where a wrong assumption loses money or makes the contract useless. Each with the assumption you made so the walk can continue without waiting.
