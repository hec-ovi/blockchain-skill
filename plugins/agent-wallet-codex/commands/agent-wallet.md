# /agent-wallet

Use the bundled agent-wallet skill to operate a non-custodial wallet directly on-chain (EVM and Bitcoin).

## Arguments

- `task`: what to do (create a wallet, check a balance, send, swap, bridge, deploy or use a contract).

## Workflow

1. Treat the user argument as the on-chain task.
2. Follow `skills/agent-wallet/SKILL.md`.
3. Confirm a wallet exists first (`agent-wallet wallet-list`; create or import if none).
4. If the user has not named a network, ask which one; never default to mainnet silently.
5. Drive the `agent-wallet` CLI for every operation; reads are never gated, state-changing operations pass the safety gate (mainnet is denied until allowed in `~/.agent-wallet/config.json`).
6. Report the network and the transaction hash or explorer link for every state-changing result.
