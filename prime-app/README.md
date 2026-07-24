# Passport Prime Tether WDK application

`gui-app-tether-wdk` is the Passport Prime half of the proof of concept. It is
copied into a clean KeyOS tree by `scripts/apply_keyos_integration.sh`.

It:

- obtains a KeyOS per-app seed and never persists or exports it;
- derives `m/44'/60'/0'/0/0`;
- returns only public account data;
- accepts canonical EIP-1559 fields, never a precomputed digest;
- enforces Sepolia, fee/value limits, and native ETH or one USD₮ `transfer`;
- independently derives the review amount, recipient, asset, and maximum fee;
- signs only after the user slides to approve;
- clears pending work on cancel or disconnect;
- zeroizes derived secret material.

Build and integration instructions are in the root
[`README.md`](../README.md). Transaction-policy details are in
[`docs/SECURITY.md`](../docs/SECURITY.md).

