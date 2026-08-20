#!/usr/bin/env bash
# Link the Foundation SDK's vendored KeyOS sources into the app.
#
# The SDK's own templates bake an absolute SDK path into Cargo.toml, which
# cannot be committed: it differs per machine and per SDK version. Instead the
# app depends on a relative `sdk-keyos` symlink that this script points at the
# installed SDK, so Cargo.toml stays portable and the link stays ignored.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$PROJECT_DIR/prime-app"
MIN_SDK="1.0.0"

sdk_version_of() {
  sed -n 's/^version = "\(.*\)"/\1/p' "$1/manifest.toml" 2>/dev/null | head -1
}

meets_min() {
  [[ -n "$1" && "$(printf '%s\n%s\n' "$MIN_SDK" "$1" | sort -V | head -1)" == "$MIN_SDK" ]]
}

# Prefer an explicit override, then `current`, then the newest installed
# bundle. `current` is skipped when it points at an SDK older than this app
# needs, which is the state a machine is left in when a new bundle is unpacked
# but never activated.
resolve_sdk_root() {
  local candidate
  if [[ -n "${FOUNDATION_SDK_ROOT:-}" && -d "${FOUNDATION_SDK_ROOT}/lib/keyos" ]]; then
    printf '%s' "$FOUNDATION_SDK_ROOT"
    return 0
  fi
  if [[ -d "$HOME/.foundation/sdk/current/lib/keyos" ]]; then
    candidate="$(cd "$HOME/.foundation/sdk/current" && pwd -P)"
    if meets_min "$(sdk_version_of "$candidate")"; then
      printf '%s' "$candidate"
      return 0
    fi
  fi
  while read -r candidate; do
    [[ -d "$candidate/lib/keyos" ]] || continue
    if meets_min "$(sdk_version_of "$candidate")"; then
      printf '%s' "$candidate"
      return 0
    fi
  done < <(find "$HOME/.foundation/sdk" -maxdepth 1 -type d -name 'foundation-sdk-*' 2>/dev/null | sort -Vr)
  return 1
}

SDK_ROOT="$(resolve_sdk_root || true)"
if [[ -z "${SDK_ROOT:-}" ]]; then
  echo "Could not find a Foundation SDK with lib/keyos." >&2
  echo "Install the SDK, or set FOUNDATION_SDK_ROOT to an unpacked bundle." >&2
  exit 1
fi

SDK_VERSION="$(sdk_version_of "$SDK_ROOT")"
if [[ -z "$SDK_VERSION" ]]; then
  echo "No SDK manifest at $SDK_ROOT/manifest.toml; is this an unpacked SDK bundle?" >&2
  exit 1
fi
if ! meets_min "$SDK_VERSION"; then
  echo "This app needs Foundation SDK >= $MIN_SDK; found $SDK_VERSION at $SDK_ROOT." >&2
  exit 1
fi

# Link the whole lib/ directory, not lib/keyos: the SDK's KeyOS workspace
# reaches its Slint checkout as ../slint, so the shared parent has to survive
# the link or that path escapes the project.
# The link lives beside the app rather than inside it. Cargo treats path
# dependencies under a package directory as part of that package's workspace,
# which breaks the SDK crates' own `workspace = true` inheritance.
rm -f "$APP_DIR/sdk-keyos" "$APP_DIR/sdk"
ln -sfn "$SDK_ROOT/lib" "$PROJECT_DIR/.sdk"

echo "Foundation SDK $SDK_VERSION"
echo "  $SDK_ROOT"
echo "Linked $PROJECT_DIR/.sdk -> $SDK_ROOT/lib"
echo
echo "Next:"
echo "  cd prime-app && foundation build      # signed app bundle"
echo "  cd prime-app && foundation sideload   # copy and launch on a connected Prime"
