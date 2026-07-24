#!/usr/bin/env bash
set -euo pipefail

KEYOS_DIR="${1:-}"

if [[ -z "$KEYOS_DIR" ]]; then
  echo "Usage: $0 /path/to/patched-keyos" >&2
  exit 1
fi

cd "$KEYOS_DIR"
cargo xtask build --hosted --dont-sign --ci --app gui-app-tether-wdk

echo "Hosted app bundle:"
echo "$KEYOS_DIR/target/hosted/keyos/apps/gui-app-tether-wdk"
echo
echo "For a complete developer firmware image, run:"
echo "bash scripts/build_prime_firmware.sh /absolute/path/to/patched-keyos"
echo
echo "Do not package a full boot image after a single-app --app build:"
echo "that replaces KeyOS's standard filesystem-app set."
