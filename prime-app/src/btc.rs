// SPDX-FileCopyrightText: 2026 Foundation Devices, Inc. <hello@foundation.xyz>
// SPDX-License-Identifier: GPL-3.0-or-later

//! Policy-constrained Bitcoin testnet signer for the Tether WDK POC.
//!
//! The phone may select UTXOs and construct a PSBT, but Passport Prime derives
//! the account independently, verifies every input and output, renders the
//! authoritative transfer review, and signs only native SegWit BIP-84 spends.

use std::str::FromStr as _;

use bitcoin::{
    bip32::{DerivationPath, Xpriv},
    consensus::encode::serialize,
    ecdsa,
    psbt::Psbt,
    secp256k1::{PublicKey, Secp256k1},
    sighash::{EcdsaSighashType, SighashCache},
    Address, CompressedPublicKey, Network, NetworkKind, Witness,
};
use quantum_link::foundation_api::wdk::{
    WdkBtcAccountRequest, WdkBtcAccountResponse, WdkBtcSignPsbtRequest, WdkBtcSignPsbtResponse,
    WDK_BITCOIN_TESTNET, WDK_PROTOCOL_VERSION,
};
use zeroize::Zeroizing;

pub const BTC_PATH: &str = "m/84'/1'/0'/0/0";

const MAX_PSBT_BYTES: usize = 65_536;
const MAX_INPUTS: usize = 50;
const MAX_OUTPUTS: usize = 2;
const MAX_FEE_SATS: u64 = 1_000_000;
const MAX_SEND_SATS: u64 = 21_000_000 * 100_000_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyError {
    Protocol,
    RequestId,
    DerivationPath,
    Network,
    Psbt,
    Inputs,
    Outputs,
    Address,
    Fee,
    Value,
    Signature,
}

impl std::fmt::Display for PolicyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Protocol => f.write_str("Unsupported protocol version"),
            Self::RequestId => f.write_str("Invalid request ID"),
            Self::DerivationPath => f.write_str("Unsupported Bitcoin derivation path"),
            Self::Network => f.write_str("Only Bitcoin testnet is enabled"),
            Self::Psbt => f.write_str("Invalid Bitcoin transaction"),
            Self::Inputs => f.write_str("Bitcoin inputs are not owned by this Passport"),
            Self::Outputs => f.write_str("Bitcoin transaction outputs are not supported"),
            Self::Address => f.write_str("Invalid Bitcoin recipient"),
            Self::Fee => f.write_str("Bitcoin network fee exceeds Passport policy"),
            Self::Value => f.write_str("Invalid Bitcoin transfer amount"),
            Self::Signature => f.write_str("Could not create a Bitcoin signature"),
        }
    }
}

impl std::error::Error for PolicyError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Review {
    pub amount: String,
    pub recipient: String,
    pub maximum_fee: String,
}

#[derive(Debug, Clone)]
pub struct PreparedTransaction {
    pub request: WdkBtcSignPsbtRequest,
    pub review: Review,
}

pub struct BtcWallet {
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

impl BtcWallet {
    pub fn new(app_seed: [u8; 32]) -> Self { Self { app_seed: Zeroizing::new(app_seed) } }

    pub fn address(&self) -> Result<String, PolicyError> {
        let (_, public_key) = self.keypair()?;
        Ok(Address::p2wpkh(&public_key, Network::Testnet).to_string())
    }

    pub fn account_response(
        &self,
        request: &WdkBtcAccountRequest,
    ) -> Result<WdkBtcAccountResponse, PolicyError> {
        validate_scope(
            request.protocol_version,
            &request.request_id,
            &request.derivation_path,
            request.network,
        )?;
        let (_, public_key) = self.keypair()?;
        Ok(WdkBtcAccountResponse {
            protocol_version: WDK_PROTOCOL_VERSION,
            request_id: request.request_id.clone(),
            derivation_path: BTC_PATH.to_owned(),
            address: Address::p2wpkh(&public_key, Network::Testnet).to_string(),
            public_key: public_key.to_bytes().to_vec(),
        })
    }

