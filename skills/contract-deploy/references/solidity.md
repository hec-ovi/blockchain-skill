# Solidity deploy details

## Compiler

- solc-js, current 0.8.x, invoked in-process (no Foundry project needed for compile+deploy).
- Optimizer enabled, 200 runs. Output is ABI, creation bytecode, and deployed bytecode per contract.
- A source can hold several contracts; `--name`/`contractName` picks one, otherwise the last concrete contract is deployed. Interfaces and abstract contracts are skipped (`NO_DEPLOYABLE_CONTRACT` if none remain).

## Constructor arguments

- CLI: `--args "a,b,c"` (comma-separated). MCP: `constructorArgs: [a, b, c]`.
- Pass large integers (uint256) as decimal strings. Addresses as `0x..`. Booleans as `true`/`false`.
- Encoding uses the compiled ABI; a mismatch surfaces as `GAS_ESTIMATE_FAILED` (the constructor reverts) before anything is broadcast.

## Verification

`forge verify-contract` drives the verifiers. Provide a Foundry project (`foundry.toml`) whose source matches the deployed bytecode.

- `sourcify` (default): keyless, multi-chain.
- `blockscout`: keyless, needs `verifierUrl` (the instance `/api` base).
- `etherscan`: needs an API key (`learn.etherscanApiKey` or `ETHERSCAN_API_KEY`); Etherscan API v2 covers 60+ chains with one key.

`verified: true` in the result reflects the explorer's answer; `detail` is forge's output tail for debugging a failed verification.

## After deploy

The deploy result includes the ABI. Hand it to `contract-use` to call or write the new contract, or fetch it later with `contract_learn`.
