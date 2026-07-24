// SPDX-License-Identifier: GPL-3.0-or-later
//! Phone-side QuantumLink protocol core for the Passport Prime Tether WDK POC.
//!
//! BLE transport lives in Kotlin. This crate owns the post-quantum identity,
//! GSTP sealing/unsealing, replay checks, BTP framing, and typed WDK messages.

use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use btp::{chunk, Chunk, MasterDechunker};
use foundation_api::bc_envelope::prelude::CBOREncodable;
use foundation_api::bc_envelope::Envelope;
use foundation_api::bc_xid::XIDDocument;
use foundation_api::dcbor::CBOR;
use foundation_api::message::{
    EnvoyMessage, PassportMessage, QuantumLinkMessage, PROTOCOL_VERSION,
};
use foundation_api::pairing::{PairingRequest, UnpairingRequest, UnpairingResponse};
use foundation_api::quantum_link::{ARIDCache, QuantumLink, QuantumLinkIdentity};
use foundation_api::status::Heartbeat;
use foundation_api::wdk::{
    WdkEvmAccountRequest, WdkEvmSignTransactionRequest, WdkRequestCancelled, WDK_PROTOCOL_VERSION,
    WDK_SEPOLIA_CHAIN_ID,
};

uniffi::setup_scaffolding!();

const REQUEST_ID_LEN: usize = 16;
const EVM_ADDRESS_LEN: usize = 42;
const MAX_CALLDATA_LEN: usize = 4_096;
const MAX_SIGNED_TRANSACTION_LEN: usize = 8_192;
const MAX_DECIMAL_LEN: usize = 78;
const EVM_ACCOUNT_PATH: &str = "m/44'/60'/0'/0/0";

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum QlError {
    #[error("{0}")]
    Failed(String),
}

impl QlError {
    fn msg(error: impl std::fmt::Display) -> Self {
        Self::Failed(error.to_string())
    }
}

/// A reassembled, authenticated message from Passport Prime.
#[derive(uniffi::Record)]
pub struct DecodedMessage {
    pub kind: String,
    pub device_name: String,
    pub request_id: Vec<u8>,
    pub derivation_path: String,
    pub address: String,
    pub public_key: Vec<u8>,
    pub signed_transaction: Vec<u8>,
    pub reason_code: u8,
    pub message: String,
}

impl DecodedMessage {
    fn kind(kind: &str) -> Self {
        Self {
            kind: kind.into(),
            device_name: String::new(),
            request_id: Vec::new(),
            derivation_path: String::new(),
            address: String::new(),
            public_key: Vec::new(),
            signed_transaction: Vec::new(),
            reason_code: 0,
            message: String::new(),
        }
    }
}

/// Generate a fresh post-quantum QuantumLink identity for secure persistence.
#[uniffi::export]
pub fn generate_identity() -> Vec<u8> {
    QuantumLinkIdentity::generate().to_bytes()
}

/// Return the public XID document for the persisted phone identity.
#[uniffi::export]
pub fn identity_xid(identity: Vec<u8>) -> Result<Vec<u8>, QlError> {
    let identity = QuantumLinkIdentity::from_bytes(&identity).map_err(QlError::msg)?;
    Ok(identity.xid_document.to_cbor_data())
}

/// Build the two-step pairing request after the phone has connected over BLE.
#[uniffi::export]
pub fn build_pairing_request(
    identity: Vec<u8>,
    prime_xid: Vec<u8>,
    device_name: String,
) -> Result<Vec<Vec<u8>>, QlError> {
    let identity = QuantumLinkIdentity::from_bytes(&identity).map_err(QlError::msg)?;
    let recipient = parse_xid(&prime_xid)?;
    let private_keys = identity
        .private_keys
        .as_ref()
        .ok_or_else(|| QlError::Failed("identity contains no private keys".into()))?;

    let message = EnvoyMessage {
        message: QuantumLinkMessage::PairingRequest(PairingRequest {
            xid_document: identity.xid_document.to_cbor_data(),
            device_name,
        }),
        timestamp: now_secs(),
        protocol_version: Some(PROTOCOL_VERSION),
    };
    let envelope = message.seal((private_keys, &identity.xid_document), &recipient);
    Ok(frames(&envelope.to_cbor_data()))
}

