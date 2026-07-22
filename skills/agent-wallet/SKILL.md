---
name: agent-wallet
description: Operate a non-custodial blockchain wallet directly on-chain (EVM and Bitcoin), no exchange or MetaMask. Use this router when the user wants to create or import a wallet, check a balance, receive, send, swap, bridge, or author/deploy/use a smart contract. Routes to the right sub-skill. Trigger on wallet, crypto, ETH, BTC, ERC-20, token, swap, bridge, Solidity, contract, on-chain, testnet, mainnet.
---

# agent-wallet (router)

One toolkit, three faces over the same engine: a CLI (`agent-wallet <verb>`), an MCP server (tools with the same names), and these skills. Every call returns one JSON envelope `{ok, data, error, meta}`; on `ok:false` read `error.hint`, it tells you the fix.

## First, set up once

1. Install: `npx skills add hec-ovi/blockchain-skill` (skills) and register the MCP server from `.mcp.json`, or run the CLI with `npx agent-wallet <verb>`.
2. Export a passphrase for the keystore: `export AGENT_WALLET_PASSPHRASE=...` (never pass it as an MCP tool argument).
3. Safety default: mainnet is DENIED. Testnets and local chains work out of the box. To allow a mainnet, edit `~/.agent-wallet/config.json`: `{"gate":{"allowMainnet":true}}` or add the chain id to `gate.allowedChains`. See [references/safety.md](references/safety.md).

## Route to a sub-skill

- Create/import a wallet, unlock it, get a receive address -> `wallet-setup`
- Check a balance, send native coin / ERC-20 / BTC, sweep -> `wallet-send`
- Swap one token for another on an EVM chain -> `wallet-swap`
- Move assets across chains -> `wallet-bridge`
- Write, compile, deploy or verify a Solidity contract -> `contract-deploy`
- Read, call, write, or learn about a deployed contract -> `contract-use`

## Chain references

Any chain works: a name (`ethereum`, `base`, `sepolia`), a numeric id (`8453`), or a Bitcoin network (`bitcoin`, `signet`, `testnet`, `regtest`). Amounts are decimal strings in base units (wei/sats) unless a verb takes display units.

Every balance, read, send, or contract call is scoped to ONE network. The same address holds different funds on each chain. If the user has not named a network, ask which one; never default to mainnet silently. State the network in your answer.

Start every task by confirming a wallet exists (`wallet-setup`), then jump to the operation.
