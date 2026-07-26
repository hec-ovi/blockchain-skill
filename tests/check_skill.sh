#!/usr/bin/env bash
# Local consistency checks for the skill files. Run: bash tests/check_skill.sh
set -u
cd "$(dirname "$0")/.."

fail=0
err() { echo "FAIL: $1"; fail=1; }
ok() { echo "ok: $1"; }

ROOT_SKILL=SKILL.md
COPIES=(skills/agent-wallet/SKILL.md plugins/agent-wallet/skills/agent-wallet/SKILL.md plugins/agent-wallet-codex/skills/agent-wallet/SKILL.md)
ALL=("$ROOT_SKILL" "${COPIES[@]}")

# 1. All copies are byte-identical to the root SKILL.md
for f in "${COPIES[@]}"; do
  if cmp -s "$ROOT_SKILL" "$f"; then ok "$f identical to root SKILL.md"; else err "$f differs from root SKILL.md"; fi
done

# 2. Required sections present in every skill file
SECTIONS=(
  "## Expert operating protocol"
  "## Setup (first use only)"
  "## Chain references"
  "## Verb catalog (complete)"
  "## Multi-step playbooks"
  "## Safety model"
  "## Reference: keys and storage"
  "## Reference: amounts"
  "## Reference: swap adapters"
  "## Reference: Solidity"
  "## Error playbook"
  "## Anti-patterns"
  "### Send (transfer native, ERC-20, or BTC)"
  "### Swap (same-chain token → token)"
  "### Bridge (cross-chain EVM → EVM)"
  "### Faucet (testnet self-fund)"
  "### Contracts"
)
for f in "${ALL[@]}"; do
  for s in "${SECTIONS[@]}"; do
    grep -qF "$s" "$f" || err "$f missing: $s"
  done
done
ok "section scan done"

# 3. Frontmatter sanity: name + a pushy description in every skill file
for f in "${ALL[@]}"; do
  head -4 "$f" | grep -q '^name: agent-wallet$' || err "$f frontmatter missing 'name: agent-wallet'"
  desc=$(head -4 "$f" | grep '^description: ' | head -1)
  [ -n "$desc" ] || err "$f frontmatter missing description"
  [ ${#desc} -gt 80 ] || err "$f description too short"
  echo "$desc" | grep -qi 'trigger' || err "$f description missing trigger wording"
done
ok "frontmatter scan done"

# 4. No em/en dashes in skill files and docs
for f in "${ALL[@]}" README.md docs/ARCHITECTURE.md docs/INDEX.md docs/RESEARCH.md .claude-plugin/marketplace.json; do
  if grep -qP '[\x{2013}\x{2014}]' "$f"; then err "$f contains em/en dash"; fi
done
ok "dash scan done"

# 5. Version consistency: package.json, both plugin.json files, marketplace metadata
v_pkg=$(grep -o '"version": "[^"]*"' package.json | head -1 | cut -d'"' -f4)
for pair in "claude-plugin:plugins/agent-wallet/.claude-plugin/plugin.json" "codex-plugin:plugins/agent-wallet-codex/.codex-plugin/plugin.json" "marketplace:.claude-plugin/marketplace.json"; do
  name=${pair%%:*}; file=${pair#*:}
  v=$(grep -o '"version": "[^"]*"' "$file" | head -1 | cut -d'"' -f4)
  [ "$v" = "$v_pkg" ] || err "version mismatch: $name=$v vs package.json=$v_pkg"
done
ok "version scan done (all $v_pkg)"

# 6. Load-bearing rules survive edits in every copy
for f in "${ALL[@]}"; do
  grep -qF 'never default to mainnet silently' "$f" || err "$f lost the ask-the-network rule"
  grep -qF 'Mnemonic is shown **ONCE**' "$f" || err "$f lost the mnemonic-backup rule"
  grep -qF 'It cannot be talked out of a decision' "$f" || err "$f lost the deterministic-gate rule"
  grep -qF 'Mainnet is DENIED by default' "$f" || err "$f lost the mainnet-denied default"
  grep -qF 'keystore cannot recover it without the passphrase' "$f" || err "$f lost the no-recovery rule"
  grep -qF 'Never call an unknown contract before `contract-learn`' "$f" || err "$f lost the learn-before-call rule"
  grep -qF 'agent-wallet init' "$f" || err "$f lost the init-first rule"
  grep -qF 'dist/agent-wallet.mjs' "$f" || err "$f lost the bundled CLI path"
  grep -qF 'Never brute-force' "$f" || err "$f lost the no-bruteforce passphrase rule"
  grep -qF 'Intent → verb' "$f" || err "$f lost expert intent routing"
  grep -qF 'swap-quote' "$f" || err "$f missing swap-quote"
  grep -qF 'bridge-quote' "$f" || err "$f missing bridge-quote"
  grep -qF 'faucet' "$f" || err "$f missing faucet"
  grep -qF 'Never use `swap` when the user asked to transfer' "$f" || err "$f lost send-vs-swap routing rule"
  grep -qF 'requires the **address**' "$f" || err "$f lost balance-needs-address rule"
done
ok "safety-rule scan done"

# 7. Skill pack ships the runnable launcher + bundle
[ -x agent-wallet ] || err "root agent-wallet launcher missing or not executable"
[ -x bin/agent-wallet ] || err "bin/agent-wallet launcher missing or not executable"
[ -f dist/agent-wallet.mjs ] || err "dist/agent-wallet.mjs missing (run npm run build)"
ok "launcher + bundle present"

if [ "$fail" = 0 ]; then echo "ALL CHECKS PASSED"; else echo "CHECKS FAILED"; exit 1; fi