/// Answer Passport Prime's liveness probe. Prime treats a connected BLE link
/// as dead unless the authenticated peer returns these heartbeats.
#[uniffi::export]
pub fn build_heartbeat_response(
    identity: Vec<u8>,
    prime_xid: Vec<u8>,
) -> Result<Vec<Vec<u8>>, QlError> {
    seal_envoy(
        &identity,
        &prime_xid,
        QuantumLinkMessage::Heartbeat(Heartbeat {}),
    )
}

/// Ask Passport Prime to remove the authenticated pairing at both ends.
#[uniffi::export]
pub fn build_unpairing_request(
    identity: Vec<u8>,
    prime_xid: Vec<u8>,
) -> Result<Vec<Vec<u8>>, QlError> {
    seal_envoy(
        &identity,
        &prime_xid,
        QuantumLinkMessage::UnpairingRequest(UnpairingRequest {}),
    )
}

/// Acknowledge a Passport-initiated unpair before removing local state.
#[uniffi::export]
pub fn build_unpairing_response(
    identity: Vec<u8>,
    prime_xid: Vec<u8>,
    success: bool,
) -> Result<Vec<Vec<u8>>, QlError> {
    seal_envoy(
        &identity,
        &prime_xid,
        QuantumLinkMessage::UnpairingResponse(UnpairingResponse { success }),
    )
}

/// Ask Passport for the public EVM account derived from its per-app seed.
#[uniffi::export]
pub fn build_wdk_evm_account_request(
    identity: Vec<u8>,
    prime_xid: Vec<u8>,
    request_id: Vec<u8>,
    derivation_path: String,
    chain_id: u32,
) -> Result<Vec<Vec<u8>>, QlError> {
    validate_request(&request_id, &derivation_path, chain_id)?;
    seal_envoy(
        &identity,
        &prime_xid,
        QuantumLinkMessage::WdkEvmAccountRequest(WdkEvmAccountRequest {
            protocol_version: WDK_PROTOCOL_VERSION,
            request_id,
            derivation_path,
            chain_id,
        }),
    )
}

/// Send a fully populated canonical EIP-1559 transaction for Passport review.
#[allow(clippy::too_many_arguments)]
#[uniffi::export]
pub fn build_wdk_evm_sign_transaction_request(
    identity: Vec<u8>,
    prime_xid: Vec<u8>,
    request_id: Vec<u8>,
    derivation_path: String,
    chain_id: u32,
    nonce: u64,
    from: String,
    to: String,
    data: Vec<u8>,
    value: String,
    gas_limit: String,
    max_fee_per_gas: String,
    max_priority_fee_per_gas: String,
) -> Result<Vec<Vec<u8>>, QlError> {
    validate_request(&request_id, &derivation_path, chain_id)?;
    validate_address(&from)?;
    validate_address(&to)?;
    if data.len() > MAX_CALLDATA_LEN {
        return Err(QlError::Failed("transaction calldata is too large".into()));
    }
    validate_decimal("value", &value)?;
    validate_decimal("gas_limit", &gas_limit)?;
    validate_decimal("max_fee_per_gas", &max_fee_per_gas)?;
    validate_decimal("max_priority_fee_per_gas", &max_priority_fee_per_gas)?;

    seal_envoy(
        &identity,
        &prime_xid,
        QuantumLinkMessage::WdkEvmSignTransactionRequest(WdkEvmSignTransactionRequest {
            protocol_version: WDK_PROTOCOL_VERSION,
            request_id,
            derivation_path,
            chain_id,
            nonce,
            from,
            to,
            data,
            value,
            gas_limit,
            max_fee_per_gas,
            max_priority_fee_per_gas,
        }),
    )
}

/// Cancel a pending review request.
#[uniffi::export]
pub fn build_wdk_request_cancelled(
    identity: Vec<u8>,
    prime_xid: Vec<u8>,
    request_id: Vec<u8>,
) -> Result<Vec<Vec<u8>>, QlError> {
    validate_request_id(&request_id)?;
    seal_envoy(
        &identity,
        &prime_xid,
        QuantumLinkMessage::WdkRequestCancelled(WdkRequestCancelled {
            protocol_version: WDK_PROTOCOL_VERSION,
            request_id,
        }),
    )
}

/// Stateful BTP decoder and GSTP replay-protected unsealer.
#[derive(uniffi::Object)]
pub struct QlSession {
    identity: QuantumLinkIdentity,
    state: Mutex<DecoderState>,
}

struct DecoderState {
    dechunker: MasterDechunker<10>,
    arid_cache: ARIDCache,
    expected_peer: Option<XIDDocument>,
}

