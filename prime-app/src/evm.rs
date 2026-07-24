// SPDX-FileCopyrightText: 2026 Foundation Devices, Inc. <hello@foundation.xyz>
// SPDX-License-Identifier: GPL-3.0-or-later

//! Minimal, policy-constrained EVM signer for the Passport Tether WDK POC.
//!
//! The phone supplies canonical transaction fields, never a digest. This module
//! independently validates those fields, reconstructs the EIP-1559 payload,
//! renders review data, and serializes the signed transaction.

use std::str::FromStr as _;

use bitcoin::{
    bip32::{DerivationPath, Xpriv},
    secp256k1::{Message, PublicKey, Secp256k1},
    NetworkKind,
};
use quantum_link::foundation_api::wdk::{
    WdkEvmAccountRequest, WdkEvmAccountResponse, WdkEvmSignTransactionRequest, WdkEvmSignTransactionResponse,
    WDK_PROTOCOL_VERSION, WDK_SEPOLIA_CHAIN_ID,
};
use sha3::{Digest as _, Keccak256};
use zeroize::Zeroizing;

pub const EVM_PATH: &str = "m/44'/60'/0'/0/0";
pub const SEPOLIA_USDT: &str = "0xd077a400968890eacc75cdc901f0356c943e4fdb";
const ERC20_TRANSFER_SELECTOR: [u8; 4] = [0xa9, 0x05, 0x9c, 0xbb];

const MAX_CALLDATA_BYTES: usize = 4_096;
const MAX_GAS_LIMIT: u128 = 2_000_000;
const MAX_FEE_PER_GAS: u128 = 1_000_000_000_000;
const MAX_TOTAL_FEE_WEI: u128 = 50_000_000_000_000_000;
const MAX_NATIVE_VALUE_WEI: u128 = 1_000_000_000_000_000_000_000;
const MAX_USDT_BASE_UNITS: u128 = 1_000_000_000_000_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyError {
    Protocol,
    RequestId,
    DerivationPath,
    Chain,
    Address,
    Quantity(&'static str),
    Fee,
    UnsupportedCall,
    Token,
    Value,
    Signature,
}

impl std::fmt::Display for PolicyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Protocol => f.write_str("Unsupported protocol version"),
            Self::RequestId => f.write_str("Invalid request ID"),
            Self::DerivationPath => f.write_str("Unsupported derivation path"),
            Self::Chain => f.write_str("Only Ethereum Sepolia is enabled"),
            Self::Address => f.write_str("Invalid or unexpected Ethereum address"),
            Self::Quantity(field) => write!(f, "Invalid {field}"),
            Self::Fee => f.write_str("Network fee exceeds Passport policy"),
            Self::UnsupportedCall => f.write_str("Unsupported smart-contract call"),
            Self::Token => f.write_str("Only the configured Sepolia USD₮ contract is enabled"),
            Self::Value => f.write_str("Transfer value exceeds Passport policy"),
            Self::Signature => f.write_str("Could not create an Ethereum signature"),
        }
    }
}

impl std::error::Error for PolicyError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Asset {
    Eth,
    Usdt,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Review {
    pub asset: Asset,
    pub amount: String,
    pub recipient: String,
    pub maximum_fee: String,
}

#[derive(Debug, Clone)]
pub struct PreparedTransaction {
    pub request: WdkEvmSignTransactionRequest,
    pub review: Review,
}

pub struct EvmWallet {
    app_seed: Zeroizing<[u8; 32]>,
}

struct SecretKeyGuard(bitcoin::secp256k1::SecretKey);

impl std::ops::Deref for SecretKeyGuard {
    type Target = bitcoin::secp256k1::SecretKey;

    fn deref(&self) -> &Self::Target { &self.0 }
}

impl Drop for SecretKeyGuard {
    fn drop(&mut self) { self.0.non_secure_erase() }
}

impl EvmWallet {
    pub fn new(app_seed: [u8; 32]) -> Self { Self { app_seed: Zeroizing::new(app_seed) } }

    pub fn address(&self) -> Result<String, PolicyError> {
        let secret = self.derive_secret()?;
        Ok(address_from_secret(&secret))
    }

