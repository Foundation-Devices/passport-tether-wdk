# Hardware demo runbook

## Prepare artifacts

Build the arm64 Android APK:

```bash
cd mobile
npm ci
npm run build:android:release
```

Apply the integration to a clean KeyOS checkout at the revision in
`SOURCE_PINS.md`, then build the complete developer image:

```bash
bash scripts/apply_keyos_integration.sh /absolute/path/to/keyos
bash scripts/verify_keyos_integration.sh /absolute/path/to/keyos
bash scripts/build_prime_firmware.sh /absolute/path/to/keyos
```

The signed application bundle and complete image are at:

```text
target/armv7a-unknown-xous-elf/release/keyos/apps/gui-app-tether-wdk/
boot.img
```

`--app` replaces KeyOS's default filesystem-app list. Never create a full boot
image from `cargo xtask build --app gui-app-tether-wdk` alone: the resulting
device can verify a PIN but cannot finish normal GUI startup. Use the script
above, which retains the standard apps and adds Tether. Use only authorized
developer signing keys and never flash this POC onto a device used for
production funds.

Install the development-signed Android APK on an arm64 test phone:

```bash
adb install -r artifacts/tether-wdk-passport-arm64-poc.apk
```

## Pair

1. Open **Tether WDK** on Passport Prime and unlock the device if asked.
2. Open **Tether WDK for Passport** on Android.
3. Tap **Pair Passport Prime** once. Accept the camera permission first, then
   the nearby-device permission. The scanner opens automatically after both
   dialogs settle.
4. Scan Prime's first static QR; the app connects to that exact BLE address.
5. Scan Prime's animated identity QR.
6. Wait for both screens to show connected/ready.
7. Confirm the same Sepolia address in Android Settings and on Prime.

If pairing fails, keep Prime awake, ensure no other phone is connected, grant
all requested permissions, then use **Reconnect**. To switch hardware, open
Android **Settings → Change Passport Prime → Forget & connect another
Passport**. When online this acknowledges removal on both devices; when offline,
also choose **Disconnect phone** on Prime before pairing it again.

## Fund the test account

Send only Sepolia test assets to the displayed address:

- enough Sepolia ETH for transfer value and gas;
- test USD₮ at
  `0xd077a400968890eacc75cdc901f0356c943e4fdb`.

Wait for the wallet balance to refresh. Never send mainnet assets.

## Demo sequence

1. Show the wallet dashboard, Passport connection chip, and persistent Sepolia
   POC labeling.
2. Open Receive and compare/copy the Passport-backed address.
3. Start a small USD₮ send.
4. On Prime, compare network, asset, recipient, amount, and maximum fee.
5. Reject once; verify the phone returns a rejection and no transaction appears.
6. Repeat and approve on Prime.
7. Verify the phone broadcasts and opens the Sepolia Etherscan transaction.
8. Show Activity and Settings, including path, contract, reconnect, and unpair.

## Required negative checks

- cancel while Prime is reviewing;
- disconnect BLE during review;
- reconnect after Prime sleeps;
- try a wrong-chain, unknown-contract, excessive-fee, and zero-address fixture;
- unpair from each side and verify the peer clears its session;
- perform ten consecutive sign/reject round trips.

Record phone/Prime versions, artifact hashes, derived address, transaction
hashes, and every outcome in `docs/VALIDATION.md`.