#[uniffi::export]
impl QlSession {
    #[uniffi::constructor]
    pub fn new(identity: Vec<u8>) -> Result<Arc<Self>, QlError> {
        let identity = QuantumLinkIdentity::from_bytes(&identity).map_err(QlError::msg)?;
        Ok(Arc::new(Self {
            identity,
            state: Mutex::new(DecoderState {
                dechunker: MasterDechunker::default(),
                arid_cache: ARIDCache::new(),
                expected_peer: None,
            }),
        }))
    }

    /// Pin the peer identity scanned from Passport before accepting messages.
    ///
    /// Authentication by itself only proves that a message has a valid XID
    /// signature. Pinning binds it to the specific Passport selected by the
    /// user and prevents another valid QuantumLink identity from responding.
    pub fn set_expected_peer(&self, prime_xid: Vec<u8>) -> Result<(), QlError> {
        let expected_peer = parse_xid(&prime_xid)?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| QlError::Failed("decoder lock poisoned".into()))?;
        state.expected_peer = Some(expected_peer);
        Ok(())
    }

    /// Feed one BLE notification. Returns a message only after complete,
    /// authenticated reassembly.
    pub fn feed(&self, frame: Vec<u8>) -> Result<Option<DecodedMessage>, QlError> {
        let chunk = Chunk::decode(&frame)
            .map_err(|error| QlError::Failed(format!("invalid BTP chunk: {error:?}")))?;
        let mut state = self
            .state
            .lock()
            .map_err(|_| QlError::Failed("decoder lock poisoned".into()))?;
        let Some(data) = state.dechunker.insert_chunk(chunk) else {
            return Ok(None);
        };
        let envelope = Envelope::try_from_cbor_data(data).map_err(QlError::msg)?;
        let private_keys = self
            .identity
            .private_keys
            .as_ref()
            .ok_or_else(|| QlError::Failed("identity contains no private keys".into()))?;
        let (message, sender) = PassportMessage::unseal_passport_message_with_replay_check(
            &envelope,
            private_keys,
            &mut state.arid_cache,
        )
        .map_err(QlError::msg)?;
        if state.expected_peer.as_ref() != Some(&sender) {
            return Err(QlError::Failed(
                "QuantumLink response came from an unexpected identity".into(),
            ));
        }

        let decoded = match message.message {
            QuantumLinkMessage::PairingResponse(response) => {
                let mut decoded = DecodedMessage::kind("PairingResponse");
                decoded.device_name = response
                    .device_name
                    .unwrap_or_else(|| "Passport Prime".into());
                decoded
            }
            QuantumLinkMessage::Heartbeat(_) => DecodedMessage::kind("Heartbeat"),
            QuantumLinkMessage::UnpairingRequest(_) => DecodedMessage::kind("UnpairingRequest"),
            QuantumLinkMessage::UnpairingResponse(response) => {
                let mut decoded = DecodedMessage::kind("UnpairingResponse");
                decoded.reason_code = u8::from(response.success);
                decoded
            }
            QuantumLinkMessage::WdkEvmAccountResponse(response) => {
                validate_response_version(response.protocol_version)?;
                validate_request_id(&response.request_id)?;
                if response.derivation_path != EVM_ACCOUNT_PATH {
                    return Err(QlError::Failed(
                        "Passport returned an unexpected derivation path".into(),
                    ));
                }
                validate_address(&response.address)?;
                if response.public_key.len() != 33 && response.public_key.len() != 65 {
                    return Err(QlError::Failed(
                        "Passport returned an invalid EVM public key".into(),
                    ));
                }
                let mut decoded = DecodedMessage::kind("WdkEvmAccountResponse");
                decoded.request_id = response.request_id;
                decoded.derivation_path = response.derivation_path;
                decoded.address = response.address;
                decoded.public_key = response.public_key;
                decoded
            }
            QuantumLinkMessage::WdkEvmSignTransactionResponse(response) => {
                validate_response_version(response.protocol_version)?;
                validate_request_id(&response.request_id)?;
                validate_address(&response.address)?;
                if response.signed_transaction.is_empty()
                    || response.signed_transaction.len() > MAX_SIGNED_TRANSACTION_LEN
                {
                    return Err(QlError::Failed(
                        "Passport returned an invalid signed transaction".into(),
                    ));
                }
                let mut decoded = DecodedMessage::kind("WdkEvmSignTransactionResponse");
                decoded.request_id = response.request_id;
                decoded.address = response.address;
                decoded.signed_transaction = response.signed_transaction;
                decoded
            }
            QuantumLinkMessage::WdkRequestRejected(response) => {
                validate_response_version(response.protocol_version)?;
                validate_request_id(&response.request_id)?;
                let mut decoded = DecodedMessage::kind("WdkRequestRejected");
                decoded.request_id = response.request_id;
                decoded.reason_code = response.reason_code;
                decoded.message = response.message;
                decoded
            }
            QuantumLinkMessage::WdkRequestCancelled(response) => {
                validate_response_version(response.protocol_version)?;
                validate_request_id(&response.request_id)?;
                let mut decoded = DecodedMessage::kind("WdkRequestCancelled");
                decoded.request_id = response.request_id;
                decoded
            }
            _ => DecodedMessage::kind("Other"),
        };

        Ok(Some(decoded))
    }
}

