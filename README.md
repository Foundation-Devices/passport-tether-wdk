# Passport Prime × Tether WDK

A testnet-only proof of concept that showcases Tether WDK through a
Tether-branded Android wallet while Passport Prime holds the account key,
reviews every transfer, and signs over encrypted Bluetooth with QuantumLink.

The phone owns the wallet experience, queries Ethereum Sepolia and Bitcoin
Testnet, builds and broadcasts transactions with WDK, and displays balances
and activity. Passport Prime derives the app-specific EVM and BIP-84 Bitcoin
keys, independently parses each transaction, enforces policy, shows the
authoritative review, and signs only after an approval gesture.

> [!WARNING]
> This is unaudited proof-of-concept software for Ethereum Sepolia and Bitcoin
> Testnet only. The Android APK and Prime app use development signatures. Do
> not send mainnet assets, real USD₮, real BTC, or production secrets to this
> software.

## Compatibility

The current integration is pinned, built, and tested against:

| Component | Supported version |
| --- | --- |
| Passport Prime / KeyOS SDK | KeyOS `v1.3.0` (`425c979…`) |
| Tether WDK EVM wallet | `@tetherto/wdk-wallet-evm@1.0.0-beta.16` |
| Tether WDK Bitcoin wallet | `@tetherto/wdk-wallet-btc@1.0.0-beta.11` |
| Tether WDK React Native UI kit | `@tetherto/wdk-uikit-react-native@1.0.0-beta.2` |
| Android application | Expo 54 / React Native 0.81, arm64 |
| Networks | Ethereum Sepolia and Bitcoin Testnet |

The exact reviewed upstream revisions are in
[`SOURCE_PINS.md`](SOURCE_PINS.md). The integration scripts refuse a different
KeyOS revision so SDK drift cannot silently produce an unreviewed build.

## What works

- Production-style Tether Wallet Android home, transactions, Receive Funds
  tabs, grouped asset/network sheets, send, and Passport connection menu.
- Prime onboarding, wallet creation/recovery education, address display,
  transaction review, approval, success, and connection management.
- Static Bluetooth QR followed by animated identity QR pairing.
- QuantumLink over BLE with authenticated GSTP sessions, BTP framing, replay
  protection, peer identity pinning, reconnect, cancellation, and two-sided
  unpairing.
- Direct WDK external-signer integration. The phone has no wallet seed and the
  signer exposes no private key.
- App-specific Prime derivation at `m/44'/60'/0'/0/0` for EVM and
  `m/84'/1'/0'/0/0` for Bitcoin Testnet.
- Sepolia ETH and allowlisted test USD₮ balances, receives, transfers, fees,
  broadcasts, confirmations, and automatic balance refresh.
- Bitcoin Testnet balance, receive, WDK coin selection/fees, PSBT transport,
  Passport review/signing, broadcast, and activity.
- Truthful BTC, USD₮, USA₮, and XAU₮ catalog parity. USA₮ and XAU₮ remain
  visible but disabled because Tether has not published official public test
  deployments for them.
- Prime-side policy checks for chain, destination, calldata, fees, value,
  transaction type, and request replay.

## Repository layout

| Path | Purpose |
| --- | --- |
| [`mobile/`](mobile/) | Expo/React Native Android companion and native QuantumLink module |
| [`prime-app/`](prime-app/) | Rust/Slint `gui-app-tether-wdk` source |
| [`foundation-api/`](foundation-api/) | Shared versioned QuantumLink WDK messages |
| [`keyos-patches/`](keyos-patches/) | KeyOS workspace, launcher, and server integration |
| [`scripts/`](scripts/) | Reproducible setup, verification, and build commands |
| [`docs/`](docs/) | Architecture, protocol, security, validation, and demo runbook |
| [`third_party/`](third_party/) | Android compatibility patch for QuantumLink cryptography |

`artifacts/`, generated Expo native projects, Rust targets, signing material,
and local environment files are intentionally ignored.

## Clone and verify

### Prerequisites

- macOS or Linux with Git and standard build tools
- Node.js 22 and npm
- Java 21
- Android SDK 36, NDK 27, and an arm64 Android device for BLE testing
- Rust plus `aarch64-linux-android`
- `cargo-ndk` and the UniFFI tooling used by the native module

KeyOS carries its own pinned Rust toolchain, which Rustup selects when commands
run from inside its checkout.

### 1. Clone

```bash
git clone git@github.com:Foundation-Devices/passport-tether-wdk.git
cd passport-tether-wdk
```

Agents should also read [`AGENTS.md`](AGENTS.md) before making changes.

### 2. Verify the Android companion

```bash
cd mobile
npm ci
npm run typecheck
npm run test:unit
npm run lint
cd ..
```

Expo Go cannot load the custom QuantumLink module. Use a native development or
release build.

### 3. Prepare and verify KeyOS

The setup script creates an exact detached checkout beside this repository,
links the included shared API source, applies the reviewed patches, and copies
the Prime app into the KeyOS workspace:

```bash
bash scripts/setup_keyos.sh ../KeyOS
bash scripts/verify_keyos_integration.sh ../KeyOS
```

To use an existing checkout instead, it must be clean and at the exact revision:

```bash
git -C ../KeyOS checkout --detach 425c9791007146d46355478b3ec321f2321ab226
bash scripts/apply_keyos_integration.sh ../KeyOS
bash scripts/verify_keyos_integration.sh ../KeyOS
```

The resulting workspace is:

```text
workspace/
├── passport-tether-wdk/
│   ├── mobile/
│   ├── prime-app/
│   └── foundation-api/
├── KeyOS/
└── foundation-api -> passport-tether-wdk/foundation-api/
```

