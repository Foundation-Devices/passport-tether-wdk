# Agent guide

This repository contains two applications that must stay protocol-compatible:
the Android companion in `mobile/` and the Passport Prime KeyOS application in
`prime-app/`. Read the root `README.md`, `SOURCE_PINS.md`, and
`docs/ARCHITECTURE.md` before changing either side.

## Safety and scope

- This is an unaudited Sepolia-only proof of concept. Never enable mainnet or
  remove the testnet warnings.
- Passport Prime is the only signer. Never add phone-side seed generation,
  private-key export, or a software-signing fallback.
- Keep the canonical request validation in both
  `mobile/src/passport/protocol.ts` and `prime-app/src/evm.rs` fail-closed.
- Do not commit generated native folders, build output, signing material,
  `.env` files, APKs, firmware, or developer keys.
- Do not change the source pins silently. Update `SOURCE_PINS.md`, the setup
  scripts, and validation evidence together.

## Reproduce the workspace

```bash
git clone git@github.com:Foundation-Devices/passport-tether-wdk.git
cd passport-tether-wdk

cd mobile
npm ci
npm run typecheck
npm run test:unit
npm run lint
cd ..

bash scripts/setup_keyos.sh ../KeyOS
bash scripts/verify_keyos_integration.sh ../KeyOS
```

The KeyOS script checks out the exact supported SDK revision and creates only a
safe sibling symlink to this repository's `foundation-api/`. It refuses a dirty
or wrong-revision KeyOS checkout.

## Required checks

For Android changes:

```bash
cd mobile
npm run typecheck
npm run test:unit
npm run lint
npm run build:android:release
```

For Prime, protocol, or shared API changes:

```bash
bash scripts/verify_keyos_integration.sh ../KeyOS
cd ../KeyOS
RUSTFLAGS='--cfg keyos -C relocation-model=pic -C link-arg=-pie' \
  cargo build --profile release \
  --target armv7a-unknown-xous-elf \
  --package gui-app-tether-wdk
```

Run both sets when the wire protocol, pairing lifecycle, transaction schema, or
shared message IDs change. Hardware changes are not complete until static QR,
animated identity QR, reconnect, disconnect, rejection, approval, broadcast,
and balance refresh have been exercised on an attached Prime and Android phone.

## Generated integration

`prime-app/` is the source of truth for the app. The KeyOS checkout is a build
workspace, not a second copy to edit. `scripts/apply_keyos_integration.sh`
applies `keyos-patches/` and then synchronizes `prime-app/` into KeyOS.

If the KeyOS patch must change, regenerate it against the exact clean revision
in `SOURCE_PINS.md`, apply it to a fresh checkout, and run all KeyOS checks
before committing.
