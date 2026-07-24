# Validation record

Validated locally on macOS arm64 on 23–24 July 2026.

## Completed

| Layer | Evidence | Result |
| --- | --- | --- |
| Mobile TypeScript | `npm run typecheck` | Pass |
| Mobile lint | `npm run lint` | Pass |
| External signer/protocol and wallet catalog | 15 Node tests, including Hermes BC-UR/secure-random compatibility, BLE recovery, tampered signed transactions, production asset grouping, and fail-closed unsupported routes | Pass |
| Mobile QuantumLink Rust | 5 tests, including pinned pairing-response and authenticated heartbeat round trips | Pass |
| Kotlin native module | Android release Kotlin compilation | Pass |
| Metro/Hermes bundle | production Android export | Pass |
| Android APK | arm64 release assembly and manifest/ABI inspection | Pass |
| Foundation API | backup-shard, BTP, API and golden snapshot suites | Pass |
| Prime signer | 6 policy/vector tests | Pass |
| Prime lifecycle | 5 pairing, reconnect, and persisted-state tests | Pass |
| KeyOS 1.3.0 integration | fresh setup, formatting, 11 Prime tests, 2 QuantumLink server tests, and compile checks | Pass |
| KeyOS hosted app | `cargo xtask build --hosted --dont-sign --ci --app gui-app-tether-wdk` | Pass |
| Prime ARM application | direct `armv7a-unknown-xous-elf` release build on KeyOS 1.3.0 | Pass |
| Earlier signed Prime bundle | Cosign2 developer-signed production-target app bundle | Pass |
| Complete KeyOS bundle | 17 signed filesystem apps: standard KeyOS set, development utilities, and Tether WDK | Pass |
| Post-PIN startup | Restored onboarding-complete flag without changing PIN/seed; launcher remains unlocked beyond the former 15-second cutoff | Pass |
| Prime UX | welcome, enlarged feature copy, wallet choice/recovery, wallet-created education, and pairing states captured at 480×800 on hardware | Pass |
| Prime disconnect | `UnpairFromEnvoy` wired through KeyOS; Android clears the matching peer and wallet session on the unpair event | Pass |
| Physical app deployment | existing bundle backed up; new ELF and manifest copied to the attached Prime and verified byte-for-byte | Pass |
| Prime firmware flash | full 370 MiB image write and byte verification | Pass |
| Prime runtime | KeyOS 1.3.0, QuantumLink PID 27, Tether WDK PID 41 | Pass |
| Prime UI | aligned welcome/choice/created-wallet screens, Tether branding, static pairing QR, and centered companion-app pill captured on hardware | Pass |
| Android connection UX | sequential camera/BLE permission flow, guarded camera launch, visible connection management, and local offline forget path | Build pass; hardware rerun pending |
| Prime pairing transition | BLE subscription is canonical and `GetState` reconciliation runs every 350 ms; QL status can no longer overwrite a connected UI with stale false | Build pass; hardware rerun pending |
| Production npm audit | 0 high, 0 critical; 15 moderate, 1 low | Recorded |

The final local artifacts are:

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `tether-wdk-passport-arm64-poc.apk` | 46,982,720 bytes | `e8858999fa4abf7bbe3f04432414e5afeb7dd2d78201ed9f3588f8e9b55b6c35` |
| `prime-app/app.elf` | 3,041,796 bytes | `985f267859dae5f0fe2f21d198e6deeb2a360bf5af78ad2009827219730b58f4` |
| `prime-app/manifest.json` | 1,140 bytes | `d0d5d161d7cbd7781cd5c2d6e0c56af19553710af99bee04120e5c690ce03335` |

The APK contains only `arm64-v8a`, targets SDK 36 with minimum SDK 29, and is
APK Signature Scheme v2 signed by the Android debug certificate. The Prime ELF
is a stripped 32-bit ARM EABI5 static PIE. Rebuilds legitimately change binary
hashes.

## Environment constraints

