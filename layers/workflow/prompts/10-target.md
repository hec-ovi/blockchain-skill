# Target: get the real code

You are reviewing a contract you did not write. Before any judgement, get the actual code and establish what you are looking at. Write `target.md`.

## 1. Where the code came from

One of these:

- **An address on a chain.** Fetch it:

      agent-wallet contract-learn <chain> <address>

  Read `verified`. Verified means the source published on an explorer matches the deployed bytecode, so the source you are reading is the code that runs. Unverified means you have an ABI recovered from bytecode and no source: say so at the top of your report and treat everything downstream as lower confidence.

  Check `proxy`. If it is a proxy, the logic lives at the implementation address and you must fetch that too. Auditing the proxy shell and calling it an audit of the protocol is a real and common mistake. Record both addresses.

- **Source handed to you.** Save it into the WORK DIR. If it is meant to match something deployed, note whether you can confirm that; if you cannot, the review covers the source, not the deployment.

## 2. What it claims to be

Whatever documentation exists: a README, comments, the human's description, a standard it says it implements. Write down the claim. Half of a good review is checking the code against what it promises.

## 3. Compile it yourself

    agent-wallet contract-compile --source ./contract.sol --name <ContractName>

If it does not compile, the source is incomplete: missing imports, a different compiler version, a dependency you were not given. Get the rest before continuing. Reviewing a fragment produces findings that are wrong in both directions.

Note the compiler version it needs. A contract pinned to an old compiler carries that compiler's known bugs, and that is a finding on its own.

## 4. Scope and blast radius

- How much value does it hold now, and how much could it hold.
- How many addresses have interacted with it.
- What other contracts depend on it, and what it depends on.
- Whether it is upgradeable, and who holds that power.
- Which chains it is deployed on. The same source on two chains can behave differently.

## 5. What this review will and will not cover

Say it now so the report cannot overclaim later: which files, which addresses, which version, and what you did not look at. If the contract calls out into a protocol you are not reviewing, that boundary belongs here.
