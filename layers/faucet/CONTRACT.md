# faucet

contractVersion: 1.0.0

## Purpose

Loads free test credits into a wallet address on a public testnet, headlessly, so an agent can self-fund gas without a human, browser, or captcha.

## Inputs

- faucet: [schema/faucet-input.json](schema/faucet-input.json). `{address, network, token?}`. Network is a CDP testnet (base-sepolia, ethereum-sepolia, ethereum-hoodi, plus aliases). Token defaults to `eth`.

## Outputs

Wrapped in the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)).

- faucet drip: [schema/faucet-output.json](schema/faucet-output.json). Postcondition: `transactionHash` is a real on-chain funding tx, and `explorer` is a clickable block-explorer link to it.

## Events

None.

## Errors

`FAUCET_KEY_MISSING`, `FAUCET_NETWORK_UNSUPPORTED`, `ADDRESS_INVALID`, `FAUCET_FAILED`.

## Dependencies

`core` (config). External: Coinbase CDP faucet API via `@coinbase/cdp-sdk` (lazy-loaded).

## Invariants

- Testnet only: this never touches mainnet, and it moves funds INTO the wallet, so it is not gated.
- Needs only the free CDP API key (`CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`, or the `faucet` config section). No CDP wallet secret is required for the faucet endpoint.
- Per-address daily drip limits apply (CDP: eth 0.0001/req, 0.1/day). To accumulate, call repeatedly with a short delay.

## How to modify this blackbox safely

Additional faucet providers (e.g. Circle, which also drips USDC across more L2s) are new modules alongside `cdp.ts` behind the same `faucet()` entry (additive). Keep it testnet-only and ungated. Live behavior is verified behind a `CDP_API_KEY_ID` gate; the no-key path is unit-tested to fail closed with a steering hint.
