// SPDX-FileCopyrightText: 2026 Foundation Devices, Inc. <hello@foundation.xyz>
// SPDX-License-Identifier: GPL-3.0-or-later

//! Passport Prime companion for the Tether WDK Android proof of concept.

use gui_app_tether_wdk::{
    btc::{BtcWallet, PolicyError as BtcPolicyError, PreparedTransaction as PreparedBtcTransaction},
    evm::{Asset, EvmWallet, PolicyError, PreparedTransaction as PreparedEvmTransaction},
};
use quantum_link::{
    foundation_api::wdk::{WdkRequestRejected, WDK_PROTOCOL_VERSION},
    messages::{
        SendWdkBtcAccountResponse, SendWdkBtcSignPsbtResponse, SendWdkEvmAccountResponse,
        SendWdkEvmSignTransactionResponse, SendWdkRequestRejected, SubscribeWdkBtcAccountRequest,
        SubscribeWdkBtcSignPsbtRequest, SubscribeWdkEvmAccountRequest, SubscribeWdkEvmSignTransactionRequest,
        SubscribeWdkRequestCancelled, UnpairFromEnvoy,
    },
};
use slint_keyos_platform::{
    app, async_archive,
    file_backed::JsonBacked,
    sleep,
    slint::{ComponentHandle as _, SharedString},
    spawn_local, spawn_worker, subscribe_archive, worker, StoredValue,
};

use crate::fs_permissions::FileSystemPermissions;

security::use_api!();
bt::use_api!();
quantum_link::use_api!();

app!("Tether WDK");

const CURRENT_SETUP_VERSION: u8 = 1;

fn pairing_step_two_started(current: bool, quantum_link_bt_connected: bool) -> bool {
    current || quantum_link_bt_connected
}

fn tether_setup_ready(setup_version: u8, quantum_link_paired: bool) -> bool {
    setup_version == CURRENT_SETUP_VERSION && quantum_link_paired
}

fn policy_message(error: &PolicyError) -> String {
    let id = match error {
        PolicyError::Protocol => TrId::ErrorProtocol,
        PolicyError::RequestId | PolicyError::Quantity(_) => TrId::ErrorInvalidRequest,
        PolicyError::DerivationPath => TrId::ErrorPath,
        PolicyError::Chain => TrId::ErrorChain,
        PolicyError::Address => TrId::ErrorAddress,
        PolicyError::Fee => TrId::ErrorFee,
        PolicyError::UnsupportedCall => TrId::ErrorSmartContract,
        PolicyError::Token => TrId::ErrorToken,
        PolicyError::Value => TrId::ErrorValue,
        PolicyError::Signature => TrId::ErrorSignature,
    };
    tr::lookup_id(id).to_owned()
}

fn btc_policy_message(error: &BtcPolicyError) -> String {
    let id = match error {
        BtcPolicyError::Protocol | BtcPolicyError::RequestId | BtcPolicyError::Psbt => {
            TrId::ErrorInvalidRequest
        }
        BtcPolicyError::DerivationPath => TrId::ErrorPath,
        BtcPolicyError::Network => TrId::ErrorChain,
        BtcPolicyError::Inputs | BtcPolicyError::Outputs | BtcPolicyError::Address => TrId::ErrorAddress,
        BtcPolicyError::Fee => TrId::ErrorFee,
        BtcPolicyError::Value => TrId::ErrorValue,
        BtcPolicyError::Signature => TrId::ErrorSignature,
    };
    tr::lookup_id(id).to_owned()
}

#[derive(Default, serde::Deserialize, serde::Serialize)]
struct Settings {
    #[serde(default)]
    setup_version: u8,
}

struct AppState {
    evm_wallet: Option<EvmWallet>,
    btc_wallet: Option<BtcWallet>,
    pending: Option<PendingTransaction>,
    settings: JsonBacked<Settings, FileSystemPermissions>,
    ql_status: QlStatus,
}

enum PendingTransaction {
    Evm(PreparedEvmTransaction),
    Btc(PreparedBtcTransaction),
}

impl PendingTransaction {
    fn request_id(&self) -> &[u8] {
        match self {
            Self::Evm(prepared) => &prepared.request.request_id,
            Self::Btc(prepared) => &prepared.request.request_id,
        }
    }
}

fn pairing_url(addr_hex: &str) -> String {
    format!("https://qr.foundation.xyz/?p={addr_hex}&c=0&o=1&n=Passport%20Prime")
}