    pub fn account_response(
        &self,
        request: &WdkEvmAccountRequest,
    ) -> Result<WdkEvmAccountResponse, PolicyError> {
        validate_scope(
            request.protocol_version,
            &request.request_id,
            &request.derivation_path,
            request.chain_id,
        )?;
        let secret = self.derive_secret()?;
        let secp = Secp256k1::new();
        let public_key = PublicKey::from_secret_key(&secp, &secret);
        Ok(WdkEvmAccountResponse {
            protocol_version: WDK_PROTOCOL_VERSION,
            request_id: request.request_id.clone(),
            derivation_path: EVM_PATH.to_owned(),
            address: address_from_public_key(&public_key),
            public_key: public_key.serialize().to_vec(),
        })
    }

    pub fn prepare(&self, request: WdkEvmSignTransactionRequest) -> Result<PreparedTransaction, PolicyError> {
        validate_scope(
            request.protocol_version,
            &request.request_id,
            &request.derivation_path,
            request.chain_id,
        )?;
        if request.data.len() > MAX_CALLDATA_BYTES {
            return Err(PolicyError::UnsupportedCall);
        }

        let expected_from = self.address()?;
        if parse_checked_address(&request.from)? != parse_checked_address(&expected_from)? {
            return Err(PolicyError::Address);
        }

        let to = parse_checked_address(&request.to)?;
        if to == [0; 20] {
            return Err(PolicyError::Address);
        }
        let value = parse_decimal_u128(&request.value, "value")?;
        let gas_limit = parse_decimal_u128(&request.gas_limit, "gas limit")?;
        let max_fee = parse_decimal_u128(&request.max_fee_per_gas, "maximum fee")?;
        let priority_fee = parse_decimal_u128(&request.max_priority_fee_per_gas, "priority fee")?;

        if gas_limit == 0 || gas_limit > MAX_GAS_LIMIT || max_fee > MAX_FEE_PER_GAS || priority_fee > max_fee
        {
            return Err(PolicyError::Fee);
        }
        let total_fee = gas_limit.checked_mul(max_fee).ok_or(PolicyError::Fee)?;
        if total_fee > MAX_TOTAL_FEE_WEI {
            return Err(PolicyError::Fee);
        }

        let (asset, amount, recipient) = if request.data.is_empty() {
            if value == 0 || value > MAX_NATIVE_VALUE_WEI {
                return Err(PolicyError::Value);
            }
            (Asset::Eth, format_units(value, 18), checksum_address(&to))
        } else {
            if to != parse_checked_address(SEPOLIA_USDT)? {
                return Err(PolicyError::Token);
            }
            if value != 0 {
                return Err(PolicyError::Value);
            }
            let (recipient, amount) = decode_erc20_transfer(&request.data)?;
            if recipient == [0; 20] {
                return Err(PolicyError::Address);
            }
            if amount == 0 || amount > MAX_USDT_BASE_UNITS {
                return Err(PolicyError::Value);
            }
            (Asset::Usdt, format_units(amount, 6), checksum_address(&recipient))
        };

        Ok(PreparedTransaction {
            request,
            review: Review { asset, amount, recipient, maximum_fee: format_units(total_fee, 18) },
        })
    }

    pub fn sign(&self, prepared: &PreparedTransaction) -> Result<WdkEvmSignTransactionResponse, PolicyError> {
        // Re-run policy immediately before signing so approval is always bound
        // to the exact transaction that was rendered.
        let checked = self.prepare(prepared.request.clone())?;
        if checked.review != prepared.review {
            return Err(PolicyError::UnsupportedCall);
        }

        let secret = self.derive_secret()?;
        let unsigned_fields = unsigned_fields(&checked.request)?;
        let unsigned_rlp = rlp_list(&unsigned_fields);
        let mut signing_payload = Vec::with_capacity(unsigned_rlp.len() + 1);
        signing_payload.push(0x02);
        signing_payload.extend_from_slice(&unsigned_rlp);
        let digest: [u8; 32] = Keccak256::digest(&signing_payload).into();

        let secp = Secp256k1::new();
        let signature = secp.sign_ecdsa_recoverable(&Message::from_digest(digest), &secret);
        let (recovery_id, compact) = signature.serialize_compact();
        let parity = recovery_id.to_i32();
        if !(0..=1).contains(&parity) {
            return Err(PolicyError::Signature);
        }

        let mut signed_fields = unsigned_fields;
        signed_fields.push(rlp_integer_u128(parity as u128));
        signed_fields.push(rlp_integer_bytes(&compact[..32]));
        signed_fields.push(rlp_integer_bytes(&compact[32..]));
        let signed_rlp = rlp_list(&signed_fields);
        let mut signed_transaction = Vec::with_capacity(signed_rlp.len() + 1);
        signed_transaction.push(0x02);
        signed_transaction.extend_from_slice(&signed_rlp);

        Ok(WdkEvmSignTransactionResponse {
            protocol_version: WDK_PROTOCOL_VERSION,
            request_id: checked.request.request_id,
            address: self.address()?,
            signed_transaction,
        })
    }

