#!/usr/bin/env bash
set -euo pipefail

KEYOS_DIR="${1:-}"

if [[ -z "$KEYOS_DIR" ]]; then
  echo "Usage: $0 /path/to/patched-keyos" >&2
  exit 1
fi

cd "$KEYOS_DIR"

if ! command -v cosign2 >/dev/null 2>&1; then
  echo "cosign2 is required to sign Passport Prime apps and firmware." >&2
  echo "Install it from KeyOS with:" >&2
  echo "  cargo install --path imports/cosign2/cosign2-bin" >&2
  exit 1
fi

if [[ ! -f cosign2.toml ]]; then
  echo "Missing $KEYOS_DIR/cosign2.toml." >&2
  echo "Generate or link an authorized Passport Prime developer-signing profile." >&2
  exit 1
fi

# Passing --app replaces KeyOS's default filesystem-app list. A boot image
# containing only Tether cannot complete normal GUI startup after PIN entry, so
# keep the valid standard and development apps alongside the POC. The Flux
# emulator payload is intentionally excluded because it is not part of the
# pinned KeyOS 1.3.0 Cargo workspace.
apps=(
  gui-app-alerts
  gui-app-authenticator
  gui-app-bitcoin
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

# build-firmware-image requires all three signed layers. Recovery cleans the
# staged filesystem-app directory, so the normal OS and app set must be built
# after recovery.
cargo xtask build-bootloader
cargo xtask build --is-recovery
cargo xtask build "${args[@]}"
cargo xtask build-firmware-image

echo "Developer firmware image:"
echo "$KEYOS_DIR/boot.img"
echo "Filesystem apps: ${#apps[@]} (including gui-app-tether-wdk)"
