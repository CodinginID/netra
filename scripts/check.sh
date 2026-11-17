#!/usr/bin/env bash
# Local quality gate: lint, format and type checks (no database needed).
# These used to run first in CI and failed the whole job there; locally they
# finish in seconds. Runs automatically before every push via .githooks/pre-push.
#
#   scripts/check.sh          check only the parts (backend/ui) changed vs upstream
#   scripts/check.sh --all    check everything
#   scripts/check.sh --fix    auto-fix backend lint + formatting, then check
set -euo pipefail

root=$(git rev-parse --show-toplevel)
mode=${1:-}

changed() {
  [[ $mode == --all || $mode == --fix ]] && return 0
  local base
  base=$(git -C "$root" rev-parse --verify -q '@{upstream}' 2>/dev/null) || return 0
  git -C "$root" diff --name-only "$base" HEAD -- "$1" | grep -q .
}

if changed backend; then
  echo "▶ backend: ruff · black · mypy"
  cd "$root/backend"
  if [[ $mode == --fix ]]; then
    uv run ruff check . --fix -q || true
    uv run black -q .
  fi
  uv run ruff check .
  uv run black --check -q .
  uv run mypy app
fi

if changed ui; then
  echo "▶ ui: tsc"
  cd "$root/ui"
  node_modules/.bin/tsc --noEmit
fi

echo "✓ checks passed"