fn split_evm_address(address: &str) -> (&str, &str) { address.split_at(address.len().min(22)) }

fn shorten_evm_address(address: &str) -> String {
    if address.len() <= 18 {
        return address.to_owned();
    }
    format!("{}…{}", &address[..10], &address[address.len() - 8..])
}

fn set_address(ui: &AppWindow, address: String) {
    let (line_one, line_two) = split_evm_address(&address);
    let view = ui.global::<State>();
    view.set_address_line_one(line_one.into());
    view.set_address_line_two(line_two.into());
    view.set_address_short(shorten_evm_address(&address).into());
    view.set_address(address.into());
}

fn app_main(_cx: AppContext, ui: AppWindow) {
    log_server::init_wait(env!("CARGO_CRATE_NAME")).unwrap();
    log::set_max_level(log::LevelFilter::Info);
    log::info!("starting Tether WDK");

    let settings: JsonBacked<Settings, FileSystemPermissions> =
        JsonBacked::new("settings.json", fs::Location::AppData).0;
    let setup_complete = settings.setup_version == CURRENT_SETUP_VERSION;
    ui.global::<State>().set_page(if setup_complete { PageId::Home } else { PageId::Welcome });
    let state = StoredValue::new(AppState {
        evm_wallet: None,
        btc_wallet: None,
        pending: None,
        settings,
        ql_status: QlStatus::new(worker().clone()),
    });

    // A fresh or locked Prime defers GetAppSeed until its master key is
    // available. Keep that blocking security call off the UI executor so the
    // pairing/status interface can still render while the device is awaiting
    // onboarding or unlock.
    spawn_local({
        let ui = ui.clone_strong();
        let state = state.clone();
        async move {
            match spawn_worker(async { Security::default().app_seed() }).await {
                Ok(seed) => {
                    let evm_wallet = EvmWallet::new(seed);
                    match evm_wallet.address() {
                        Ok(address) => set_address(&ui, address),
                        Err(error) => show_error(&ui, policy_message(&error)),
                    }
                    let mut app_state = state.borrow_mut();
                    app_state.evm_wallet = Some(evm_wallet);
                    app_state.btc_wallet = Some(BtcWallet::new(seed));
                }
                Err(error) => {
                    log::error!("Tether WDK app seed is unavailable: {error:?}");
                    show_error(&ui, tr::lookup_id(TrId::ErrorSeedUnavailable).to_owned());
                }
            }
        }
    })
    .detach();

    start_pairing_ui(&ui);
    monitor_connection(&ui, &state);
    monitor_bluetooth_connection(&ui);
    handle_account_requests(&ui, &state);
    handle_btc_account_requests(&ui, &state);
    handle_signing_requests(&ui, &state);
    handle_btc_signing_requests(&ui, &state);
    handle_cancellations(&ui, &state);
    register_callbacks(&ui, &state);

    ui.run().expect("UI running");
}

fn start_pairing_ui(ui: &AppWindow) {
    let mut bt = BluetoothApi::default();
    if let Err(error) = bt.enable_ble() {
        log::warn!("could not enable BLE: {error:?}");
    }

    spawn_local({
        let ui = ui.clone_strong();
        async move {
            let xid = spawn_worker(async { QuantumLinkApi::default().xid_document() }).await;
            let parts = slint_keyos_platform::qrcode::encode_qr_parts("envelope", xid, 300);
            ui.global::<State>().set_pairing_xid_parts(parts);
        }
    })
    .detach();

    spawn_local({
        let ui = ui.clone_strong();
        let mut bt = BluetoothApi::default();
        async move {
            loop {
                match bt.get_bt_addr() {
                    Ok(address) => {
                        ui.global::<State>().set_pairing_qr(pairing_url(&address.to_hex_string()).into());
                        break;
                    }
                    Err(_) => sleep(std::time::Duration::from_secs(1)).await,
                }
            }
        }
    })
    .detach();
}

