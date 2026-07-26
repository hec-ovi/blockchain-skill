#!/usr/bin/env bash
# Bootstrap the agent-wallet toolkit: install or update the CLI, put it on PATH, verify it.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hec-ovi/blockchain-skill/HEAD/bin/init.sh | bash
#   bash bin/init.sh            (from an existing clone)
# Env: AGENT_WALLET_SRC overrides the install dir, AGENT_WALLET_SKIP_LINK=1 skips npm link.
set -euo pipefail

REPO="https://github.com/hec-ovi/blockchain-skill"
DEST="${AGENT_WALLET_SRC:-$HOME/.local/share/agent-wallet}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "init failed: '$1' is required but not on PATH" >&2; exit 1; }; }
need node
need npm
need git

node -e 'const v=process.versions.node.split(".").map(Number); if (v[0]<22||(v[0]===22&&v[1]<18)) { console.error("init failed: Node >= 22.18 required, found "+process.versions.node); process.exit(1) }'

if [ -d "$DEST/.git" ]; then
  git -C "$DEST" pull --ff-only --quiet || echo "note: could not fast-forward $DEST; using it as-is"
else
  git clone --depth 1 "$REPO" "$DEST"
fi

cd "$DEST"
npm install --no-audit --no-fund --loglevel=error

ON_PATH=0
if [ "${AGENT_WALLET_SKIP_LINK:-0}" != "1" ]; then
  if npm link --loglevel=error >/dev/null 2>&1 && command -v agent-wallet >/dev/null 2>&1; then
    ON_PATH=1
  else
    echo "note: npm link failed (permissions); the CLI still works via: node $DEST/bin/agent-wallet.ts <verb>"
  fi
fi

if [ "$ON_PATH" = "1" ]; then
  agent-wallet version >/dev/null
else
  node "$DEST/bin/agent-wallet.ts" version >/dev/null
fi

# Read-only sanity check (offline: resolves from static chain data).
node "$DEST/bin/agent-wallet.ts" chain-resolve ethereum >/dev/null

echo "init ok: agent-wallet toolkit ready at $DEST"
if [ "$ON_PATH" = "1" ]; then
  echo "invoke as: agent-wallet <verb>"
else
  echo "invoke as: node $DEST/bin/agent-wallet.ts <verb>"
fi
echo "next: export AGENT_WALLET_PASSPHRASE=<your passphrase>"
