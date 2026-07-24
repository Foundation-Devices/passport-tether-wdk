# Tether WDK for Passport Android app

This Expo/React Native application is a focused fork of Tether's WDK starter. It
demonstrates WDK through a Tether-branded Sepolia wallet whose only EVM signer
is Passport Prime.

The application supports:

- onboarding and two-stage QuantumLink pairing;
- live Sepolia ETH and USD₮ balances;
- receive address and QR;
- ETH and allowlisted USD₮ send flows;
- WDK fee quote, transaction construction, signing, broadcast, and status;
- activity, reconnect, cancel, unpair, and settings.

Seed creation/import/reveal routes and unsupported chains are removed. The
external signer intentionally returns `privateKey: null`, and message, EIP-712,
EIP-7702, contract-creation, blob, and access-list signing fail closed.

## Configuration

The default Sepolia RPC is:

```text
https://ethereum-sepolia-rpc.publicnode.com
```

Override it for development by setting:

```bash
EXPO_PUBLIC_SEPOLIA_RPC_URL=https://your-sepolia-rpc.example
```

The allowlisted test USD₮ contract is:

```text
0xd077a400968890eacc75cdc901f0356c943e4fdb
```

## Develop

Prerequisites: Node.js 22, Java 21, Android SDK/NDK 27, Rust with the
`aarch64-linux-android` target, `cargo-ndk`, and a physical arm64 Android device
for BLE.

```bash
npm ci
npm run typecheck
npm run test:unit
npm run lint
bash modules/quantumlink/rebuild_so.sh
npx expo run:android
```

Expo Go cannot load the custom native QuantumLink module. Use a native
development or release build.

## Release POC APK

From this directory:

```bash
npm run build:android:release
```

The command re-runs static checks and unit tests, rebuilds Rust and UniFFI,
performs a clean Expo prebuild, assembles the arm64 release, and copies it to
`../artifacts/`.

The artifact is deliberately development-signed. Production distribution
requires an organization-controlled keystore, provenance, review of dependency
advisories, and a full security audit.

## Relevant source

| Path                                   | Responsibility                                          |
| -------------------------------------- | ------------------------------------------------------- |
| `src/passport/PassportProvider.tsx`    | Pairing/session state, WDK calls, balances and sends    |
| `src/passport/PassportSignerEvm.ts`    | WDK external signer and returned-signature verification |
| `src/passport/protocol.ts`             | Canonical transaction boundary                          |
| `src/passport/QuantumLinkTransport.ts` | Native-module adapter                                   |
| `modules/quantumlink/src/lib.rs`       | GSTP/BTP session and protocol encoding                  |
| `modules/quantumlink/android/`         | BLE, Keystore identity storage, JNI/React Native bridge |

See the repository-level [`docs/`](../docs/) for architecture, protocol, and
hardware validation details.
