// SPDX-License-Identifier: GPL-3.0-or-later
//! Tether WDK ⇄ Passport Prime QuantumLink messages.
//!
//! The phone builds an EIP-1559 transaction but never supplies a precomputed
//! signing hash. Passport reconstructs the transaction, validates its policy,
//! renders the authoritative review, and signs with its per-app seed.

use quantum_link_macros::quantum_link;

/// Current application protocol carried inside the QuantumLink envelope.
pub const WDK_PROTOCOL_VERSION: u8 = 1;

/// Ethereum Sepolia.
pub const WDK_SEPOLIA_CHAIN_ID: u32 = 11_155_111;

/// Bitcoin public testnet (BIP-84 coin type 1).
pub const WDK_BITCOIN_TESTNET: u8 = 1;

/// Phone → Passport: fetch one public EVM account.
#[quantum_link]
pub struct WdkEvmAccountRequest {
    #[n(0)]
    pub protocol_version: u8,
    #[n(1)]
    pub request_id: Vec<u8>,
    #[n(2)]
    pub derivation_path: String,
    #[n(3)]
    pub chain_id: u32,
}

/// Passport → phone: public account material only.
#[quantum_link]
pub struct WdkEvmAccountResponse {
    #[n(0)]
    pub protocol_version: u8,
    #[n(1)]
    pub request_id: Vec<u8>,
    #[n(2)]
    pub derivation_path: String,
    #[n(3)]
    pub address: String,
    #[n(4)]
    pub public_key: Vec<u8>,
}

/// Phone → Passport: a canonical EIP-1559 transaction for independent review.
///
/// Quantities that may exceed the native CBOR integer range are encoded as
/// canonical unsigned base-10 strings. Address strings are EIP-55 checksummed.
#[quantum_link]
pub struct WdkEvmSignTransactionRequest {
    #[n(0)]
    pub protocol_version: u8,
    #[n(1)]
    pub request_id: Vec<u8>,
    #[n(2)]
    pub derivation_path: String,
    #[n(3)]
    pub chain_id: u32,
    #[n(4)]
    pub nonce: u64,
    #[n(5)]
    pub from: String,
    #[n(6)]
    pub to: String,
    #[n(7)]
    pub data: Vec<u8>,
    #[n(8)]
    pub value: String,
    #[n(9)]
    pub gas_limit: String,
    #[n(10)]
    pub max_fee_per_gas: String,
    #[n(11)]
    pub max_priority_fee_per_gas: String,
}

/// Passport → phone: the complete signed EIP-1559 transaction.
#[quantum_link]
pub struct WdkEvmSignTransactionResponse {
    #[n(0)]
    pub protocol_version: u8,
    #[n(1)]
    pub request_id: Vec<u8>,
    #[n(2)]
    pub address: String,
    #[n(3)]
    pub signed_transaction: Vec<u8>,
}

/// Phone → Passport: fetch the public BIP-84 Bitcoin testnet account.
#[quantum_link]
pub struct WdkBtcAccountRequest {
    #[n(0)]
    pub protocol_version: u8,
    #[n(1)]
    pub request_id: Vec<u8>,
    #[n(2)]
    pub derivation_path: String,
    #[n(3)]
    pub network: u8,
}

/// Passport → phone: public Bitcoin account material only.
#[quantum_link]
pub struct WdkBtcAccountResponse {
    #[n(0)]
    pub protocol_version: u8,
    #[n(1)]
    pub request_id: Vec<u8>,
    #[n(2)]
    pub derivation_path: String,
    #[n(3)]
    pub address: String,
    #[n(4)]
    pub public_key: Vec<u8>,
}

/// Phone → Passport: a complete PSBT for independent validation and review.
///
/// Passport accepts only native SegWit inputs owned by the requested BIP-84
/// account, one external recipient, and optional change back to that account.
#[quantum_link]
pub struct WdkBtcSignPsbtRequest {
    #[n(0)]
    pub protocol_version: u8,
    #[n(1)]
    pub request_id: Vec<u8>,
    #[n(2)]
    pub derivation_path: String,
    #[n(3)]
    pub network: u8,
    #[n(4)]
    pub psbt: Vec<u8>,
}

/// Passport → phone: the finalized raw Bitcoin transaction.
#[quantum_link]
pub struct WdkBtcSignPsbtResponse {
    #[n(0)]
    pub protocol_version: u8,
    #[n(1)]
    pub request_id: Vec<u8>,
    #[n(2)]
    pub address: String,
    #[n(3)]
    pub signed_transaction: Vec<u8>,
}

/// Passport → phone: explicit user rejection or policy failure.
#[quantum_link]
pub struct WdkRequestRejected {
    #[n(0)]
    pub protocol_version: u8,
    #[n(1)]
    pub request_id: Vec<u8>,
    #[n(2)]
    pub reason_code: u8,
    #[n(3)]
    pub message: String,
}

/// Either side → peer: cancel an in-flight request.
#[quantum_link]
pub struct WdkRequestCancelled {
    #[n(0)]
    pub protocol_version: u8,
    #[n(1)]
    pub request_id: Vec<u8>,
}
