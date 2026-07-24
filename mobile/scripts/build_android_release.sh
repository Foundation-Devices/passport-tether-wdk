#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$PROJECT_DIR/../artifacts"
ANDROID_PROJECT="$PROJECT_DIR/android"
TASK_ANDROID_SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}}"
if [[ -n "${JAVA_HOME:-}" ]]; then
  TASK_JAVA_HOME="$JAVA_HOME"
elif [[ -d /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ]]; then
  TASK_JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
else
  TASK_JAVA_HOME="$(/usr/libexec/java_home -v 21)"
fi

if [[ ! -d "$TASK_ANDROID_SDK" ]]; then
  echo "Android SDK not found at $TASK_ANDROID_SDK" >&2
  exit 1
fi

if [[ ! -x "$TASK_JAVA_HOME/bin/java" ]]; then
  echo "Java 21 not found at $TASK_JAVA_HOME" >&2
  exit 1
fi

cd "$PROJECT_DIR"
npm run typecheck
npm run test:unit
npm run lint
bash ./modules/quantumlink/rebuild_so.sh
NODE_ENV=production npx expo prebuild --platform android --clean
printf 'sdk.dir=%s\n' "$TASK_ANDROID_SDK" > "$ANDROID_PROJECT/local.properties"

cd "$ANDROID_PROJECT"
NODE_ENV=production JAVA_HOME="$TASK_JAVA_HOME" ./gradlew :app:assembleRelease

mkdir -p "$ARTIFACT_DIR"
cp "$ANDROID_PROJECT/app/build/outputs/apk/release/app-release.apk" \
  "$ARTIFACT_DIR/tether-wdk-passport-arm64-poc.apk"
(
  cd "$ARTIFACT_DIR"
  shasum -a 256 tether-wdk-passport-arm64-poc.apk \
    > tether-wdk-passport-arm64-poc.apk.sha256
)

echo "Built $ARTIFACT_DIR/tether-wdk-passport-arm64-poc.apk"
