---
name: contract-deploy
description: Author, compile, deploy, and verify a Solidity smart contract from the command line, non-custodially. Use when the user wants to write and ship a contract, deploy bytecode, or verify a contract's source on an explorer. Trigger on deploy contract, write Solidity, compile, publish contract, verify contract, Sourcify, Etherscan verify, constructor. For calling an already-deployed contract use contract-use.
---

# contract-deploy

Compile with solc-js in-process, deploy through the wallet (gated, signed locally, broadcast directly), verify keyless on Sourcify.

## Compile

`agent-wallet contract-compile --source ./MyToken.sol --name MyToken`
Returns ABI and bytecode for each deployable contract. Fix any `COMPILE_FAILED` using the compiler message in `error.hint`.

## Deploy

`agent-wallet contract-deploy <chain> --source ./MyToken.sol --name MyToken --args "arg1,arg2" --wallet main --rpc <url>`

Returns the deployed `address` and the `abi` ready to call. Constructor args are comma-separated; large integers are passed as strings.

MCP: `contract_deploy {chain, source, contractName, constructorArgs, wallet}` (or `abi`+`bytecode` instead of `source`).

## Verify (optional)

Verification uses `forge` against a Foundry project directory. Sourcify (default) and Blockscout are keyless; Etherscan needs a key. If you only have a source string, deploy first, then verify from a Foundry project that contains the same source.

## Expect

- Deploys to mainnet are DENIED by default; enable the chain in config first. Testnets (Sepolia, Base Sepolia) work immediately.
- A reverting constructor is caught at gas estimation (`GAS_ESTIMATE_FAILED`) before broadcast.
- Compilation is deterministic (optimizer runs 200).

Solidity patterns, constructor encoding, and verifier options: [references/solidity.md](references/solidity.md).