    fn derive_secret(&self) -> Result<SecretKeyGuard, PolicyError> {
        let secp = Secp256k1::new();
        let path = DerivationPath::from_str(EVM_PATH).map_err(|_| PolicyError::DerivationPath)?;
        let mut master = Xpriv::new_master(NetworkKind::Test, self.app_seed.as_ref())
            .map_err(|_| PolicyError::DerivationPath)?;
        let mut child = master.derive_priv(&secp, &path).map_err(|_| PolicyError::DerivationPath)?;
        let secret = SecretKeyGuard(child.private_key);
        master.private_key.non_secure_erase();
        child.private_key.non_secure_erase();
        Ok(secret)
    }
}

fn validate_scope(
    protocol_version: u8,
    request_id: &[u8],
    path: &str,
    chain_id: u32,
) -> Result<(), PolicyError> {
    if protocol_version != WDK_PROTOCOL_VERSION {
        return Err(PolicyError::Protocol);
    }
    if request_id.len() != 16 {
        return Err(PolicyError::RequestId);
    }
    if path != EVM_PATH {
        return Err(PolicyError::DerivationPath);
    }
    if chain_id != WDK_SEPOLIA_CHAIN_ID {
        return Err(PolicyError::Chain);
    }
    Ok(())
}

fn address_from_secret(secret: &bitcoin::secp256k1::SecretKey) -> String {
    let public_key = PublicKey::from_secret_key(&Secp256k1::new(), secret);
    address_from_public_key(&public_key)
}

fn address_from_public_key(public_key: &PublicKey) -> String {
    let uncompressed = public_key.serialize_uncompressed();
    let digest = Keccak256::digest(&uncompressed[1..]);
    let mut bytes = [0u8; 20];
    bytes.copy_from_slice(&digest[12..]);
    checksum_address(&bytes)
}

fn parse_checked_address(value: &str) -> Result<[u8; 20], PolicyError> {
    let raw = value.strip_prefix("0x").ok_or(PolicyError::Address)?;
    if raw.len() != 40 || !raw.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(PolicyError::Address);
    }
    let decoded = hex::decode(raw).map_err(|_| PolicyError::Address)?;
    let mut address = [0u8; 20];
    address.copy_from_slice(&decoded);

    let is_lower = raw.bytes().all(|b| !b.is_ascii_alphabetic() || b.is_ascii_lowercase());
    let is_upper = raw.bytes().all(|b| !b.is_ascii_alphabetic() || b.is_ascii_uppercase());
    if !is_lower && !is_upper && checksum_address(&address)[2..] != *raw {
        return Err(PolicyError::Address);
    }
    Ok(address)
}

fn checksum_address(address: &[u8; 20]) -> String {
    let lower = hex::encode(address);
    let hash = hex::encode(Keccak256::digest(lower.as_bytes()));
    let mut result = String::with_capacity(42);
    result.push_str("0x");
    for (index, ch) in lower.bytes().enumerate() {
        if ch.is_ascii_alphabetic() && hash.as_bytes()[index] >= b'8' {
            result.push((ch as char).to_ascii_uppercase());
        } else {
            result.push(ch as char);
        }
    }
    result
}

fn parse_decimal_u128(value: &str, field: &'static str) -> Result<u128, PolicyError> {
    if value.is_empty()
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(PolicyError::Quantity(field));
    }
    value.parse::<u128>().map_err(|_| PolicyError::Quantity(field))
}