fn monitor_connection(ui: &AppWindow, state: &StoredValue<AppState>) {
    spawn_local({
        let ui = ui.clone_strong();
        let state = state.clone();
        let mut status = state.borrow().ql_status.clone();
        async move {
            while let Some(next) = status.next().await {
                log::info!("Tether WDK QuantumLink status: {next:?}");
                let was_paired = ui.global::<State>().get_paired();
                let setup_version = state.borrow().settings.setup_version;
                let tether_ready = tether_setup_ready(setup_version, next.ql_paired);
                let view = ui.global::<State>();
                view.set_paired(tether_ready);
                view.set_companion_connected(next.bt_connected);

                // The system QuantumLink service owns the pairing session.
                // Follow its status, exactly as KeyOS Settings does, instead
                // of independently interpreting the lower-level BT service.
                // Once step 2 begins, keep it latched so a transient BLE state
                // wobble cannot send the user back to the static QR.
                view.set_bt_connected(pairing_step_two_started(view.get_bt_connected(), next.bt_connected));

                if tether_ready && !was_paired {
                    view.set_disconnecting(false);
                    view.set_page(PageId::Home);
                } else if was_paired && !tether_ready {
                    state.borrow_mut().pending = None;
                    if !next.ql_paired {
                        state.borrow_mut().settings.guard().setup_version = 0;
                    }
                    view.set_disconnecting(false);
                    view.set_page(PageId::Pairing);
                }
            }
        }
    })
    .detach();
}

/// Poll the BLE controller's current state so the transition from the static
/// connection QR to the animated QuantumLink identity QR cannot miss a
/// short-lived subscription event.
fn monitor_bluetooth_connection(ui: &AppWindow) {
    spawn_local({
        let ui = ui.clone_strong();
        async move {
            loop {
                let connected = spawn_worker(async {
                    BluetoothApi::default().state().map(|state| state.is_connected()).unwrap_or(false)
                })
                .await;

                let view = ui.global::<State>();
                view.set_companion_connected(connected);
                if connected {
                    if !view.get_bt_connected() {
                        log::info!("BLE connected; advancing Tether WDK pairing to identity QR");
                        view.set_bt_connected(true);
                    }
                }

                sleep(std::time::Duration::from_millis(250)).await;
            }
        }
    })
    .detach();
}

fn handle_account_requests(ui: &AppWindow, state: &StoredValue<AppState>) {
    spawn_local({
        let ui = ui.clone_strong();
        let state = state.clone();
        async move {
            let mut events = subscribe_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(
                SubscribeWdkEvmAccountRequest,
            );
            while let Some(request) = events.next().await {
                let result = state
                    .borrow()
                    .evm_wallet
                    .as_ref()
                    .ok_or(PolicyError::Signature)
                    .and_then(|wallet| wallet.account_response(&request));
                match result {
                    Ok(response) => {
                        match async_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(
                            SendWdkEvmAccountResponse { response },
                        )
                        .await
                        {
                            Ok(()) => {
                                state.borrow_mut().settings.guard().setup_version = CURRENT_SETUP_VERSION;
                                let view = ui.global::<State>();
                                view.set_paired(true);
                                view.set_bt_connected(true);
                                view.set_companion_connected(true);
                                view.set_page(PageId::Home);
                            }
                            Err(error) => {
                                log::warn!("could not return WDK account response: {error:?}");
                            }
                        }
                    }
                    Err(error) => {
                        let message = policy_message(&error);
                        send_rejection(request.request_id, 4, message.clone());
                        show_error(&ui, message);
                    }
                }
            }
        }
    })
    .detach();
}

fn handle_signing_requests(ui: &AppWindow, state: &StoredValue<AppState>) {
    spawn_local({
        let ui = ui.clone_strong();
        let state = state.clone();
        async move {
            let mut events = subscribe_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(
                SubscribeWdkEvmSignTransactionRequest,
            );
            while let Some(request) = events.next().await {
                if state.borrow().pending.is_some() {
                    send_rejection(request.request_id, 8, tr::lookup_id(TrId::RequestBusy).to_owned());
                    continue;
                }

                let request_id = request.request_id.clone();
                let result = state
                    .borrow()
                    .evm_wallet
                    .as_ref()
                    .ok_or(PolicyError::Signature)
                    .and_then(|wallet| wallet.prepare(request));
                match result {
                    Ok(prepared) => {
                        let view = ui.global::<State>();
                        view.set_asset(match prepared.review.asset {
                            Asset::Eth => SharedString::from("ETH"),
                            Asset::Usdt => SharedString::from("USDT"),
                        });
                        view.set_amount(prepared.review.amount.clone().into());
                        view.set_recipient(prepared.review.recipient.clone().into());
                        let (recipient_line_one, recipient_line_two) =
                            split_evm_address(&prepared.review.recipient);
                        view.set_recipient_line_one(recipient_line_one.into());
                        view.set_recipient_line_two(recipient_line_two.into());
                        view.set_maximum_fee(prepared.review.maximum_fee.clone().into());
                        view.set_page(PageId::Review);
                        state.borrow_mut().pending = Some(PendingTransaction::Evm(prepared));
                    }
                    Err(error) => {
                        let message = policy_message(&error);
                        send_rejection(request_id, 4, message.clone());
                        show_error(&ui, message);
                    }
                }
            }
        }
    })
    .detach();
}

