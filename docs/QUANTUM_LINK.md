<!--
SPDX-FileCopyrightText: 2026 Foundation Devices, Inc. <hello@foundation.xyz>
SPDX-License-Identifier: GPL-3.0-or-later
-->

# The companion link, and why it is gated

The Prime app is built by the Foundation SDK as a standalone, sideloadable
application. The phone companion link is compiled out of that default build and
sits behind the `quantum-link` Cargo feature.

## Why it is off

The app talks to the Android companion using twelve QuantumLink messages —
`SubscribeWdkEvmAccountRequest`, `SendWdkBtcSignPsbtResponse`, and the rest.
**None of them are part of stock KeyOS.** They are added by
[`keyos-patches/0001-tether-wdk-app.patch`](../keyos-patches/), which modifies
both `api/quantum-link` and the `os/quantum-link` *server*.

An app cannot add server-side message routing. So for as long as the protocol
rides on QuantumLink, using it requires a patched OS — which is exactly what a
self-contained repository cannot depend on.

Gating it is what lets the wallet build, sign, and sideload against a stock
device. The code is retained, not deleted, so QuantumLink v2 can switch it back
on.

## What the default build still does

Everything that does not need the phone: it derives the app-scoped seed via
`os/security` `GetAppSeed`, derives the EVM and BIP-84 Bitcoin keys, and shows
the receive address and QR. Pairing, transaction review, and signing are the
parts that require the link.

## Re-enabling it

Three things must all be true. Today none of them are.

1. **Restore the dependencies.** `bt` and `quantum-link` are commented out in
   `prime-app/Cargo.toml` rather than marked `optional`. Cargo reads an
   optional dependency's manifest during resolution, so a feature-gated entry
   still has to resolve — and these do not, see below.

2. **An SDK bundle that ships `api/gpio`.** The SDK's vendored KeyOS workspace
   declares `gpio` at `api/gpio`, but no shipped bundle contains that
   directory. `api/bt` depends on it, and `api/quantum-link` depends on
   `api/bt`, so both fail to resolve. This is an SDK packaging defect, not
   something this repository can work around.

3. **A KeyOS carrying the WDK messages**, either from `keyos-patches/` or
   because QuantumLink v2 has upstreamed them.

Then:

```bash
cd prime-app
# merge permission_templates.companion-link.toml into permission_templates.toml
# and point app-config.toml at the companion-link template
cargo build --features quantum-link --target armv7a-unknown-xous-elf
```

The permission set lives in
[`prime-app/permission_templates.companion-link.toml`](../prime-app/permission_templates.companion-link.toml).
It is kept out of `permission_templates.toml` because the CLI validates every
template it finds, and these message names do not exist on a stock device.

## What is gated

In `prime-app/src/main.rs`, behind `#[cfg(feature = "quantum-link")]`:

- the `quantum_link` imports and `quantum_link::use_api!()`
- `bt::use_api!()` and the Bluetooth surface — the radio exists to carry the
  link, so it goes with it
- `start_pairing_ui`, `monitor_bluetooth_connection`, `monitor_connection`
- the five request handlers: EVM/BTC account, EVM/BTC signing, cancellation
- `send_rejection`, and the `QlStatus` field on `AppState`

Two helpers keep the disconnect flow identical in both builds:
`unpair_from_companion()` and `drop_companion_radio_link()` are no-ops when the
feature is off.
