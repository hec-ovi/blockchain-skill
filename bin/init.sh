#!/usr/bin/env bash
# Host bootstrap for the agent-wallet CLI (optional; agent skill packs already ship dist/).
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
npm run build --loglevel=error

ON_PATH=0
if [ "${AGENT_WALLET_SKIP_LINK:-0}" != "1" ]; then
  if npm link --loglevel=error >/dev/null 2>&1 && command -v agent-wallet >/dev/null 2>&1; then
    ON_PATH=1
  else
    echo "note: npm link failed (permissions); invoke via: $DEST/agent-wallet <verb>"
  fi
fi

if [ "$ON_PATH" = "1" ]; then
  agent-wallet version >/dev/null
  agent-wallet init >/dev/null
else
  "$DEST/agent-wallet" version >/dev/null
  "$DEST/agent-wallet" init >/dev/null
fi

echo "init ok: agent-wallet toolkit ready at $DEST"
if [ "$ON_PATH" = "1" ]; then
  echo "invoke as: agent-wallet <verb>"
else
  echo "invoke as: $DEST/agent-wallet <verb>"
  echo "        or: node $DEST/dist/agent-wallet.mjs <verb>"
fi
echo "next: export AGENT_WALLET_PASSPHRASE=<your passphrase> && agent-wallet init"