    pub fn prepare(&self, request: WdkBtcSignPsbtRequest) -> Result<PreparedTransaction, PolicyError> {
        validate_scope(
            request.protocol_version,
            &request.request_id,
            &request.derivation_path,
            request.network,
        )?;
        if request.psbt.is_empty() || request.psbt.len() > MAX_PSBT_BYTES {
            return Err(PolicyError::Psbt);
        }
        let psbt = Psbt::deserialize(&request.psbt).map_err(|_| PolicyError::Psbt)?;
        if psbt.inputs.is_empty()
            || psbt.inputs.len() != psbt.unsigned_tx.input.len()
            || psbt.inputs.len() > MAX_INPUTS
        {
            return Err(PolicyError::Inputs);
        }
        if psbt.unsigned_tx.output.is_empty()
            || psbt.unsigned_tx.output.len() > MAX_OUTPUTS
            || psbt.outputs.len() != psbt.unsigned_tx.output.len()
        {
            return Err(PolicyError::Outputs);
        }

        let (_, public_key) = self.keypair()?;
        let account_address = Address::p2wpkh(&public_key, Network::Testnet);
        let account_script = account_address.script_pubkey();
        let mut total_input = 0_u64;
        for (txin, input) in psbt.unsigned_tx.input.iter().zip(&psbt.inputs) {
            if !txin.script_sig.is_empty() || !txin.witness.is_empty() {
                return Err(PolicyError::Psbt);
            }
            if input.sighash_type.is_some()
                && input.sighash_type.and_then(|kind| kind.ecdsa_hash_ty().ok())
                    != Some(EcdsaSighashType::All)
            {
                return Err(PolicyError::Inputs);
            }
            let prevout = input.witness_utxo.as_ref().ok_or(PolicyError::Inputs)?;
            if prevout.script_pubkey != account_script {
                return Err(PolicyError::Inputs);
            }
            total_input = total_input.checked_add(prevout.value.to_sat()).ok_or(PolicyError::Value)?;
        }

        let mut total_output = 0_u64;
        let mut recipient: Option<(String, u64)> = None;
        for output in &psbt.unsigned_tx.output {
            let value = output.value.to_sat();
            total_output = total_output.checked_add(value).ok_or(PolicyError::Value)?;
            if output.script_pubkey != account_script {
                if recipient.is_some() {
                    return Err(PolicyError::Outputs);
                }
                let address = Address::from_script(&output.script_pubkey, Network::Testnet)
                    .map_err(|_| PolicyError::Address)?;
                recipient = Some((address.to_string(), value));
            }
        }
        let (recipient, amount) = recipient.ok_or(PolicyError::Outputs)?;
        if amount == 0 || amount > MAX_SEND_SATS || total_output >= total_input {
            return Err(PolicyError::Value);
        }
        let fee = total_input - total_output;
        if fee == 0 || fee > MAX_FEE_SATS {
            return Err(PolicyError::Fee);
        }

        Ok(PreparedTransaction {
            request,
            review: Review { amount: format_btc(amount), recipient, maximum_fee: format_btc(fee) },
        })
    }

    pub fn sign(&self, prepared: &PreparedTransaction) -> Result<WdkBtcSignPsbtResponse, PolicyError> {
        let checked = self.prepare(prepared.request.clone())?;
        if checked.review != prepared.review {
            return Err(PolicyError::Psbt);
        }
        let mut psbt = Psbt::deserialize(&checked.request.psbt).map_err(|_| PolicyError::Psbt)?;
        let (secret, public_key) = self.keypair()?;
        let script = Address::p2wpkh(&public_key, Network::Testnet).script_pubkey();
        let unsigned = psbt.unsigned_tx.clone();
        let mut cache = SighashCache::new(&unsigned);
        let secp = Secp256k1::new();

        for index in 0..psbt.inputs.len() {
            let value = psbt.inputs[index].witness_utxo.as_ref().ok_or(PolicyError::Inputs)?.value;
            let sighash = cache
                .p2wpkh_signature_hash(index, &script, value, EcdsaSighashType::All)
                .map_err(|_| PolicyError::Signature)?;
            let signature = ecdsa::Signature::sighash_all(secp.sign_ecdsa(&sighash.into(), &secret));
            psbt.inputs[index].final_script_witness =
                Some(Witness::from_slice(&[signature.to_vec(), public_key.to_bytes().to_vec()]));
        }

        let transaction = psbt.extract_tx().map_err(|_| PolicyError::Signature)?;
        Ok(WdkBtcSignPsbtResponse {
            protocol_version: WDK_PROTOCOL_VERSION,
            request_id: checked.request.request_id,
            address: Address::p2wpkh(&public_key, Network::Testnet).to_string(),
            signed_transaction: serialize(&transaction),
        })
    }

    fn keypair(&self) -> Result<(SecretKeyGuard, CompressedPublicKey), PolicyError> {
        let secp = Secp256k1::new();
        let path = DerivationPath::from_str(BTC_PATH).map_err(|_| PolicyError::DerivationPath)?;
        let mut master = Xpriv::new_master(NetworkKind::Test, self.app_seed.as_ref())
            .map_err(|_| PolicyError::DerivationPath)?;
        let mut child = master.derive_priv(&secp, &path).map_err(|_| PolicyError::DerivationPath)?;
        let secret = SecretKeyGuard(child.private_key);
        let public_key = CompressedPublicKey(PublicKey::from_secret_key(&secp, &secret));
        master.private_key.non_secure_erase();
        child.private_key.non_secure_erase();
        Ok((secret, public_key))
    }
}

fn validate_scope(
    protocol_version: u8,
    request_id: &[u8],
    path: &str,
    network: u8,
) -> Result<(), PolicyError> {
    if protocol_version != WDK_PROTOCOL_VERSION {
        return Err(PolicyError::Protocol);
    }
    if request_id.len() != 16 {
        return Err(PolicyError::RequestId);
    }
    if path != BTC_PATH {
        return Err(PolicyError::DerivationPath);
    }
    if network != WDK_BITCOIN_TESTNET {
        return Err(PolicyError::Network);
    }
    Ok(())
}

fn format_btc(satoshis: u64) -> String {
    let whole = satoshis / 100_000_000;
    let fraction = satoshis % 100_000_000;
    if fraction == 0 {
        return whole.to_string();
    }
    let mut fraction = format!("{fraction:08}");
    while fraction.ends_with('0') {
        fraction.pop();
    }
    format!("{whole}.{fraction}")
}

#[cfg(test)]
mod tests {
    use bitcoin::{
        absolute, hashes::Hash as _, transaction, Amount, OutPoint, ScriptBuf, Sequence, Transaction, TxIn,
        TxOut, Txid,
    };

