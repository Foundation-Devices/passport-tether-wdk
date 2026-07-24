# Envoy Android BLE connection benchmark

This record compares the Tether WDK POC with Envoy's current Android
Passport Prime connection path. It separates source-level parity from physical
timing evidence so an implementation comparison is not mistaken for a completed
hardware benchmark.

## Reference

- Envoy repository revision:
  `dc94bb9e5ba325befa667ba9cc4334ebb0ba417f`
- Revision date: 29 June 2026
- Compared on: 23 July 2026
- Relevant Envoy files:
  - `android/app/src/main/kotlin/com/foundationdevices/envoy/ble/BluetoothChannel.kt`
  - `android/app/src/main/kotlin/com/foundationdevices/envoy/ble/QLConnection.kt`
  - `lib/channels/bluetooth_channel.dart`
  - `lib/ui/onboard/prime/onboard_prime_ble.dart`

## Connection-path comparison

| Stage | Current Envoy | POC before benchmark | POC after benchmark |
| --- | --- | --- | --- |
| Known-Prime scan filter | Exact BLE address only | Address and NUS service UUID in one filter | Exact BLE address only |
| Scan mode | Low latency | Low latency | Low latency |
| Scan timeout | 15 seconds | 20 seconds | 15 seconds |
| GATT mode | `autoConnect=true`, LE transport | `autoConnect=false`, LE transport | `autoConnect=true`, LE transport |
| MTU | Requests 247 | Requests 247 | Requests 247 |
| Service discovery | Independent 500 ms delay after GATT connect | Started only from successful MTU callback | Independent 500 ms delay |
| Connection priority | Balanced | Default | Balanced |
| Preferred PHY | Requests 2M | Default | Requests 2M |
| Ready for writes | GATT connected and write characteristic found | CCCD write succeeds | CCCD write succeeds |
| Android OS bond | Starts after ready-for-write; waits for connected and bonded | Not requested or awaited | Starts after notifications; waits up to 10 seconds |
| Onboarding advance | Only after connected and bonded; then polls ready-for-write | Immediately after CCCD success | Only after notifications and OS bond |
| Disconnect recovery | Connection event starts periodic reconnect | Onboarding stayed on step 2 | Bounded reconnect; returns to step 1 on failure |
| QL heartbeat | Replies to every authenticated Prime heartbeat | Parsed as an unsupported message; no reply | Authenticated reply queued immediately |
| Pairing response recovery | Waits up to 15 seconds for response | One request, 60-second timeout | Fresh sealed retries at 1.5, 4, and 8 seconds; 20-second bound |
| Diagnostics | Android/Flutter connection events and logs | No elapsed stage trace | Timestamped scan, GATT, MTU, discovery, CCCD, bond, ready, and disconnect trace |

The address-only filter is significant because Android requires every field in a
single `ScanFilter` to match the same advertisement. Prime can be found by its
known QR address even if the current advertising packet does not contain the
NUS service UUID.

The OS bond gate is the most important behavioral difference. The POC used to
advance the phone to the animated identity scan before Android had completed
Bluetooth bonding. Envoy waits for `connected && bonded`.

## Physical baseline

The first attached-device run used the pre-benchmark Android build. Prime's
live KeyOS state reported:

| Event | Prime timestamp | Delta |
| --- | ---: | ---: |
| BLE connected, QL not paired | 1842.977 s | 0.0 s |
| BLE disconnected | 1849.621 s | 6.644 s |

The phone moved to onboarding step 2 while Prime returned to its static QR.
This proves that the old phone-side readiness gate was premature. It does not
yet prove which Android callback or bond state caused the disconnect because
that APK did not have stage timing.

A subsequent run with the Envoy-aligned Android lifecycle reached the intended
stable state: the phone displayed step 2, Prime displayed its animated identity
QR, and Prime reported `Bluetooth connected`. The connection gate therefore
passed. The phone then exposed a separate Hermes compatibility error while
decoding the identity QR (`Property 'Buffer' doesn't exist`). That runtime
polyfill is now installed before the application graph loads and is covered by
a no-`Buffer` BC-UR decoding test.

On the following run, Android reconstructed Prime's XID and sent the pairing
request. Prime accepted it and entered the paired Tether WDK wallet screen, but
Android remained in step 2. Prime's live log showed outbound QL traffic, zero
inbound traffic, and repeated missed-heartbeat warnings. Envoy's
`HeartbeatHandler` replies to each authenticated heartbeat; the POC did not.
The current build adds that response, fresh bounded pairing retries, and
receive-frame/message/error traces. A physical rerun of this build completed:
both devices entered their paired wallet states and Android showed an active
Prime connection. This closes the BLE/QuantumLink pairing gate; wallet account
initialization and transaction flows remain separate acceptance gates.

The recurring KeyOS development-firmware `Challenge failed` message is an
internal Bluetooth firmware self-check and is not used to gate a QuantumLink
client connection. Envoy and PubkyRing do not implement a matching mobile
challenge exchange.

## Next hardware acceptance run

Collect the new `PassportQuantumLink` timestamp trace and Prime QL state for the
same attempt. The run passes the connection gate only when:

1. The address-filtered scan matches within 15 seconds.
2. GATT connects and service discovery begins about 500 ms later regardless of
   MTU callback ordering.
3. NUS notifications enable successfully.
4. Android reports `BOND_BONDED` within 10 seconds.
5. The phone advances to step 2 only after the `ready bonded=true` trace.
6. Prime advances from the static BLE QR to its animated XID QR.
7. Android sends the pairing request, decodes Prime's response, and answers
   subsequent authenticated heartbeats.
8. Both devices enter their paired wallet state.
9. A disconnect is reflected on both devices and a bounded reconnect either
   restores the same stage or returns the phone to the static scanner.

End-to-end pairing, restart recovery, and ten consecutive request cycles remain
separate hardware sign-off gates.