fn validate_response_version(version: u8) -> Result<(), QlError> {
    if version != WDK_PROTOCOL_VERSION {
        return Err(QlError::Failed(
            "unsupported Passport WDK protocol version".into(),
        ));
    }
    Ok(())
}

fn validate_request(
    request_id: &[u8],
    derivation_path: &str,
    chain_id: u32,
) -> Result<(), QlError> {
    validate_request_id(request_id)?;
    if derivation_path != EVM_ACCOUNT_PATH {
        return Err(QlError::Failed("unsupported derivation path".into()));
    }
    if chain_id != WDK_SEPOLIA_CHAIN_ID {
        return Err(QlError::Failed("unsupported EVM chain".into()));
    }
    Ok(())
}

fn validate_request_id(request_id: &[u8]) -> Result<(), QlError> {
    if request_id.len() != REQUEST_ID_LEN {
        return Err(QlError::Failed("request ID must be 128 bits".into()));
    }
    Ok(())
}

fn validate_address(address: &str) -> Result<(), QlError> {
    if address.len() != EVM_ADDRESS_LEN
        || !address.starts_with("0x")
        || !address[2..].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(QlError::Failed("invalid EVM address".into()));
    }
    Ok(())
}

fn validate_decimal(field: &str, value: &str) -> Result<(), QlError> {
    let canonical = value == "0"
        || (!value.is_empty()
            && !value.starts_with('0')
            && value.len() <= MAX_DECIMAL_LEN
            && value.bytes().all(|byte| byte.is_ascii_digit()));
    if !canonical {
        return Err(QlError::Failed(format!(
            "{field} is not a canonical unsigned decimal"
        )));
    }
    Ok(())
}

fn parse_xid(cbor: &[u8]) -> Result<XIDDocument, QlError> {
    let cbor = CBOR::try_from_data(cbor).map_err(QlError::msg)?;
    XIDDocument::try_from(cbor).map_err(QlError::msg)
}

fn seal_envoy(
    identity: &[u8],
    prime_xid: &[u8],
    message: QuantumLinkMessage,
) -> Result<Vec<Vec<u8>>, QlError> {
    let identity = QuantumLinkIdentity::from_bytes(identity).map_err(QlError::msg)?;
    let recipient = parse_xid(prime_xid)?;
    let private_keys = identity
        .private_keys
        .as_ref()
        .ok_or_else(|| QlError::Failed("identity contains no private keys".into()))?;
    let envelope = EnvoyMessage {
        message,
        timestamp: now_secs(),
        protocol_version: Some(PROTOCOL_VERSION),
    }
    .seal((private_keys, &identity.xid_document), &recipient);
    Ok(frames(&envelope.to_cbor_data()))
}

fn frames(cbor: &[u8]) -> Vec<Vec<u8>> {
    chunk(cbor).map(|chunk| chunk.to_vec()).collect()
}