fn decode_erc20_transfer(data: &[u8]) -> Result<([u8; 20], u128), PolicyError> {
    if data.len() != 68 || data[..4] != ERC20_TRANSFER_SELECTOR {
        return Err(PolicyError::UnsupportedCall);
    }
    if data[4..16].iter().any(|byte| *byte != 0) {
        return Err(PolicyError::UnsupportedCall);
    }
    if data[36..52].iter().any(|byte| *byte != 0) {
        return Err(PolicyError::Value);
    }
    let mut recipient = [0u8; 20];
    recipient.copy_from_slice(&data[16..36]);
    let amount = u128::from_be_bytes(data[52..68].try_into().expect("16-byte amount"));
    Ok((recipient, amount))
}

fn unsigned_fields(request: &WdkEvmSignTransactionRequest) -> Result<Vec<Vec<u8>>, PolicyError> {
    let to = parse_checked_address(&request.to)?;
    let value = parse_decimal_u128(&request.value, "value")?;
    let gas_limit = parse_decimal_u128(&request.gas_limit, "gas limit")?;
    let max_fee = parse_decimal_u128(&request.max_fee_per_gas, "maximum fee")?;
    let priority_fee = parse_decimal_u128(&request.max_priority_fee_per_gas, "priority fee")?;

    Ok(vec![
        rlp_integer_u128(request.chain_id as u128),
        rlp_integer_u128(request.nonce as u128),
        rlp_integer_u128(priority_fee),
        rlp_integer_u128(max_fee),
        rlp_integer_u128(gas_limit),
        rlp_bytes(&to),
        rlp_integer_u128(value),
        rlp_bytes(&request.data),
        rlp_list(&[]),
    ])
}

fn rlp_integer_u128(value: u128) -> Vec<u8> {
    if value == 0 {
        return rlp_bytes(&[]);
    }
    let bytes = value.to_be_bytes();
    rlp_integer_bytes(&bytes)
}

fn rlp_integer_bytes(bytes: &[u8]) -> Vec<u8> {
    let first = bytes.iter().position(|byte| *byte != 0).unwrap_or(bytes.len());
    rlp_bytes(&bytes[first..])
}

fn rlp_bytes(bytes: &[u8]) -> Vec<u8> {
    if bytes.len() == 1 && bytes[0] < 0x80 {
        return bytes.to_vec();
    }
    let mut encoded = length_prefix(bytes.len(), 0x80, 0xb7);
    encoded.extend_from_slice(bytes);
    encoded
}

fn rlp_list(items: &[Vec<u8>]) -> Vec<u8> {
    let payload_len: usize = items.iter().map(Vec::len).sum();
    let mut encoded = length_prefix(payload_len, 0xc0, 0xf7);
    for item in items {
        encoded.extend_from_slice(item);
    }
    encoded
}

fn length_prefix(length: usize, short_base: u8, long_base: u8) -> Vec<u8> {
    if length <= 55 {
        return vec![short_base + length as u8];
    }
    let bytes = length.to_be_bytes();
    let first = bytes.iter().position(|byte| *byte != 0).unwrap_or(bytes.len() - 1);
    let length_bytes = &bytes[first..];
    let mut prefix = Vec::with_capacity(length_bytes.len() + 1);
    prefix.push(long_base + length_bytes.len() as u8);
    prefix.extend_from_slice(length_bytes);
    prefix
}

fn format_units(value: u128, decimals: usize) -> String {
    let mut digits = value.to_string();
    if decimals == 0 {
        return digits;
    }
    if digits.len() <= decimals {
        digits.insert_str(0, &"0".repeat(decimals + 1 - digits.len()));
    }
    let split = digits.len() - decimals;
    digits.insert(split, '.');
    while digits.ends_with('0') {
        digits.pop();
    }
    if digits.ends_with('.') {
        digits.push('0');
    }
    digits
}

#[cfg(test)]
mod tests {
    use super::*;

    const SEED: [u8; 32] = [0x42; 32];

    fn base_request() -> WdkEvmSignTransactionRequest {
        let wallet = EvmWallet::new(SEED);
        WdkEvmSignTransactionRequest {
            protocol_version: WDK_PROTOCOL_VERSION,
            request_id: vec![7; 16],
            derivation_path: EVM_PATH.to_owned(),
            chain_id: WDK_SEPOLIA_CHAIN_ID,
            nonce: 3,
            from: wallet.address().unwrap(),
            to: "0x000000000000000000000000000000000000dEaD".to_owned(),
            data: Vec::new(),
            value: "1000000000000000".to_owned(),
            gas_limit: "21000".to_owned(),
            max_fee_per_gas: "20000000000".to_owned(),
            max_priority_fee_per_gas: "1000000000".to_owned(),
        }
    }

