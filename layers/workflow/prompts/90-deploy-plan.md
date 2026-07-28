# Deployment plan: decide everything before you spend anything

Deployment is the one irreversible step. Write `deploy.md` and get every answer down before the next step touches a network.

## 1. Which chain, and who said so

Name the chain. If the human has not chosen one, ask now. Never default to a mainnet silently, and never assume a testnet either: a contract deployed to the wrong network is a contract someone will find and use.

Confirm it is alive before you rely on it:

    agent-wallet chain-resolve <chain>
    agent-wallet chain-check <chain>

Testnet first is the rule. Deploy to the testnet, exercise it there, and only then propose the mainnet deployment as a separate decision the human makes with the testnet address in front of them.

## 2. Constructor arguments, exactly

Every argument, its final value, and where the value came from. Addresses in full, checksummed. Amounts in base units with the decimal conversion shown. An argument you are guessing is an argument to ask about.

Constructor arguments are permanent. An immutable set to the wrong address is a redeploy.

## 3. Who owns it, one minute after deployment

- Which address is the owner or admin at the end of the constructor.
- Whether ownership moves after deployment, to what, and by which call.
- If it stays with a deploying EOA, say so plainly here, because it will be in the handoff and the human should see it before rather than after.

## 4. The dry run

Run the deployment against the sandbox with the exact constructor arguments you are about to use on chain, on the same hardfork the target chain runs. Add a plan that deploys with the real arguments and calls the post-deploy sequence from step 3 in order:

    agent-wallet sandbox-run --plan ./deploy-dryrun.json

This catches a constructor that reverts on a real argument, an ownership transfer that fails, and a size that is over the limit, all for free. A constructor revert on a real chain costs the gas and gives you nothing back.

## 5. Funding and cost

- The deployer address: `agent-wallet wallet-addresses --name <wallet> --family evm`.
- Its balance: `agent-wallet balance <chain> <address>`.
- Current fees: `agent-wallet fees <chain>`.
- Deploy gas from `sandbox.json`, multiplied out to a cost in the chain's currency, plus the post-deploy calls, plus headroom.

If the balance does not cover it, stop and tell the human what to fund and by how much. This toolkit does not source gas.

## 6. Verification

Plan to verify the source so the code is publicly readable at the address. Sourcify is keyless; Etherscan needs a key. Record the exact compiler version, optimizer setting and EVM version from `docs.md`, because verification reproduces the bytecode and will fail on a mismatch.

## 7. Post-deploy checks

The list you will run immediately after deployment, before telling anyone it is live:

- Read back every constructor-set value and compare it to section 2.
- Confirm the owner is who section 3 says.
- Call one read function and check the answer.
- Run one harmless write and confirm the event.
- Confirm on the explorer that the deployed bytecode matches.

## 8. Rollback

There is no rollback for a deployed contract. So write what happens if something is wrong: is there a pause, can funds be recovered, does the answer amount to "deploy a new one and tell users to move". If it is the last one, the human should know that before, not after.
