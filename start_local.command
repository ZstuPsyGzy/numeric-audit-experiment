#!/bin/zsh
set -e

cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  NODE_BIN="/Users/gzy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi

if [[ ! -x "$NODE_BIN" ]]; then
  echo "Node.js 24 or newer is required."
  exit 1
fi

export ADMIN_TOKEN="${ADMIN_TOKEN:-local-development-only}"
export SUBJECT_CODE_SALT="${SUBJECT_CODE_SALT:-local-development-salt}"
export HOST="${EXPERIMENT_HOST:-127.0.0.1}"
export PORT="${PORT:-8780}"

echo "Open http://${HOST}:${PORT}/?mode=pilot for the short demo."
echo "Open http://${HOST}:${PORT}/ for the 300-trial formal plan."
exec "$NODE_BIN" server.mjs