    #[test]
    fn derives_stable_checksummed_account() {
        let wallet = EvmWallet::new(SEED);
        assert_eq!(wallet.address().unwrap(), "0x62B9Ff08BE97E6d49D3d68BA1D26870a417AA58e");
    }

    #[test]
    fn signs_native_eip1559_transaction() {
        let wallet = EvmWallet::new(SEED);
        let prepared = wallet.prepare(base_request()).unwrap();
        assert_eq!(prepared.review.asset, Asset::Eth);
        assert_eq!(prepared.review.amount, "0.001");
        let response = wallet.sign(&prepared).unwrap();
        assert_eq!(
            hex::encode(response.signed_transaction),
            concat!(
                "02f87583aa36a703843b9aca008504a817c800825208",
                "94000000000000000000000000000000000000dead",
                "87038d7ea4c6800080c001a0d364edf04339f52e38f023468a41dd88365582d71c684ecb",
                "3e784b1c03aedf67a06cfeb776448014aa0074b71f7cfa81bc8d8ae1af977d29b50c6b9",
                "93af6bf5f84"
            )
        );
    }

    #[test]
    fn accepts_only_allowlisted_usdt_transfer() {
        let wallet = EvmWallet::new(SEED);
        let mut request = base_request();
        request.to = SEPOLIA_USDT.to_owned();
        request.value = "0".to_owned();
        request.data = hex::decode(concat!(
            "a9059cbb",
            "000000000000000000000000000000000000000000000000000000000000dead",
            "00000000000000000000000000000000000000000000000000000000000f4240"
        ))
        .unwrap();
        let prepared = wallet.prepare(request).unwrap();
        assert_eq!(prepared.review.asset, Asset::Usdt);
        assert_eq!(prepared.review.amount, "1.0");
        assert_eq!(prepared.review.recipient, "0x000000000000000000000000000000000000dEaD");
    }

    #[test]
    fn rejects_wrong_chain_unknown_call_and_excessive_fee() {
        let wallet = EvmWallet::new(SEED);

        let mut wrong_chain = base_request();
        wrong_chain.chain_id = 1;
        assert_eq!(wallet.prepare(wrong_chain).unwrap_err(), PolicyError::Chain);

        let mut approval = base_request();
        approval.to = SEPOLIA_USDT.to_owned();
        approval.value = "0".to_owned();
        approval.data = hex::decode("095ea7b3").unwrap();
        assert_eq!(wallet.prepare(approval).unwrap_err(), PolicyError::UnsupportedCall);

        let mut expensive = base_request();
        expensive.max_fee_per_gas = "1000000000001".to_owned();
        assert_eq!(wallet.prepare(expensive).unwrap_err(), PolicyError::Fee);
    }

    #[test]
    fn enforces_canonical_quantities_and_checksum() {
        let wallet = EvmWallet::new(SEED);
        let mut leading_zero = base_request();
        leading_zero.value = "01".to_owned();
        assert!(matches!(wallet.prepare(leading_zero), Err(PolicyError::Quantity("value"))));

        let mut bad_checksum = base_request();
        bad_checksum.to = "0x000000000000000000000000000000000000DEaD".to_owned();
        assert_eq!(wallet.prepare(bad_checksum).unwrap_err(), PolicyError::Address);
    }

    #[test]
    fn rejects_zero_native_and_token_recipients() {
        let wallet = EvmWallet::new(SEED);

        let mut native = base_request();
        native.to = "0x0000000000000000000000000000000000000000".to_owned();
        assert_eq!(wallet.prepare(native).unwrap_err(), PolicyError::Address);

        let mut token = base_request();
        token.to = SEPOLIA_USDT.to_owned();
        token.value = "0".to_owned();
        token.data = hex::decode(concat!(
            "a9059cbb",
            "0000000000000000000000000000000000000000000000000000000000000000",
            "00000000000000000000000000000000000000000000000000000000000f4240"
        ))
        .unwrap();
        assert_eq!(wallet.prepare(token).unwrap_err(), PolicyError::Address);
    }
}
