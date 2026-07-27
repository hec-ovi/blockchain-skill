# Agent benchmark: dual noob peers on Sepolia

Live end-to-end run of **agent-wallet 0.4.2** through the **noob** agent CLI, not through a scripted harness that calls verbs for the agent. Two isolated workspaces, two wallets, natural-language prompts. All listed transactions confirmed on Ethereum Sepolia.

## Why this setup

| Piece | Choice | Why |
|---|---|---|
| Runtime | [noob](https://github.com) CLI `0.5.1` (`noob exec -p … --yolo`) | Real agent loop: load skill, resolve CLI, run verbs, parse JSON envelopes |
| Skill install | Skill pack with bundled `dist/agent-wallet.mjs` (v0.4.2) | Same path as `/skills add`; Node only, no `npm install` in the agent workspace |
| Model | **Qwen3.6-35B-A3B**, GGUF **Q8_0**, local | Small MoE (35B total, ~3B active), not a frontier cloud model. Chosen on purpose: if the skill and CLI work here, they are not only working because a giant model guessed the right flags |
| Network | Ethereum Sepolia (`11155111`) | Public testnet, real RPCs, real gas, real Uniswap pools |
| Peers | Two workspaces, two keystores | Cross-wallet sends and token transfers, not a single wallet talking to itself |

The point of the small local model is an edge case for skill quality: short skill text, explicit verbs, JSON envelopes that fail closed. A 35B-class Q8 local model has less room to invent APIs or paper over a vague skill. Success here is stronger evidence than the same path on a much larger hosted model.

**Not in this run:** Solidity authoring / deploy / write, Bitcoin, mainnet, any custodial API.

## Hardware / software (agent host)

- Local inference: `Qwen3.6-35B-A3B-uncensored-heretic-Q8_0.gguf` (~35 GiB on disk)
- Agent host: noob `0.5.1`, Node `>= 22.18` inside the agent container
- Toolkit: agent-wallet-skill **0.4.2** (bundled single-file CLI)

## Wallets (public addresses only)

| Peer | Workspace | Address |
|---|---|---|
| A | `/tmp/noob-peer-a` | `0xB8550bc8f382e3Ea8F70949Fb74352bfC69A7650` |
| B | `/tmp/noob-peer-b` | `0xD4b2375ebFfade9b6010C77e895B591FB9d5D35A` |

Keys stayed in per-workspace keystore v3 files (`AGENT_WALLET_HOME`), passphrase via each workspace `.env`. Gas was funded externally (Sepolia ETH); the toolkit does not run a faucet.

## Method

1. Install the skill pack into each noob workspace (includes `dist/agent-wallet.mjs`).
2. One wallet per peer (`wallet-create` / existing keystore).
3. Drive each peer with short English prompts, for example:
   - `send 0.00005 ETH on sepolia to <other> and wait`
   - `wrap 0.0001 ETH to WETH on sepolia and wait`
   - `swap exactly <raw-wei> of WETH … to USDC … using uniswap and wait`
   - `send 0.5 USDC token 0x1c7D… to <other> and wait`
4. Agent must resolve the CLI, run `init`, then the verb. Host-side CLI was used only for balance snapshots and tx verification after the agent claimed success.
5. On failure (e.g. gas too low mid-run), fund more Sepolia ETH and continue. No code change was required to finish the matrix below.

## Results

All rows below were executed by the local Qwen3.6-35B Q8 agent through noob, unless marked "verify" (post-check only). Explorer base: `https://sepolia.etherscan.io/tx/`.

### Session / wallet

| Step | Peer | Result |
|---|---|---|
| `init` (doctor, ready) | A, B | `ok: true` |
| `wallet-list` / `wallet-addresses` | A, B | `main` → addresses above |
| `wallet-export --out` | A | Private key file mode `0600` written in workspace |

### Read path

| Step | Peer | Result |
|---|---|---|
| `balance` native | A, B | ETH balances returned |
| `balance --token` WETH / USDC | A, B | ERC-20 balances returned |
| `fees sepolia` | A | EIP-1559 fee fields |
| `chain-check sepolia` | A | chainId match, live block |
| `tx sepolia <hash>` | A | Confirmed receipt for prior send |
| `swap-quote` WETH→USDC | B | Uniswap quote, spender set |
| `contract-learn` Sepolia WETH | B | Verified WETH metadata + ABI |

### Write path (on-chain)

| Step | From → | Detail | Tx | Block |
|---|---|---|---|---|
| ETH send | A → B | 0.00005 ETH (early peer transfer) | [`0x7aed43f3…b5530a`](https://sepolia.etherscan.io/tx/0x7aed43f3e7499f67720c0a28e5528691a64b0721bb3b39d52c9f5c7b30b5530a) | confirmed |
| ETH send | B → A | peer return | [`0x3d61715a…587a1`](https://sepolia.etherscan.io/tx/0x3d61715a35093e0ab484e9ef30e6d410afeb54e187f4cb222dbc221de95587a1) | confirmed |
| wrap | B | 0.00004 ETH → WETH | [`0xc3629daf…ad80ba`](https://sepolia.etherscan.io/tx/0xc3629daf5b7d33712851176a15036e4c76e82749a000e80ed4274325baad80ba) | 11357943 |
| ETH send (gas top-up) | A → B | 0.00005 ETH | [`0x0b069ddf…b31e00`](https://sepolia.etherscan.io/tx/0x0b069ddf45cf043d84b29f1f8a138582b3317356e4f55e4fb47fc254aab31e00) | 11357980 |
| WETH approve (swap) | B | Uniswap spender | [`0xe8572840…38ce49`](https://sepolia.etherscan.io/tx/0xe857284016b921c0262bd02e4b78d7c9d7911839c88cae8c940dfb0dbd38ce49) | 11358111 |
| **swap** Uniswap | B | 5e13 wei WETH → USDC | [`0xca646fa6…425e5dd5`](https://sepolia.etherscan.io/tx/0xca646fa63bfad96257930507c07a2445cf42b7bc71338092a511d1f8425e5dd5) | 11358113 |
| **ERC-20 send** | B → A | 0.5 USDC | [`0xe1568c00…463c92`](https://sepolia.etherscan.io/tx/0xe1568c0093cfc1992d60b7aed70024a8476c1015a0d65145269ffeec00463c92) | 11358115 |
| wrap | A | 0.0001 ETH → WETH | [`0x9cd776b2…7b95ec`](https://sepolia.etherscan.io/tx/0x9cd776b2abcdb963e1e87818ecce8ed0b1750d458aedbbe2819df590617b95ec) | 11358121 |
| ETH send | A → B | 0.00005 ETH | [`0xb0184596…252882`](https://sepolia.etherscan.io/tx/0xb01845960d24f0a22a3e8c50871fb1bc7cc2bc4863ca357760d01bcbfc252882) | 11358122 |
| **unwrap** | B | 0.00003 WETH → ETH | [`0xd15928f9…512cd3c`](https://sepolia.etherscan.io/tx/0xd15928f9055d2a80ebf153eca4e03af7ee528f2f61eb4ae4c5ca4ce26512cd3c) | 11358126 |
| ETH send | B → A | 0.00005 ETH | [`0x37239c2d…af636b`](https://sepolia.etherscan.io/tx/0x37239c2df65e2467e351be966d64aad40c833ced036f23bf9768791392af636b) | 11358127 |
| **ERC-20 send** | A → B | 0.2 USDC | [`0xb6561977…1dcdf4`](https://sepolia.etherscan.io/tx/0xb6561977b9ef9309c56230aab8a29f2e398c3dbdff3aeee9689ee644df1dcdf4) | 11358132 |

USDC (Sepolia Circle): `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`.  
WETH (Sepolia): `0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9`.

### Post-run balances (verify)

Approximate after the matrix:

| Peer | ETH | WETH | USDC |
|---|---|---|---|
| A | ~0.0198 | 0.0001 | 0.3 |
| B | ~0.0198 | 0 | ~2.15 |

## What this does and does not prove

**Proves**

- Skill pack install is enough for a local agent to operate without a second bootstrap.
- A mid-size local model (Qwen3.6-35B Q8) can follow the skill: resolve CLI, keep passphrase in `.env`, pick the right verb, pass exact amounts, wait for receipts.
- Dual-agent economics work: ETH A↔B, ERC-20 A↔B, wrap/unwrap, Uniswap quote+swap on Sepolia.
- Failures surface as JSON `ok: false` (e.g. insufficient gas); recovery was more Sepolia ETH, not a toolkit rewrite.

**Does not prove**

- Mainnet fee markets, MEV, or production swap liquidity.
- Bitcoin / signet paths in this dual-peer loop.
- Contract compile/deploy/write (explicitly out of scope for this run).
- That every model size will behave the same; larger models may need fewer retries, smaller ones may need tighter prompts.

## Reproduce (outline)

```bash
# two workspaces
mkdir -p /tmp/noob-peer-a /tmp/noob-peer-b
# install skill pack into each (noob /skills add, or copy release tree with dist/)
# fund both addresses with Sepolia ETH

NOOB_WORKSPACE=/tmp/noob-peer-a noob exec -p "Use agent-wallet only. init, then send 0.00005 ETH on sepolia to <B> and wait" --yolo
NOOB_WORKSPACE=/tmp/noob-peer-b noob exec -p "Use agent-wallet only. wrap 0.00005 ETH on sepolia and wait; swap-quote then swap WETH to USDC; send 0.5 USDC to <A> and wait" --yolo
```

Use a local model (this benchmark used Qwen3.6-35B Q8) so results stay comparable. Prefer exact amounts in prompts; leave gas headroom.

## Date

Run completed **2026-07-27** against Sepolia, agent-wallet **0.4.2**, noob **0.5.1**, model **Qwen3.6-35B-A3B Q8_0** local GGUF.
