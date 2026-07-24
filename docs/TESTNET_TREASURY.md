# Sepolia test treasury

This project has a dedicated, testnet-only treasury for recycling Sepolia ETH
and WDK test USD₮ between demo wallets. Its private key is stored in the local
macOS login Keychain under:

```text
Service: com.foundationdevices.passport-tether-wdk.sepolia-treasury
Account: passport-tether-wdk
```

The private key is never written to the repository. Do not send real or mainnet
assets to the treasury address.

Treasury address:

```text
0x1f549285F8c3a5a301314D5cd0aD46A0bECEd4Fc
```

Run commands from `mobile/`:

```bash
npm run treasury:init
npm run treasury:status
npm run treasury:send-usdt -- 0xRecipient 25 --yes
npm run treasury:send-eth -- 0xRecipient 0.01 --yes
```

Every operation verifies Ethereum Sepolia chain ID `11155111`. USD₮ transfers
are hard-coded to the WDK Sepolia test contract:

```text
0xd077a400968890eacc75cdc901f0356c943e4fdb
```

Keep enough Sepolia ETH in the treasury to pay ERC-20 transfer gas.