## Build the Android APK

From the repository root:

```bash
cd mobile
npm run build:android:release
```

This runs type checking, unit tests, lint, the Rust/UniFFI native build, Expo
prebuild, and Gradle release assembly. It writes ignored local artifacts to:

```text
artifacts/tether-wdk-passport-arm64-poc.apk
artifacts/tether-wdk-passport-arm64-poc.apk.sha256
```

The POC APK is arm64-only and development-signed. Production distribution
requires an organization-controlled keystore, supply-chain provenance,
dependency review, audit, and a release process.

For iterative Android development:

```bash
cd mobile
npm ci
bash modules/quantumlink/rebuild_so.sh
npx expo run:android
```

Copy `mobile/.env.example` to `mobile/.env` only if an RPC override is needed.
Never commit that file.

The companion uses `https://mempool.space/testnet/api` for Bitcoin Testnet by
default. Override it with `EXPO_PUBLIC_BITCOIN_TESTNET_API` when using another
Esplora-compatible testnet service.

## Build the Passport Prime app

For a hosted simulator bundle:

```bash
bash scripts/build_prime_app.sh ../KeyOS
```

For the production ARM target without signing:

```bash
cd ../KeyOS
CARGO_PROFILE_RELEASE_INCREMENTAL=false \
RUSTFLAGS='--cfg keyos -C relocation-model=pic -C link-arg=-pie' \
  cargo build --profile release \
  --target armv7a-unknown-xous-elf \
  --package gui-app-tether-wdk
```

Output:

```text
../KeyOS/target/armv7a-unknown-xous-elf/release/gui-app-tether-wdk
```

For a complete developer firmware image:

```bash
bash scripts/build_prime_firmware.sh ../KeyOS
```

This requires `cosign2`, an authorized developer private key, and a
`../KeyOS/cosign2.toml` signing profile. The script builds the bootloader and
recovery image first, then stages the 16 valid KeyOS 1.3.0 filesystem apps
(including Tether Wallet) before creating `../KeyOS/boot.img`. Recovery must be
built before the normal app set because the recovery build clears the staged
filesystem-app directory.

Do not build a boot image from a single `--app gui-app-tether-wdk` invocation:
that replaces KeyOS's standard filesystem app set and can leave the launcher
without the apps required after PIN entry. Do not add
`gui-app-emu-flux-server` to the KeyOS 1.3.0 build: it is not a member of the
pinned Cargo workspace. App and firmware signing require
Foundation-controlled developer credentials; the repository never contains
the signing profile or private key.

To flash an attached developer unit already in SAM-BA mode:

```bash
cd ../KeyOS
cargo build --release --package passport-drive
target/release/passport-drive samba flash boot.img
```

The flasher verifies the written bytes by default. Do not use `--no-verify` for
a distributable or hardware-test image.

## Run the POC

1. Install the Android APK on an arm64 handset.
2. Install the developer-signed Tether WDK app or complete developer firmware
   on a Passport Prime running KeyOS 1.3.0.
3. Open Tether Wallet on Passport Prime and complete its wallet onboarding.
4. In the Android app, choose Passport, grant camera/Bluetooth permissions, and
   scan the static QR.
5. Scan the animated identity QR shown by Passport Prime.
6. Fund the displayed EVM address with Sepolia ETH for gas and test USD₮, or
   fund the Bitcoin address with Bitcoin Testnet coins.
7. Create an ETH, USD₮, or BTC test transfer on Android, review the exact details on Passport Prime,
   slide to approve, and wait for the phone to broadcast and refresh.

The current allowlisted test USD₮ contract and RPC defaults are documented in
[`mobile/README.md`](mobile/README.md). A complete demo script is in
[`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md).

## Architecture and security

```text
Android UI + WDK EVM/BTC
        │ canonical EIP-1559 request or PSBT
        │ authenticated QuantumLink over BLE
        ▼
Passport Prime policy + review + app-specific keys
        │ signed EIP-1559 or finalized Bitcoin transaction
        ▼
Android verifies exact transaction, then broadcasts to its testnet
```

The phone is intentionally treated as untrusted transaction input. Passport
Prime re-parses and validates every security-relevant field before presenting
the review. The Android app verifies that the returned signed transaction
matches the request and recovers to the Passport-derived address before
broadcasting.

Read:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/PROTOCOL.md`](docs/PROTOCOL.md)
- [`docs/SECURITY.md`](docs/SECURITY.md)
- [`docs/VALIDATION.md`](docs/VALIDATION.md)
- [`docs/ENVOY_ANDROID_BLE_BENCHMARK.md`](docs/ENVOY_ANDROID_BLE_BENCHMARK.md)
- [`docs/TETHER_WALLET_PARITY.md`](docs/TETHER_WALLET_PARITY.md)

## Current limitations

- Ethereum Sepolia and Bitcoin Testnet only; no production network support.
- USA₮, XAU₮, Plasma, Polygon, Arbitrum, and Tron are catalog references, not
  enabled transaction routes.
- Android only; no iOS QuantumLink module.
- Developer-signed artifacts only.
- No security audit or production recovery ceremony.
- The WDK packages are pre-release beta versions and deliberately pinned.
- Hardware regression remains required after changes to BLE, pairing, signing,
  app lifecycle, or KeyOS integration.

## Component licensing

The mobile fork retains its upstream license in
[`mobile/LICENSE`](mobile/LICENSE). KeyOS-derived patches and the Prime app
retain their source-file licensing. No broader production-use grant or Tether
brand authorization is implied by this POC.
