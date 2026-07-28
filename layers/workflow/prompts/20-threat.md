# Threat model: play the attacker before you play the author

Switch sides. You are not the person building this. You are someone with a lot of capital, a mempool feed, a flash loan, and a month to think about one contract that holds money. Your job in this step is to find where the money leaks, before a line of Solidity exists to defend.

Read `spec.md`. Write `threat.md`.

## 1. What is the prize

How much can this contract hold at its peak, and what is the single largest amount one transaction could move out? An attacker spends effort proportional to the prize. If the answer is "nothing, it stores a number", say that and keep this step short; the rest of the walk stays proportionate.

## 2. Trust assumptions, stated out loud

List every thing this contract has to trust, and what happens the day that trust is wrong:

- The admin key, and its holder.
- Every external contract called: a token, a router, an oracle, a callback receiver.
- The chain's ordering: your transaction is not guaranteed to land next.
- The caller's identity: `msg.sender` can be a contract, and it can be a contract written after yours.
- Any off-chain input: a signature, a merkle root, a relayed message.

Anything you cannot state a consequence for is a gap; go back and find it.

## 3. Attack surface, function by function

For each externally reachable function from the spec, ask: who may call it, what does it move, and what happens if it is called at the worst possible moment, twice, or from inside another call. Note the ones that stand out.

## 4. Walk the classes deliberately

This is the current picture of what actually breaks contracts, not the historical list. Reentrancy has dropped from first place; access control, business logic, and oracles now dominate real losses. Take each in turn and write either the concrete way it applies here, or "not applicable" with the reason.

1. **Access control.** The largest source of loss. Which function changes ownership, roles, fees, addresses, or limits, and what enforces that? A missing modifier on one setter is the whole exploit. Include the initializer: an uninitialized contract is an unowned contract. Include the constructor and any post-deploy setup window.
2. **Business logic.** The contract does exactly what it says and the rules themselves are exploitable. Can someone deposit and withdraw in the same block for profit? Is the first depositor special? Can a donation directly to the contract's balance skew a share price? Is any accounting done on a balance that anyone can inflate by sending tokens?
3. **Price and oracle.** Any price read from a pool spot balance is attacker-controlled within one transaction. Where does the price come from, how stale can it be, what happens if the feed returns zero or reverts, and is there a sanity bound?
4. **Flash loans.** Assume the attacker starts any transaction with unlimited capital that must be repaid by the end of it. Which check that uses a balance, a supply, a vote weight, or a pool ratio breaks under that assumption?
5. **Input validation.** Every parameter from outside is hostile: zero addresses, zero amounts, amounts above balances, the contract's own address, duplicate entries in an array, an array long enough to run out of gas, a token that is not the token you expected.
6. **Unchecked external calls.** Low-level `call` returns a bool that a compiler warning alone will not force you to read. Non-standard ERC-20s return nothing on success or false instead of reverting. What breaks if a transfer silently fails, or if a callback reverts on purpose to grief someone?
7. **Arithmetic and rounding.** Division truncates. Every rounding decision favors somebody: name who. Can repeated small operations round value out of the contract? Do you divide before multiplying anywhere?
8. **Reentrancy, including read-only.** Any external call, any native transfer, any ERC-721 or ERC-1155 hook, any ERC-777 token hands control to someone else mid-function. Cross-function and cross-contract reentrancy count: a view function read by another protocol while your state is half-updated is a real exploit class.
9. **Overflow and underflow.** Solidity 0.8 reverts on overflow, so this is now about `unchecked` blocks, casts that silently truncate (`uint256` to `uint128`, `int` to `uint`), and inline assembly. List every one of those you expect to need.
10. **Proxies and upgrades.** If upgradeable: who can upgrade, what stops a storage layout collision, is the implementation itself initialized, and can the upgrade path be taken over.

## 5. Ordering and the mempool

- Front-running: your transaction is visible before it lands. Which action is profitable to copy or to jump ahead of?
- Sandwiching: any swap or price-sensitive action needs a slippage bound the caller sets, not one the contract guesses.
- Back-running and liquidation races.
- Replay: is a signature bound to a nonce, a deadline, this chain id, and this contract address? A signature valid on one chain being valid on another is a live class of loss.

## 6. Denial of service and griefing

Who can make the contract stop working without profiting? Unbounded loops over a list anyone can append to, a push payment to an address that reverts, a single failing element blocking a batch, gas costs that grow with usage until a function no longer fits in a block.

## 7. The failure the human named

Take each line from "What must never happen" in `spec.md` and write the most plausible way it happens anyway. If you cannot construct one, say why the design prevents it.

## 8. Ranked list

Close with the threats ordered by expected loss, most severe first. Each row: the threat, the function it enters through, and the one design decision that would remove it. Step 30 has to answer this list, so make it specific enough to answer.
