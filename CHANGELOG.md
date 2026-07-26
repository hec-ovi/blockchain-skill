# Changelog

## 0.3.1

- Send layer offline tests: mainnet gate denial, invalid amount/address, wrong passphrase, full signet transfer with mocked Esplora.
- Import-boundary test: cross-layer imports must hit published modules only.
- Architecture doc states the real isolation model (published TypeScript surfaces + envelope CLI, not process blackboxes) and includes the faucet layer.
- MIT LICENSE; skill guidance from live noob e2e (durable passphrase, no keystore brute-force, balance needs an address).

## 0.3.0

- Self-contained CLI bundle `dist/agent-wallet.mjs` for plug-and-play skill packs.
- Session `init` doctor verb.
- Skill-root and `bin/agent-wallet` launchers; Node-only runtime after skill install.
- Skill install primary path: `/skills add hec-ovi/blockchain-skill`.

## 0.2.0

- Dropped MCP face; CLI + skills only.
- Faucet layer (CDP); live verification on public testnets.