fn now_secs() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as u32)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use foundation_api::pairing::PairingResponse;
    use foundation_api::passport::{
        PassportColor, PassportFirmwareVersion, PassportModel, PassportSerial,
    };
    use foundation_api::status::DeviceStatus;

    #[test]
    fn validates_canonical_decimal_quantities() {
        assert!(validate_decimal("value", "0").is_ok());
        assert!(validate_decimal("value", "1000000").is_ok());
        assert!(validate_decimal("value", "").is_err());
        assert!(validate_decimal("value", "01").is_err());
        assert!(validate_decimal("value", "-1").is_err());
    }

    #[test]
    fn enforces_request_scope() {
        let request_id = [0_u8; REQUEST_ID_LEN];
        assert!(validate_request(&request_id, EVM_ACCOUNT_PATH, WDK_SEPOLIA_CHAIN_ID).is_ok());
        assert!(validate_request(&request_id, "m/44'/60'/0'/0/1", WDK_SEPOLIA_CHAIN_ID).is_err());
        assert!(validate_request(&request_id, EVM_ACCOUNT_PATH, 1).is_err());
        assert!(
            validate_request(&request_id[..15], EVM_ACCOUNT_PATH, WDK_SEPOLIA_CHAIN_ID).is_err()
        );
    }

    #[test]
    fn rejects_authenticated_messages_from_an_unpinned_passport() {
        let phone = QuantumLinkIdentity::generate();
        let expected_passport = QuantumLinkIdentity::generate();
        let other_passport = QuantumLinkIdentity::generate();
        let session = QlSession::new(phone.to_bytes()).unwrap();
        session
            .set_expected_peer(expected_passport.xid_document.to_cbor_data())
            .unwrap();

        let message = PassportMessage {
            message: QuantumLinkMessage::WdkRequestCancelled(WdkRequestCancelled {
                protocol_version: WDK_PROTOCOL_VERSION,
                request_id: vec![7; REQUEST_ID_LEN],
            }),
            status: DeviceStatus {
                version: "test".into(),
                battery_level: 100,
            },
            protocol_version: Some(PROTOCOL_VERSION),
        };
        let envelope = message.seal(
            (
                other_passport.private_keys.as_ref().unwrap(),
                &other_passport.xid_document,
            ),
            &phone.xid_document,
        );

        let mut result = Ok(None);
        for frame in frames(&envelope.to_cbor_data()) {
            result = session.feed(frame);
        }
        assert!(matches!(
            result,
            Err(QlError::Failed(message)) if message.contains("unexpected identity")
        ));
    }

    #[test]
    fn decodes_pairing_response_from_pinned_passport() {
        let phone = QuantumLinkIdentity::generate();
        let passport = QuantumLinkIdentity::generate();
        let session = QlSession::new(phone.to_bytes()).unwrap();
        session
            .set_expected_peer(passport.xid_document.to_cbor_data())
            .unwrap();

        let message = PassportMessage {
            message: QuantumLinkMessage::PairingResponse(PairingResponse {
                passport_model: PassportModel::Prime,
                passport_firmware_version: PassportFirmwareVersion("poc".into()),
                passport_serial: PassportSerial("TEST".into()),
                passport_color: PassportColor::Dark,
                onboarding_complete: true,
                device_name: Some("Passport Prime".into()),
            }),
            status: DeviceStatus {
                version: "test".into(),
                battery_level: 100,
            },
            protocol_version: Some(PROTOCOL_VERSION),
        };
        let envelope = message.seal(
            (
                passport.private_keys.as_ref().unwrap(),
                &passport.xid_document,
            ),
            &phone.xid_document,
        );

        let mut decoded = None;
        for frame in frames(&envelope.to_cbor_data()) {
            decoded = session.feed(frame).unwrap().or(decoded);
        }
        let decoded = decoded.expect("pairing response should reassemble");
        assert_eq!(decoded.kind, "PairingResponse");
        assert_eq!(decoded.device_name, "Passport Prime");
    }

    #[test]
    fn decodes_heartbeat_and_builds_authenticated_response() {
        let phone = QuantumLinkIdentity::generate();
        let passport = QuantumLinkIdentity::generate();
        let session = QlSession::new(phone.to_bytes()).unwrap();
        session
            .set_expected_peer(passport.xid_document.to_cbor_data())
            .unwrap();

        let message = PassportMessage {
            message: QuantumLinkMessage::Heartbeat(Heartbeat {}),
            status: DeviceStatus {
                version: "test".into(),
                battery_level: 100,
            },
            protocol_version: Some(PROTOCOL_VERSION),
        };
        let envelope = message.seal(
            (
                passport.private_keys.as_ref().unwrap(),
                &passport.xid_document,
            ),
            &phone.xid_document,
        );

        let mut decoded = None;
        for frame in frames(&envelope.to_cbor_data()) {
            decoded = session.feed(frame).unwrap().or(decoded);
        }
        assert_eq!(decoded.expect("heartbeat should reassemble").kind, "Heartbeat");
        assert!(!build_heartbeat_response(
            phone.to_bytes(),
            passport.xid_document.to_cbor_data()
        )
        .unwrap()
        .is_empty());
    }
}
