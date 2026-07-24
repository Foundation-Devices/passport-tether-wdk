#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYOS_DIR="${1:-"$PROJECT_DIR/../KeyOS"}"
KEYOS_REVISION="425c9791007146d46355478b3ec321f2321ab226"
KEYOS_REPOSITORY="https://github.com/Foundation-Devices/KeyOS.git"

if [[ -e "$KEYOS_DIR" ]]; then
  echo "Refusing to replace existing path: $KEYOS_DIR" >&2
  echo "Pass a new destination or run apply_keyos_integration.sh on a clean checkout." >&2
  exit 1
fi

mkdir -p "$KEYOS_DIR"
git -C "$KEYOS_DIR" init
git -C "$KEYOS_DIR" remote add origin "$KEYOS_REPOSITORY"
git -C "$KEYOS_DIR" fetch --depth 1 origin "$KEYOS_REVISION"
git -C "$KEYOS_DIR" checkout --detach FETCH_HEAD

bash "$PROJECT_DIR/scripts/apply_keyos_integration.sh" "$KEYOS_DIR"

echo
echo "KeyOS $KEYOS_REVISION is ready at $KEYOS_DIR"
echo "Verify with: bash $PROJECT_DIR/scripts/verify_keyos_integration.sh $KEYOS_DIR"
