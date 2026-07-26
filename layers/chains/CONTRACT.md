# chains

contractVersion: 1.0.0

## Purpose

Resolves any chain reference (name, alias, numeric id, Bitcoin network) to endpoints and metadata, and probes that those endpoints actually serve that chain.

## Inputs

- chainResolve / chainCheck take a chain ref: string or number. Not schema-bound (free-form by design); validation is the resolution itself, which fails closed with `CHAIN_UNKNOWN`.

## Outputs

All wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- Chain info: [schema/chain-info-output.json](schema/chain-info-output.json). Postconditions: EVM `rpcUrls` contain only keyless http(s) URLs (no `${API_KEY}` templates, no websockets); Bitcoin networks are the builtin three (bitcoin, signet, testnet=testnet4).
- Chain check: [schema/chain-check-output.json](schema/chain-check-output.json). Postcondition: `match` compares the RPC's reported `eth_chainId` to the resolved id (guards against a wrong or lying endpoint).

Process-internal (for read/sign/send layers, never over the CLI): `toViemChain`, `evmClient` (ranked fallback transport), `esploraGet`.

## Events

None.

## Errors

`CHAIN_UNKNOWN`, `CHAIN_NO_RPC`, `REGISTRY_UNAVAILABLE`, `ESPLORA_UNAVAILABLE`.

## Dependencies

`core`. Data sources: viem/chains (in-process, wins), chainid.network/chains.json (fallback, cached 7 days at `$AGENT_WALLET_HOME/cache/chains.json`), builtin Bitcoin table (Esplora: mempool.space first, blockstream.info second).

## Invariants

- Resolution order is deterministic: btc names, then aliases/viem, then registry. Same ref always resolves to the same chain id.
- Network access happens only in `chainCheck` and on registry cache miss; `resolveChain` of viem-known chains is offline.
- Every fetch function is injectable; unit tests never touch the network.

## How to modify this blackbox safely

New chain families: add a new info variant to `src/contract.ts` (additive union member, minor bump), a builtin table, and a probe. Never repurpose an existing alias. Registry cache format changes need a cache-file version bump (rename the file). Run `npm run schemas`; keep the no-network property of unit tests.