fn handle_btc_account_requests(ui: &AppWindow, state: &StoredValue<AppState>) {
    spawn_local({
        let ui = ui.clone_strong();
        let state = state.clone();
        async move {
            let mut events = subscribe_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(
                SubscribeWdkBtcAccountRequest,
            );
            while let Some(request) = events.next().await {
                let result = state
                    .borrow()
                    .btc_wallet
                    .as_ref()
                    .ok_or(BtcPolicyError::Signature)
                    .and_then(|wallet| wallet.account_response(&request));
                match result {
                    Ok(response) => {
                        if let Err(error) =
                            async_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(
                                SendWdkBtcAccountResponse { response },
                            )
                            .await
                        {
                            log::warn!("could not return WDK Bitcoin account response: {error:?}");
                        }
                    }
                    Err(error) => {
                        let message = btc_policy_message(&error);
                        send_rejection(request.request_id, 4, message.clone());
                        show_error(&ui, message);
                    }
                }
            }
        }
    })
    .detach();
}

fn handle_btc_signing_requests(ui: &AppWindow, state: &StoredValue<AppState>) {
    spawn_local({
        let ui = ui.clone_strong();
        let state = state.clone();
        async move {
            let mut events = subscribe_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(
                SubscribeWdkBtcSignPsbtRequest,
            );
            while let Some(request) = events.next().await {
                if state.borrow().pending.is_some() {
                    send_rejection(request.request_id, 8, tr::lookup_id(TrId::RequestBusy).to_owned());
                    continue;
                }
                let request_id = request.request_id.clone();
                let result = state
                    .borrow()
                    .btc_wallet
                    .as_ref()
                    .ok_or(BtcPolicyError::Signature)
                    .and_then(|wallet| wallet.prepare(request));
                match result {
                    Ok(prepared) => {
                        let view = ui.global::<State>();
                        view.set_asset("BTC".into());
                        view.set_amount(prepared.review.amount.clone().into());
                        view.set_recipient(prepared.review.recipient.clone().into());
                        let split = prepared.review.recipient.len().min(22);
                        let (line_one, line_two) = prepared.review.recipient.split_at(split);
                        view.set_recipient_line_one(line_one.into());
                        view.set_recipient_line_two(line_two.into());
                        view.set_maximum_fee(prepared.review.maximum_fee.clone().into());
                        view.set_page(PageId::Review);
                        state.borrow_mut().pending = Some(PendingTransaction::Btc(prepared));
                    }
                    Err(error) => {
                        let message = btc_policy_message(&error);
                        send_rejection(request_id, 4, message.clone());
                        show_error(&ui, message);
                    }
                }
            }
        }
    })
    .detach();
}

fn handle_cancellations(ui: &AppWindow, state: &StoredValue<AppState>) {
    spawn_local({
        let ui = ui.clone_strong();
        let state = state.clone();
        async move {
            let mut events = subscribe_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(
                SubscribeWdkRequestCancelled,
            );
            while let Some(cancelled) = events.next().await {
                let matches = state
                    .borrow()
                    .pending
                    .as_ref()
                    .map(|pending| pending.request_id() == cancelled.request_id.as_slice())
                    .unwrap_or(false);
                if matches {
                    state.borrow_mut().pending = None;
                    ui.global::<State>().set_page(PageId::Home);
                }
            }
        }
    })
    .detach();
}

