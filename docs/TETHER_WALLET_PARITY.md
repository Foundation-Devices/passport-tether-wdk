# Tether Wallet parity reference

This proof of concept intentionally follows the information architecture and
visual hierarchy of the Android Tether Wallet while keeping Passport Prime as
the only signer.

## Reference boundary

The production Tether Wallet application source is not publicly available. The
public `tetherto/tether-wallet-app-releases` repository contains release notes
and binaries, not application source. Exact production screen strings such as
`Total Wallet Balance` and `Choose Currency to Receive` do not appear in
Tether's public repositories.

The implementation therefore uses:

- device captures of the production Tether Wallet supplied during development;
- the public WDK React Native starter;
- the public WDK React Native UI kit;
- the public WDK asset registry; and
- the public WDK Bitcoin wallet source to assess hardware-signer feasibility.

The inspected revisions are recorded in [`../SOURCE_PINS.md`](../SOURCE_PINS.md).

## Product model

The Android application presents the same asset-first shape visible in the
production wallet:

| Asset | Visible network choices | POC state |
| --- | --- | --- |
| BTC | Bitcoin Testnet | Enabled |
| USD₮ | Ethereum, Plasma, Polygon, Arbitrum, Tron | Ethereum Sepolia enabled |
| USA₮ | No documented public test deployment | Listed, disabled |
| XAU₮ | No documented public test deployment | Listed, disabled |
| ETH | Ethereum Sepolia | Enabled under **Network gas** in Send |

Disabled routes are deliberate. The application never invents a token
deployment, balance, receiving address, or signing capability.

## Bitcoin hardware-signer boundary

The inspected WDK Bitcoin module constructs `WalletManagerBtc` from a BIP-39
seed and signs inside `WalletAccountBtc`. It does not expose the EVM module's
external-signer boundary. Passing a phone-held seed would violate this
repository's core security rule.

The POC therefore uses WDK's `WalletAccountReadOnlyBtc` for testnet balance,
fee estimation, UTXO selection, and spend planning, but never instantiates a
seeded WDK Bitcoin account. The phone converts the WDK plan to a PSBT.
Passport Prime derives `m/84'/1'/0'/0/0`, verifies that every input belongs to
that account, permits one recipient plus optional same-account change, checks
the fee and values, renders the authoritative review, and returns a finalized
transaction. The phone verifies every input and output against the original
PSBT before broadcast.

This is an explicit hardware signer adapter around the published WDK
read-only/account-planning surface, not a claim that the upstream BTC module
natively supports external signers.

## Preserved Passport behavior

The parity pass changes presentation and navigation only. The following remain
owned by the existing implementation:

- onboarding and camera/Bluetooth permission handling;
- static QR plus animated identity QR pairing;
- exact-device reconnect, disconnect, unpair, and local forget;
- WDK EVM transaction construction and WDK BTC fee/coin selection;
- canonical QuantumLink transaction requests;
- Passport Prime policy validation and user review;
- returned-signature verification; and
- post-broadcast balance refresh.

## Visual hierarchy

- Centered `tether.` masthead and sparse black home surface.
- Large centered total balance with visibility control.
- Compact Transactions entry rather than a dashboard card stack.
- Floating rounded Receive/Send dock above the system safe area.
- Receive Funds tabs and asset/network selectors.
- Rounded, elevated bottom sheets with grouped currency and network rows.
- Passport connectivity remains explicit through a red/green status pill and
  a dedicated connection menu.
