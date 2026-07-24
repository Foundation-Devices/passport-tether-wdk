#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYOS_DIR="${1:-}"
EXPECTED_KEYOS_REVISION="425c9791007146d46355478b3ec321f2321ab226"

if [[ -z "$KEYOS_DIR" ]]; then
  echo "Usage: $0 /path/to/keyos" >&2
  exit 1
fi

KEYOS_DIR="$(cd "$KEYOS_DIR" && pwd)"
FOUNDATION_API_DIR="$(cd "$KEYOS_DIR/.." && pwd)/foundation-api"
CURRENT_REVISION="$(git -C "$KEYOS_DIR" rev-parse HEAD)"

if [[ "$CURRENT_REVISION" != "$EXPECTED_KEYOS_REVISION" ]]; then
  echo "Expected KeyOS $EXPECTED_KEYOS_REVISION, found $CURRENT_REVISION" >&2
  exit 1
fi

if ! git -C "$KEYOS_DIR" diff --quiet --ignore-space-at-eol ||
   ! git -C "$KEYOS_DIR" diff --cached --quiet ||
   [[ -n "$(git -C "$KEYOS_DIR" ls-files --others --exclude-standard)" ]]; then
    echo "KeyOS checkout must be clean before applying the integration" >&2
    exit 1
fi

if [[ ! -e "$FOUNDATION_API_DIR" ]]; then
  ln -s "$PROJECT_DIR/foundation-api" "$FOUNDATION_API_DIR"
  echo "Linked $FOUNDATION_API_DIR to this repository's shared API source"
fi

if [[ ! -f "$FOUNDATION_API_DIR/api/src/api/wdk.rs" ]]; then
  echo "Expected the WDK Foundation API source at $FOUNDATION_API_DIR" >&2
  echo "Remove an incompatible path there and rerun this script." >&2
  exit 1
fi

git -C "$KEYOS_DIR" apply --check "$PROJECT_DIR/keyos-patches/0001-tether-wdk-app.patch"
git -C "$KEYOS_DIR" apply "$PROJECT_DIR/keyos-patches/0001-tether-wdk-app.patch"
git -C "$KEYOS_DIR" apply --check "$PROJECT_DIR/keyos-patches/0002-reset-auto-lock-after-login.patch"
git -C "$KEYOS_DIR" apply "$PROJECT_DIR/keyos-patches/0002-reset-auto-lock-after-login.patch"
mkdir -p "$KEYOS_DIR/apps/gui-app-tether-wdk"
rsync -a --delete "$PROJECT_DIR/prime-app/" "$KEYOS_DIR/apps/gui-app-tether-wdk/"

echo "Applied Passport Tether WDK integration to $KEYOS_DIR"
echo "Run: cargo test -p gui-app-tether-wdk evm::tests"
echo "Run: cargo check -p quantum-link-server -p gui-app-tether-wdk"