    use super::*;

    const INPUT_SATS: u64 = 125_000;
    const SEND_SATS: u64 = 100_000;
    const CHANGE_SATS: u64 = 24_000;

    fn request(wallet: &BtcWallet) -> WdkBtcSignPsbtRequest {
        let account_script = Address::from_str(&wallet.address().unwrap())
            .unwrap()
            .require_network(Network::Testnet)
            .unwrap()
            .script_pubkey();
        let recipient_script = Address::from_str(&BtcWallet::new([8; 32]).address().unwrap())
            .unwrap()
            .require_network(Network::Testnet)
            .unwrap()
            .script_pubkey();
        let transaction = Transaction {
            version: transaction::Version::TWO,
            lock_time: absolute::LockTime::ZERO,
            input: vec![TxIn {
                previous_output: OutPoint::new(Txid::all_zeros(), 0),
                script_sig: ScriptBuf::new(),
                sequence: Sequence::ENABLE_RBF_NO_LOCKTIME,
                witness: Witness::new(),
            }],
            output: vec![
                TxOut { value: Amount::from_sat(SEND_SATS), script_pubkey: recipient_script },
                TxOut { value: Amount::from_sat(CHANGE_SATS), script_pubkey: account_script.clone() },
            ],
        };
        let mut psbt = Psbt::from_unsigned_tx(transaction).unwrap();
        psbt.inputs[0].witness_utxo =
            Some(TxOut { value: Amount::from_sat(INPUT_SATS), script_pubkey: account_script });
        WdkBtcSignPsbtRequest {
            protocol_version: WDK_PROTOCOL_VERSION,
            request_id: vec![7; 16],
            derivation_path: BTC_PATH.to_owned(),
            network: WDK_BITCOIN_TESTNET,
            psbt: psbt.serialize(),
        }
    }

    #[test]
    fn derives_bip84_testnet_account_and_signs_owned_psbt() {
        let wallet = BtcWallet::new([7; 32]);
        let account = wallet
            .account_response(&WdkBtcAccountRequest {
                protocol_version: WDK_PROTOCOL_VERSION,
                request_id: vec![1; 16],
                derivation_path: BTC_PATH.to_owned(),
                network: WDK_BITCOIN_TESTNET,
            })
            .unwrap();
        assert!(account.address.starts_with("tb1q"));
        assert_eq!(account.public_key.len(), 33);

        let prepared = wallet.prepare(request(&wallet)).unwrap();
        assert_eq!(prepared.review.amount, "0.001");
        assert_eq!(prepared.review.maximum_fee, "0.00001");
        let response = wallet.sign(&prepared).unwrap();
        let signed: Transaction = bitcoin::consensus::deserialize(&response.signed_transaction).unwrap();
        assert_eq!(signed.input.len(), 1);
        assert_eq!(signed.input[0].witness.len(), 2);
        assert_eq!(response.address, account.address);
    }

    #[test]
    fn rejects_input_not_owned_by_passport() {
        let wallet = BtcWallet::new([7; 32]);
        let mut request = request(&wallet);
        let mut psbt = Psbt::deserialize(&request.psbt).unwrap();
        psbt.inputs[0].witness_utxo.as_mut().unwrap().script_pubkey = ScriptBuf::new_op_return(&[]);
        request.psbt = psbt.serialize();
        assert_eq!(wallet.prepare(request).unwrap_err(), PolicyError::Inputs);
    }

    #[test]
    fn rejects_multiple_external_recipients() {
        let wallet = BtcWallet::new([7; 32]);
        let mut request = request(&wallet);
        let mut psbt = Psbt::deserialize(&request.psbt).unwrap();
        let second_recipient = Address::from_str(&BtcWallet::new([9; 32]).address().unwrap())
            .unwrap()
            .require_network(Network::Testnet)
            .unwrap();
        psbt.unsigned_tx.output[1].script_pubkey = second_recipient.script_pubkey();
        request.psbt = psbt.serialize();
        assert_eq!(wallet.prepare(request).unwrap_err(), PolicyError::Outputs);
    }

    #[test]
    fn rejects_fee_above_policy_limit() {
        let wallet = BtcWallet::new([7; 32]);
        let mut request = request(&wallet);
        let mut psbt = Psbt::deserialize(&request.psbt).unwrap();
        psbt.inputs[0].witness_utxo.as_mut().unwrap().value =
            Amount::from_sat(SEND_SATS + CHANGE_SATS + MAX_FEE_SATS + 1);
        request.psbt = psbt.serialize();
        assert_eq!(wallet.prepare(request).unwrap_err(), PolicyError::Fee);
    }
}
