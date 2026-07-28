# Deploy: the irreversible step

Everything from here touches a real chain and spends real gas. Follow `deploy.md` exactly. If any answer in it is still open, go back and close it.

## Before the transaction

Confirm out loud to the human, in one short message: the chain, the contract name, the constructor arguments, the deploying address, the estimated cost, and who owns the contract afterwards. If this is a mainnet, say the word mainnet and wait for them to confirm. A testnet deployment can go ahead if they already asked for it.

## Deploy

    agent-wallet contract-deploy <chain> --source ./contract.sol --name <ContractName> --args "arg1,arg2" --wallet <wallet>

The gate runs before signing. It is deterministic code, not a prompt, and it cannot be argued with. On `GATE_DENIED` read the reason: usually the chain is not allowed by the local policy. Fix the policy with the human's agreement, or use an allowed chain. Do not try to route around it.

Record the returned `address`, transaction hash, and `abi`. The ABI from the deploy result is the one to use for every later call.

## Post-deploy checks

Run the list from section 7 of `deploy.md`, now, before telling anyone the contract is live:

    agent-wallet contract-call <chain> <address> --fn owner --abi ./abi.json
    agent-wallet contract-call <chain> <address> --fn <getter> --args <args> --abi ./abi.json

Compare every value against `deploy.md`. A mismatch means stop and investigate, not proceed and note it.

If ownership has to move, do it now and confirm it landed:

    agent-wallet contract-write <chain> <address> --fn transferOwnership --args <newOwner> --abi ./abi.json --wallet <wallet> --wait

A two-step transfer is not done until the new owner accepts. Say clearly whether it is pending.

## Verify the source

    agent-wallet contract-verify --chain-id <id> --address <address> --project-dir <dir> --contract-path <path>

Sourcify is keyless and the default. Verification must reproduce the exact bytecode, so the compiler version, optimizer runs and EVM version must match what `docs.md` recorded. If it fails on a mismatch, the fix is to supply the right settings, never to change the source.

If verification cannot be completed, say so plainly rather than implying the source is public when it is not.

## If the deployment fails

- `INSUFFICIENT_FUNDS`: report the shortfall and what to fund. Do not retry.
- `DEPLOY_REVERTED`: the constructor reverted with real arguments. Go back to the dry run in `deploy.md` with those exact arguments and find out why. Do not retry blind; every attempt costs gas.
- `CONFIRM_TIMEOUT`: the transaction may still land. Check with `agent-wallet tx <chain> <hash>` before doing anything else. Deploying again after a timeout can leave two contracts and a confused human.

## Mainnet

A mainnet deployment is a separate decision from a testnet one, made by the human, after they have seen the testnet address working. Never roll one into the other, and never treat a testnet success as authorization for mainnet.
