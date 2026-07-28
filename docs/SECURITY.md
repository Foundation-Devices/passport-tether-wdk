# Security model and limitations

## Invariants enforced by the POC

- No EVM or Bitcoin seed/private key is created or stored on the phone.
- Passport uses a KeyOS per-app seed and the fixed path
  `m/44'/60'/0'/0/0`.
- The phone cannot ask Passport to sign an arbitrary digest.
- The device independently parses every field shown in its review.
- Every spend requires a physical approval gesture.
- The QuantumLink peer is bound to the XID scanned during pairing.
- Wrong chain, sender, path, call, token, fee, value, or returned transaction
  fails closed.
- Payloads, addresses, unsigned transactions, and signed transactions are not
  written to release logs.

## Signing policy

Allowed:

- EIP-1559 (`type 2`) on Sepolia (`11155111`);
- native ETH transfer with empty calldata;
- ERC-20 `transfer(address,uint256)` to the allowlisted Sepolia USD₮ contract.

Rejected:

- mainnet and every other chain;
- zero recipient, contract creation, access lists, blobs, and EIP-7702;
- approvals, swaps, arbitrary calldata, or unknown token contracts;
- message and typed-data signing;
- a sender other than the Passport-derived account;
- non-canonical decimal quantities;
- gas limit over 2,000,000;
- maximum fee per gas over 1,000 gwei;
- maximum total fee over 0.05 ETH;
- native value over 1,000 ETH;
- USD₮ amount over 1,000,000,000 tokens.

Limits are defense-in-depth POC caps, not financial advice or a production
policy.

Bitcoin Testnet allowed:

- fixed BIP-84 path `m/84'/1'/0'/0/0`;
- native P2WPKH inputs whose `witness_utxo` matches Passport's derived account;
- `SIGHASH_ALL`, one external testnet recipient, and optional same-account
  change;
- 1–50 inputs, 1–2 outputs, and a maximum 1,000,000 satoshi fee.

Bitcoin mainnet, foreign inputs, arbitrary scripts, multiple recipients,
non-owned change, alternate sighash modes, oversized PSBTs, and unbounded fees
are rejected. The phone additionally compares the finalized raw transaction
with the original PSBT before broadcasting.

## Secret handling

Prime secret material is derived only when needed. The app seed is wrapped in
zeroizing storage; derived BIP32 private fields and the signing key are erased
after use. The phone identity is encrypted with an AES-GCM key held by Android
Keystore. Public pairing metadata is stored separately.

## Dependency posture

Package versions are locked. As validated on 24 July 2026,
`npm audit --omit=dev` reports one low, fourteen moderate, and one high
transitive advisory in the pinned Expo tool/runtime graph; the available fix
requires a major Expo upgrade. The full development dependency graph reports
additional advisories and must not be treated as a hardened build environment.

WDK and its UI kit are prerelease packages. KeyOS and the protocol integration
have not received an independent security audit.

## Production blockers

- independent cryptographic, protocol, mobile, and KeyOS audits;
- organization-controlled Android and firmware signing;
- reproducible CI with artifact provenance/SBOM;
- physical fault, lifecycle, replay, and repeated-pairing tests;
- dependency upgrades/remediation;
- secure RPC/indexer operational design and privacy review;
- localization and accessibility review;
- formal Tether and Foundation brand/release approval.
