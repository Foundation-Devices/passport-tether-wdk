// React Native entry for Tether's BTC WDK. The upstream package root eagerly
// exports Node socket transports; Passport uses an externally supplied Esplora
// client and needs only the read-only account implementation.
export { default as WalletAccountReadOnlyBtc } from '../../node_modules/@tetherto/wdk-wallet-btc/src/wallet-account-read-only-btc.js';
