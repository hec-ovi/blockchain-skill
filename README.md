# agent-wallet (blockchain-skill)

Toolkit that lets any AI agent operate a wallet directly on-chain: create wallets, receive, send, swap, bridge, sign, deploy and verify Solidity contracts, and learn how deployed contracts work. Keys are generated and stored locally (encrypted keystore v3); transactions go straight to public RPC endpoints. No MetaMask, no exchange, no custodial anything.

Ships three faces over one engine: a CLI (`agent-wallet <verb>`), an MCP server (stdio), and Claude Code skills. Same verbs, same JSON envelope everywhere.

Status: early. Architecture and stack research are done (see `docs/ARCHITECTURE.md` and `docs/RESEARCH.md`); layers are being built in order, EVM + Bitcoin first.

## Layout

- `layers/` : contract-isolated blackboxes (core, keys, chains, read, sign, gate, send, learn, contracts, swap, bridge, agentio). Each owns its CONTRACT.md, schema/, src/, tests/.
- `skills/` : router skill plus one fat sub-skill per operation.
- `docs/INDEX.md` : what you want to change, mapped to the one folder to open.

## Safety defaults

Mainnet is denied until you explicitly allow it in `~/.agent-wallet/config.json`. Every state-changing operation passes a deterministic gate (chain allowlist, spend caps) before anything is signed.

Requires Node >= 22.18. Tests: `npm test`.