fn register_callbacks(ui: &AppWindow, state: &StoredValue<AppState>) {
    ui.global::<Callbacks>().on_welcome_continue({
        let ui = ui.clone_strong();
        move || ui.global::<State>().set_page(PageId::WalletChoice)
    });

    ui.global::<Callbacks>().on_choose_create({
        let ui = ui.clone_strong();
        move || {
            let view = ui.global::<State>();
            view.set_wallet_recovered(false);
            view.set_page(PageId::WalletCreating);
        }
    });

    ui.global::<Callbacks>().on_choose_recover({
        let ui = ui.clone_strong();
        move || ui.global::<State>().set_page(PageId::Recovery)
    });

    ui.global::<Callbacks>().on_recovery_back({
        let ui = ui.clone_strong();
        move || ui.global::<State>().set_page(PageId::WalletChoice)
    });

    ui.global::<Callbacks>().on_recovery_continue({
        let ui = ui.clone_strong();
        move || {
            let view = ui.global::<State>();
            view.set_wallet_recovered(true);
            view.set_page(PageId::WalletReady);
        }
    });

    ui.global::<Callbacks>().on_wallet_ready_continue({
        let ui = ui.clone_strong();
        let state = state.clone();
        move || {
            state.borrow_mut().settings.guard().setup_version = 0;
            let view = ui.global::<State>();
            view.set_paired(false);
            view.set_bt_connected(false);
            view.set_companion_connected(false);

            spawn_local({
                let ui = ui.clone_strong();
                async move {
                    if let Err(error) =
                        async_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(UnpairFromEnvoy)
                            .await
                    {
                        log::info!("no previous QuantumLink pairing to replace: {error:?}");
                    }

                    spawn_worker(async {
                        let mut bt = BluetoothApi::default();
                        if bt.state().map(|state| state.is_connected()).unwrap_or(false) {
                            let _ = bt.disconnect();
                        }
                    })
                    .await;

                    for _ in 0..20 {
                        let connected = spawn_worker(async {
                            BluetoothApi::default().state().map(|state| state.is_connected()).unwrap_or(false)
                        })
                        .await;
                        if !connected {
                            break;
                        }
                        sleep(std::time::Duration::from_millis(100)).await;
                    }

                    let view = ui.global::<State>();
                    view.set_bt_connected(false);
                    view.set_companion_connected(false);
                    view.set_page(PageId::Pairing);
                }
            })
            .detach();
        }
    });

    ui.global::<Callbacks>().on_pairing_back({
        let ui = ui.clone_strong();
        move || ui.global::<State>().set_page(PageId::WalletChoice)
    });

    ui.global::<Callbacks>().on_show_about({
        let ui = ui.clone_strong();
        move || ui.global::<State>().set_page(PageId::About)
    });

    ui.global::<Callbacks>().on_close_about({
        let ui = ui.clone_strong();
        move || {
            let view = ui.global::<State>();
            view.set_page(if view.get_paired() { PageId::Home } else { PageId::Pairing });
        }
    });

    ui.global::<Callbacks>().on_request_disconnect({
        let ui = ui.clone_strong();
        move || ui.global::<State>().set_page(PageId::Disconnect)
    });

    ui.global::<Callbacks>().on_cancel_disconnect({
        let ui = ui.clone_strong();
        move || ui.global::<State>().set_page(PageId::Home)
    });

    ui.global::<Callbacks>().on_confirm_disconnect({
        let ui = ui.clone_strong();
        let state = state.clone();
        move || {
            ui.global::<State>().set_disconnecting(true);
            spawn_local({
                let ui = ui.clone_strong();
                let state = state.clone();
                async move {
                    match async_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(
                        UnpairFromEnvoy,
                    )
                    .await
                    {
                        Ok(()) => {
                            state.borrow_mut().pending = None;
                            state.borrow_mut().settings.guard().setup_version = 0;
                            let view = ui.global::<State>();
                            view.set_disconnecting(false);
                            view.set_paired(false);
                            view.set_bt_connected(false);
                            view.set_companion_connected(false);
                            view.set_page(PageId::Pairing);
                        }
                        Err(error) => {
                            log::warn!("could not unpair Tether WDK phone: {error:?}");
                            ui.global::<State>().set_disconnecting(false);
                            show_error(&ui, tr::lookup_id(TrId::ErrorUnpair).to_owned());
                        }
                    }
                }
            })
            .detach();
        }
    });

    ui.global::<Callbacks>().on_approve({
        let ui = ui.clone_strong();
        let state = state.clone();
        move || {
            let prepared = state.borrow_mut().pending.take();
            let Some(prepared) = prepared else {
                show_error(&ui, tr::lookup_id(TrId::ErrorRequestUnavailable).to_owned());
                return;
            };

            match prepared {
                PendingTransaction::Evm(prepared) => {
                    let result = state
                        .borrow()
                        .evm_wallet
                        .as_ref()
                        .ok_or(PolicyError::Signature)
                        .and_then(|wallet| wallet.sign(&prepared));
                    match result {
                        Ok(response) => {
                            ui.global::<State>().set_page(PageId::Result);
                            spawn_local({
                                let ui = ui.clone_strong();
                                async move {
                                    if let Err(error) =
                                        async_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(
                                            SendWdkEvmSignTransactionResponse { response },
                                        )
                                        .await
                                    {
                                        log::warn!("could not return signed WDK transaction: {error:?}");
                                        show_error(&ui, tr::lookup_id(TrId::ErrorDisconnected).to_owned());
                                    }
                                }
                            })
                            .detach();
                        }
                        Err(error) => {
                            let message = policy_message(&error);
                            send_rejection(prepared.request.request_id, 7, message.clone());
                            show_error(&ui, message);
                        }
                    }
                }
                PendingTransaction::Btc(prepared) => {
                    let result = state
                        .borrow()
                        .btc_wallet
                        .as_ref()
                        .ok_or(BtcPolicyError::Signature)
                        .and_then(|wallet| wallet.sign(&prepared));
                    match result {
                        Ok(response) => {
                            ui.global::<State>().set_page(PageId::Result);
                            spawn_local({
                                let ui = ui.clone_strong();
                                async move {
                                    if let Err(error) =
                                        async_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(
                                            SendWdkBtcSignPsbtResponse { response },
                                        )
                                        .await
                                    {
                                        log::warn!(
                                            "could not return signed WDK Bitcoin transaction: {error:?}"
                                        );
                                        show_error(&ui, tr::lookup_id(TrId::ErrorDisconnected).to_owned());
                                    }
                                }
                            })
                            .detach();
                        }
                        Err(error) => {
                            let message = btc_policy_message(&error);
                            send_rejection(prepared.request.request_id, 7, message.clone());
                            show_error(&ui, message);
                        }
                    }
                }
            }
        }
    });

    ui.global::<Callbacks>().on_reject({
        let ui = ui.clone_strong();
        let state = state.clone();
        move || {
            if let Some(prepared) = state.borrow_mut().pending.take() {
                send_rejection(
                    prepared.request_id().to_vec(),
                    5,
                    tr::lookup_id(TrId::RequestRejected).to_owned(),
                );
            }
            let view = ui.global::<State>();
            view.set_page(if view.get_paired() { PageId::Home } else { PageId::Pairing });
        }
    });

    ui.global::<Callbacks>().on_done({
        let ui = ui.clone_strong();
        move || {
            let view = ui.global::<State>();
            view.set_error_message(SharedString::default());
            view.set_page(if view.get_paired() { PageId::Home } else { PageId::Pairing });
        }
    });
}

