#!/usr/bin/env bash
set -euo pipefail

KEYOS_DIR="${1:-}"

if [[ -z "$KEYOS_DIR" ]]; then
  echo "Usage: $0 /path/to/patched-keyos" >&2
  exit 1
fi

cd "$KEYOS_DIR"
cargo fmt --all -- --check
cargo test -p gui-app-tether-wdk
cargo test -p quantum-link-server
cargo check -p quantum-link-server -p gui-app-tether-wdk

echo "KeyOS integration checks passed"
