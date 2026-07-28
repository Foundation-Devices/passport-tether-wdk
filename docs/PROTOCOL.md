# QuantumLink WDK protocol

Application protocol version `1` is encoded with the existing Foundation
QuantumLink CBOR envelope, GSTP authenticated encryption, and BTP BLE framing.
Request IDs are 16 random bytes.

## Messages

| Message | Direction | Contents |
| --- | --- | --- |
| `WdkEvmAccountRequest` | phone → Prime | version, ID, path, chain |
| `WdkEvmAccountResponse` | Prime → phone | version, ID, path, address, public key |
| `WdkEvmSignTransactionRequest` | phone → Prime | canonical EIP-1559 fields |
| `WdkEvmSignTransactionResponse` | Prime → phone | ID, signer address, signed transaction |
| `WdkBtcAccountRequest` | phone → Prime | version, ID, BIP-84 path, Bitcoin network |
| `WdkBtcAccountResponse` | Prime → phone | version, ID, path, testnet address, compressed public key |
| `WdkBtcSignPsbtRequest` | phone → Prime | version, ID, path, network, PSBT |
| `WdkBtcSignPsbtResponse` | Prime → phone | ID, signer address, finalized raw transaction |
| `WdkRequestRejected` | Prime → phone | ID, typed reason, localized message |
| `WdkRequestCancelled` | either direction | version and request ID |

The exact shared Rust structures are in
`foundation-api/api/src/api/wdk.rs`. KeyOS service API subscription IDs 47–56
are introduced by the integration patch; they are internal Xous API IDs, not
wire-message tags.

## Canonical signing request

The signing request contains:

- chain ID and nonce;
- checksummed `from` and `to`;
- raw calldata;
- value, gas limit, maximum fee, and priority fee as canonical unsigned
  base-10 strings;
- the exact path `m/44'/60'/0'/0/0`.

It does not contain a signing hash or trusted token/amount labels. Passport
reconstructs the type-2 RLP signing payload.

The Bitcoin request carries a standard PSBT rather than trusted review labels.
Passport accepts only the fixed BIP-84 testnet path, owned native-SegWit
`witness_utxo` inputs, `SIGHASH_ALL`, one external recipient, optional
same-account change, and bounded fee/value/input/output counts. It derives the
review from the PSBT and returns a finalized raw transaction.

## Pairing and identity binding

1. The phone scans Prime's static QR to obtain the exact BLE address.
2. BLE scanning filters on that address and the Nordic UART service.
3. The phone scans Prime's animated XID QR.
4. The Rust session pins that XID before accepting a GSTP sender.
5. Pairing establishes the mutually authenticated QuantumLink relationship.
6. Reconnect restores the encrypted phone identity and public peer metadata.

A cryptographically valid message from any XID other than the pinned Passport
is rejected.

## Request lifecycle

Only one Prime review is active at a time. Account and signing responses must
match their 16-byte request ID. Cancellation clears matching pending state.
BLE disconnect or unpair clears all pending state. Duplicate/replayed GSTP
messages fail in the QuantumLink session.

After signing, the phone parses the returned transaction and verifies that its
type, chain, nonce, recovered sender, destination, calldata, value, gas,
fees, and access list exactly match the request. For Bitcoin, it verifies every
outpoint, sequence, output value, and output script against the original PSBT.
A mismatched but otherwise valid signed transaction is rejected before
broadcast.
