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

## A note on naming

Both applications present to the user as **Tether Wallet**. "WDK" survives
throughout the code as identifiers — the `gui-app-tether-wdk` crate, the
Android package `com.foundationdevices.tetherwdkpassport`, the `Wdk*`
QuantumLink message types, and the stored-preference keys. Those are
deliberately frozen: the Prime `appId` seeds `GetAppSeed`, so renaming it
derives a different wallet and orphans any funded account, and changing the
Android package or storage keys discards a user's pairing and history.

Note also that WDK itself runs only on the phone. The Prime app shares no code
with it and re-implements transaction parsing independently, which is what
makes its review screen a second opinion rather than an echo.

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
| [`prime-app/`](prime-app/) | Standalone Foundation SDK app (Rust/Slint) |
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
- The `arm-none-eabi` GNU toolchain on `PATH`, for Prime firmware builds.
  KeyOS pins `CC` for the Xous target but not `AR`, so
  `scripts/build_prime_firmware.sh` pins `AR_armv7a_unknown_xous_elf` itself
  and refuses to run without `arm-none-eabi-ar`. Without that pin the host
  archiver produces an empty micro-ecc archive and the recovery image fails to
  link on undefined `uECC_*` symbols.

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
Esplora-compatible testnet service. That endpoint selects the chain: `tb1`
addresses and the `m/84'/1'/0'/0/0` path are identical on testnet3 and
testnet4, so pointing it at a testnet4 host switches chains silently and
testnet3 coins stop appearing.

Transaction history is read from public indexers rather than accumulated
locally, so receives appear at all. Sepolia history comes from
`https://eth-sepolia.blockscout.com`, overridable with
`EXPO_PUBLIC_SEPOLIA_EXPLORER_API`, and Bitcoin history from the same Esplora
endpoint as balances. A refresh discloses the wallet addresses to those
services. Token history is restricted to the allowlisted test USD₮ contract so
a look-alike token cannot write entries into the list.

All overrides live in `mobile/.env.example`.

## Build the Passport Prime app

The Prime app is a standalone Foundation SDK application. It does not need a
KeyOS checkout: the SDK ships the KeyOS API crates it builds against.

Requires Foundation SDK >= 1.0.0 and Nix.

```bash
bash scripts/setup_sdk.sh          # links .sdk at the installed SDK
cd prime-app
foundation build                   # signed app bundle in target/keyos/
foundation sideload                # copy to a connected Prime and launch
```

`foundation cert gen` creates your own publisher signing identity, so no
Foundation-held key is needed. Sideloading needs the Passport unlocked and
connected over USB, with Developer Mode on and Airlock in Read/Write.

> [!IMPORTANT]
> **This does not build yet.** The app's Slint UI is written against KeyOS
> 1.3.0's internal widget set — `BasePage`, `QrCodeCard`, `AnimatedQrCode`,
> `TimerCircularProgress`, `Importance`, `Palettes` — and SDK 1.0.0 exposes a
> different component library under `@ui` (`accordion`, `button`, `card`,
> `chip`, `dialog`, ...). `BasePage` does not exist in the SDK at all, so
> `ui/app.slint` needs porting to the SDK components before `foundation build`
> completes. Everything ahead of that step — permissions, signing config,
> dependency resolution, icon and theme — is in place and verified.

The companion link to the Android app is compiled out of this build and sits
behind the `quantum-link` feature. See [`docs/QUANTUM_LINK.md`](docs/QUANTUM_LINK.md)
for why, and what has to be true to switch it back on.

### The legacy firmware path

Building a full firmware image still works and still requires a KeyOS checkout,
the reviewed patches, and Foundation-held signing credentials. It is the only
way to run the companion link today. See
[`scripts/build_prime_firmware.sh`](scripts/build_prime_firmware.sh) and the
KeyOS steps under *Clone and verify* above.

## Run the POC

1. Install the Android APK on an arm64 handset.
2. Install the developer-signed Tether Wallet app or complete developer firmware
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