A Passport Prime development unit was flashed and validated over USB. The final
developer image retains 16 standard/development native Prime apps, excludes the
unrelated Flux child payloads whose upstream C build is currently broken, and
adds Tether WDK as the seventeenth signed app. The system container and every
filesystem app use Cosign2 developer signatures. The final Tether app is running
as PID 41 and its aligned welcome screen was captured directly from the physical
480×800 display.

Two full-image integration failures were found and corrected during hardware
recovery. First, an unsigned outer `app.bin` was rejected even though the Tether
ELF itself was signed; the final image validates both signature layers. Second,
building with only `--app gui-app-tether-wdk` removed KeyOS's default filesystem
apps. PIN authentication still succeeded, but GUI startup remained in
`InitialLockScreen`. The final build keeps the full app set. Recreating the
filesystem also cleared the non-secret onboarding-complete setting; the
developer-only `Exit (Debug)` action restored that setting without generating a
seed or changing the existing PIN. KeyOS's `LoginSuccess` handler now resets the
auto-lock timer, preventing the pending locked-screen timeout from immediately
re-locking after a valid PIN.

Current hardware testing completed the two-code physical pairing flow, loaded
the Passport-controlled account, approved a USD₮ transfer on Passport Prime,
and broadcast the transaction from Android. Earlier runs exposed the Hermes
Buffer/CSPRNG and heartbeat issues recorded in
`ENVOY_ANDROID_BLE_BENCHMARK.md`; those defects remain covered by unit tests and
the Android release build. The current APK requests camera and nearby-device
permissions sequentially, guards the connect CTA against duplicate launches,
tints the WDK wordmark for the dark theme, and supports both acknowledged
two-sided unpairing and an explicit offline local forget path.

The 24 July wallet-parity pass rebuilt the Android home, transactions,
receive, send-entry, and connection-menu surfaces around the production Tether
Wallet hierarchy. BTC, USD₮, USA₮, XAU₮, and the production USD₮ network family
are visible, but only the reviewed USD₮/ETH Sepolia routes are enabled. This
presentation-only pass preserves the existing WDK external-signer,
QuantumLink, onboarding, pairing, disconnect, and signing paths. The final APK
again passed typecheck, all 15 tests, lint, arm64 native compilation, Hermes
bundling, release minification, and manifest/ABI inspection. No Android device
or emulator was attached for this pass, so its final visual and pairing
regression remains a hardware sign-off item.

Prime now polls the authoritative Bluetooth server every 350 ms in addition to
the immediate state subscription. QuantumLink status no longer writes the UI's
BLE flag, removing the stale-false race that left Prime on the static QR after
Android reached step 2. The source integration was subsequently rebased onto
the exact KeyOS 1.3.0 release revision and rebuilt for the ARM target. That
rebased binary passes the clean-checkout suite but has not yet replaced the
previously hardware-tested developer-signed app. A final on-device regression
of the rebased binary remains required before release-candidate sign-off.

## Hardware sign-off checklist

- [ ] Clean Android install launches and requests only expected permissions.
- [x] Prime static BLE QR and corrected Bluetooth-waiting UI renders.
- [x] Current APK: a real phone GATT connection advances Prime to the animated XID QR.
- [x] Current APK: authenticated XID exchange completes and both devices enter paired state.
- [x] New welcome, wallet-choice, and recovery pages render correctly on the physical Prime.
- [x] Pairing status pill remains aligned and readable on the physical Prime.
- [x] Paired-home account, connection state, and menu render correctly on the physical Prime.
- [x] Address matches on both devices.
- [x] Live Sepolia ETH and USD₮ balances appear.
- [x] Receive QR resolves to the Passport-derived address.
- [ ] Reject produces no broadcast.
- [x] Approve produces a valid Sepolia transaction that the companion broadcasts.
- [ ] Cancel/disconnect/reconnect states fail closed and recover cleanly.
- [ ] Wrong chain/token/call/fee/value/replay fixtures are rejected.
- [ ] Ten consecutive request cycles succeed without stale state.
- [ ] Two-sided unpair clears both peers.
- [ ] Release logs contain no prohibited transaction/key material.
- [ ] Android and Prime screenshots plus a short demo are captured.

Until every item is signed off, this remains a locally verified POC rather than
a hardware-validated release candidate.
