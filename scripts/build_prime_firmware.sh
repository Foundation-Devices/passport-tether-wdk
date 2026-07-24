#!/usr/bin/env bash
set -euo pipefail

KEYOS_DIR="${1:-}"

if [[ -z "$KEYOS_DIR" ]]; then
  echo "Usage: $0 /path/to/patched-keyos" >&2
  exit 1
fi

cd "$KEYOS_DIR"

# Passing --app replaces KeyOS's default filesystem-app list. A boot image
# containing only Tether cannot complete normal GUI startup after PIN entry, so
# keep the standard and development apps alongside the POC.
apps=(
  gui-app-alerts
  gui-app-authenticator
  gui-app-bitcoin
  gui-app-emu-flux-server
  gui-app-file-browser
  gui-app-onboarding
  gui-app-qr-scanner
  gui-app-security-keys
  gui-app-seed-vault
  gui-app-settings
  gui-app-crypto-perf
  gui-app-file-picker-test
  gui-app-image-viewer
  gui-app-playground
  gui-app-system-actions
  gui-app-update-test
  gui-app-tether-wdk
)

args=()
for app in "${apps[@]}"; do
  args+=(--app "$app")
done

cargo xtask build "${args[@]}"
cargo xtask build-firmware-image

echo "Developer firmware image:"
echo "$KEYOS_DIR/boot.img"
