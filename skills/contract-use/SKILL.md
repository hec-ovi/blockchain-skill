---
name: contract-use
description: Read, call, write, and learn about an already-deployed smart contract. Use to fetch a contract's ABI or verified source, call a read-only function, send a state-changing transaction to a contract, or check whether a contract is verified. Trigger on call contract, read contract, contract function, interact with contract, ABI, is this contract verified, what does this contract do, proxy implementation. For deploying a new contract use contract-deploy.
---

# contract-use

## Learn what a contract is

`agent-wallet contract-learn <chain> <address>`

Returns the ABI, verified source, compiler, and proxy target. Keyless-first (Sourcify, then Blockscout); for an unverified contract it guesses an ABI from bytecode (`source: whatsabi`, `verified: false`). Add `--verified-only` to fail instead of guessing. Use this before calling an unknown contract to get its ABI and to check `verified`.

## Call (read-only)

`agent-wallet contract-call <chain> <address> --fn balanceOf --args 0xHOLDER --abi ./abi.json`

No transaction, no gas. Returns the decoded result (bigints as strings). `FUNCTION_NOT_FOUND` lists the available functions.

## Write (state-changing)

`agent-wallet contract-write <chain> <address> --fn transfer --args "0xTO,1000" --abi ./abi.json --wallet main --wait`

Gated, signed locally, broadcast. View/pure functions are rejected (`NOT_WRITABLE`, use call). `--value <wei>` attaches native value to a payable call.

MCP: `contract_call` / `contract_write` with `{chain, address, abi, function, args}`.

## Expect

- Get the ABI from `contract-learn` or from a `contract-deploy` result, then pass it to call/write.
- Writes to mainnet are DENIED by default; enable the chain in config first.
- A reverting call returns `CALL_REVERTED`; a reverting write is caught at gas estimation before broadcast.
