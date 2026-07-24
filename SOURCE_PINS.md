# Source Pins

The POC is based on the following reviewed source revisions.

| Component | Revision |
| --- | --- |
| Tether React Native starter | `tetherto/wdk-starter-react-native@14f8963427091997f0fb397df2a2cab5d1f01d05` |
| PubkyRing QuantumLink reference | `Foundation-Devices/PubkyRing@bb2dbb03ae8dd6dc8d146637c1d049c20fc5ef1e` |
| Envoy QuantumLink reference | `Foundation-Devices/envoy@22add007d379ef20479135c60be8d3870df68179` |
| KeyOS release | `Foundation-Devices/KeyOS@v1.3.0` (`425c9791007146d46355478b3ec321f2321ab226`) |
| Foundation API baseline | `Foundation-Devices/foundation-api@5.7.0` |
| WDK EVM wallet | `@tetherto/wdk-wallet-evm@1.0.0-beta.16` |
| WDK React Native UI kit | `@tetherto/wdk-uikit-react-native@1.0.0-beta.2` |

Always apply the integration to a clean KeyOS checkout at the exact revision
above. The setup script refuses other revisions so SDK drift cannot silently
produce an unreviewed firmware build.