fn send_rejection(request_id: Vec<u8>, reason_code: u8, message: String) {
    if request_id.len() != 16 {
        return;
    }
    spawn_local(async move {
        let response =
            WdkRequestRejected { protocol_version: WDK_PROTOCOL_VERSION, request_id, reason_code, message };
        if let Err(error) =
            async_archive::<quantum_link_permissions::QuantumLinkPermissions, _>(SendWdkRequestRejected {
                response,
            })
            .await
        {
            log::warn!("could not return WDK rejection: {error:?}");
        }
    })
    .detach();
}

fn show_error(ui: &AppWindow, message: String) {
    let view = ui.global::<State>();
    view.set_error_message(message.into());
    view.set_page(PageId::Error);
}

#[cfg(test)]
mod pairing_state_tests {
    use super::{pairing_step_two_started, shorten_evm_address, tether_setup_ready, CURRENT_SETUP_VERSION};

    #[test]
    fn quantum_link_connection_advances_to_step_two() {
        assert!(pairing_step_two_started(false, true));
    }

    #[test]
    fn transient_disconnect_does_not_return_to_static_qr() {
        assert!(pairing_step_two_started(true, false));
    }

    #[test]
    fn existing_keyos_pairing_does_not_skip_tether_identity_scan() {
        assert!(!tether_setup_ready(0, true));
    }

    #[test]
    fn completed_tether_setup_reopens_home_when_quantum_link_is_paired() {
        assert!(tether_setup_ready(CURRENT_SETUP_VERSION, true));
    }

    #[test]
    fn home_address_keeps_identifying_prefix_and_suffix() {
        assert_eq!(shorten_evm_address("0x206438AE1e36a0A302E135106A311f34b9c426D0"), "0x206438AE…b9c426D0");
    }
}
