import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
import {
  formatEther,
  formatUnits,
  getAddress,
  JsonRpcProvider,
  parseEther,
  parseUnits,
} from 'ethers';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import PassportQuantumLink, { type QuantumLinkStatus } from '../../modules/quantumlink';
import { createPassportWalletSession, type PassportWalletSession } from './PassportWalletService';
import {
  createPassportBtcSession,
  type PassportBtcSession,
  type PreparedBtcTransfer,
} from './PassportWalletServiceBtc';
import {
  fetchBitcoinHistory,
  fetchSepoliaHistory,
  mergeHistory,
  type HistoryDirection,
  type HistoryEntry,
} from '@/wallet/history';
import { quantumLinkTransport } from './QuantumLinkTransport';

export const SEPOLIA_USDT_ADDRESS = '0xd077a400968890eacc75cdc901f0356c943e4fdb';
export const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';
export const PASSPORT_MAX_FEE_WEI = 50_000_000_000_000_000n;
const SEPOLIA_RPC =
  process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
// Receives never touch this phone, so history has to be read back from public
// testnet indexers. Both hosts are overridable and testnet-only.
const SEPOLIA_EXPLORER_API =
  process.env.EXPO_PUBLIC_SEPOLIA_EXPLORER_API ?? 'https://eth-sepolia.blockscout.com';
const BITCOIN_TESTNET_API =
  process.env.EXPO_PUBLIC_BITCOIN_TESTNET_API ?? 'https://mempool.space/testnet/api';
const ACTIVITY_KEY = 'passport_tether_wdk_activity_v1';
const ACCOUNT_KEY = 'passport_tether_wdk_account_v1';
const WALLET_BOOTSTRAP_RETRY_DELAYS = [0, 750, 2_000];
const POST_BROADCAST_REFRESH_DELAYS = [0, 1_500, 4_000];

export type PassportAsset = 'BTC' | 'ETH' | 'USD₮';

export type PassportBalances = {
  eth: bigint;
  usdt: bigint;
  btc: bigint;
};

export type PassportActivity = {
  hash: string;
  asset: PassportAsset;
  amount: string;
  /** Counterparty: the recipient for sends, the sender for receives. */
  recipient: string;
  feeWei: string;
  feeUnit?: 'wei' | 'sats';
  /** Absent on entries stored before chain-derived history landed; treat as a send. */
  direction?: HistoryDirection;
  timestamp: number;
};

export type TransferQuote = {
  asset: PassportAsset;
  amount: string;
  recipient: string;
  feeWei: bigint;
  btc?: PreparedBtcTransfer;
};

type PassportContextValue = {
  status: QuantumLinkStatus;
  initializing: boolean;
  walletLoading: boolean;
  address: string | null;
  btcAddress: string | null;
  balances: PassportBalances;
  activity: PassportActivity[];
  error: string | null;
  connect(deviceAddress: string): Promise<void>;
  pair(primeXidBase64: string): Promise<string>;
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
  unpair(): Promise<void>;
  forget(): Promise<void>;
  refresh(): Promise<void>;
  quoteTransfer(asset: PassportAsset, amount: string, recipient: string): Promise<TransferQuote>;
  sendTransfer(quote: TransferQuote): Promise<PassportActivity>;
  cancelSigning(): Promise<void>;
  clearError(): void;
};

const DISCONNECTED_STATUS: QuantumLinkStatus = {
  available: true,
  paired: false,
  connected: false,
  state: 'disconnected',
  deviceName: null,
  deviceAddress: null,
};

const PassportContext = createContext<PassportContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ensureQuantumLinkPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const permissions =
    Number(Platform.Version) >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const results = await PermissionsAndroid.requestMultiple(permissions);
  if (
    permissions.some((permission) => results[permission] !== PermissionsAndroid.RESULTS.GRANTED)
  ) {
    throw new Error('Bluetooth permission is required to connect Passport Prime');
  }
}

async function loadActivity(): Promise<PassportActivity[]> {
  const value = await AsyncStorage.getItem(ACTIVITY_KEY);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as PassportActivity[];
    return parsed.filter(
      (item) =>
        typeof item.hash === 'string' &&
        typeof item.amount === 'string' &&
        typeof item.timestamp === 'number'
    );
  } catch {
    return [];
  }
}

async function loadCachedAddress(deviceAddress: string | null): Promise<string | null> {
  if (!deviceAddress) return null;
  const value = await AsyncStorage.getItem(ACCOUNT_KEY);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as {
      deviceAddress?: string;
      address?: string;
      btcAddress?: string;
    };
    if (parsed.deviceAddress?.toUpperCase() !== deviceAddress.toUpperCase() || !parsed.address) {
      return null;
    }
    return getAddress(parsed.address);
  } catch {
    return null;
  }
}

async function loadCachedBtcAddress(deviceAddress: string | null): Promise<string | null> {
  if (!deviceAddress) return null;
  const value = await AsyncStorage.getItem(ACCOUNT_KEY);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as {
      deviceAddress?: string;
      btcAddress?: string;
    };
    if (
      parsed.deviceAddress?.toUpperCase() !== deviceAddress.toUpperCase() ||
      !parsed.btcAddress?.startsWith('tb1')
    ) {
      return null;
    }
    return parsed.btcAddress;
  } catch {
    return null;
  }
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export function PassportProvider({ children }: React.PropsWithChildren) {
  const [status, setStatus] = useState<QuantumLinkStatus>(DISCONNECTED_STATUS);
  const [initializing, setInitializing] = useState(true);
  const [walletLoading, setWalletLoading] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [btcAddress, setBtcAddress] = useState<string | null>(null);
  const [balances, setBalances] = useState<PassportBalances>({ eth: 0n, usdt: 0n, btc: 0n });
  const [activity, setActivity] = useState<PassportActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<PassportWalletSession | null>(null);
  const btcSessionRef = useRef<PassportBtcSession | null>(null);
  const bootstrappingRef = useRef<Promise<void> | null>(null);
  // refresh() is a stable callback invoked from broadcast and reconnect paths,
  // so it reads the current addresses through refs rather than closing over them.
  const addressRef = useRef<string | null>(null);
  const btcAddressRef = useRef<string | null>(null);
  addressRef.current = address;
  btcAddressRef.current = btcAddress;

  const disposeSession = useCallback(() => {
    sessionRef.current?.manager.dispose();
    btcSessionRef.current?.dispose();
    sessionRef.current = null;
    btcSessionRef.current = null;
    bootstrappingRef.current = null;
    setWalletLoading(false);
  }, []);

  const refreshHistory = useCallback(async () => {
    const evm = addressRef.current;
    const btc = btcAddressRef.current;
    if (!evm && !btc) return;

    const [sepolia, bitcoin] = await Promise.allSettled([
      evm
        ? fetchSepoliaHistory(evm, SEPOLIA_EXPLORER_API, SEPOLIA_USDT_ADDRESS, fetch, Date.now())
        : Promise.resolve([]),
      btc ? fetchBitcoinHistory(btc, BITCOIN_TESTNET_API, fetch, Date.now()) : Promise.resolve([]),
    ]);

    const chain: HistoryEntry[] = [];
    if (sepolia.status === 'fulfilled') chain.push(...sepolia.value);
    else console.warn('Sepolia history refresh failed', sepolia.reason);
    if (bitcoin.status === 'fulfilled') chain.push(...bitcoin.value);
    else console.warn('Bitcoin history refresh failed', bitcoin.reason);

    if (!chain.length) return;

    setActivity((current) => {
      const local: HistoryEntry[] = current.map((entry) => ({
        ...entry,
        direction: entry.direction ?? 'out',
        feeUnit: entry.feeUnit ?? 'wei',
      }));
      const next = mergeHistory(chain, local) as PassportActivity[];
      AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const account = sessionRef.current?.account;
    const btcAccount = btcSessionRef.current;
    if (!account && !btcAccount) return;
    setWalletLoading(true);
    try {
      const [eth, usdt, btc] = await Promise.allSettled([
        account?.getBalance() ?? 0n,
        account?.getTokenBalance(SEPOLIA_USDT_ADDRESS) ?? 0n,
        btcAccount?.getBalance() ?? 0n,
      ]);
      setBalances((current) => ({
        eth: eth.status === 'fulfilled' ? eth.value : current.eth,
        usdt: usdt.status === 'fulfilled' ? usdt.value : current.usdt,
        btc: btc.status === 'fulfilled' ? btc.value : current.btc,
      }));
      const failures = [eth, usdt, btc].filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      setError(
        failures.length
          ? `Some balances could not refresh: ${failures.map((failure) => errorMessage(failure.reason)).join('; ')}`
          : null
      );
      // History is best-effort: an indexer outage must not surface as a wallet
      // error or discard the locally-recorded sends.
      await refreshHistory();
    } finally {
      setWalletLoading(false);
    }
  }, [refreshHistory]);

  // Balances arrive over QuantumLink as soon as the wallet bootstraps, but
  // history is fetched from indexers keyed on the derived addresses. Without
  // this the Transactions screen stayed empty until a manual pull-to-refresh.
  useEffect(() => {
    if (!address && !btcAddress) return;
    refreshHistory().catch((cause) => console.warn('History backfill failed', cause));
  }, [address, btcAddress, refreshHistory]);

  const initializeWallet = useCallback(async () => {
    if (sessionRef.current) return;
    if (bootstrappingRef.current) return bootstrappingRef.current;

    const operation = (async () => {
      setWalletLoading(true);
      try {
        let session: PassportWalletSession | null = null;
        let lastError: unknown = new Error('Passport account request did not complete');
        for (const retryDelay of WALLET_BOOTSTRAP_RETRY_DELAYS) {
          if (retryDelay > 0) await wait(retryDelay);
          if (!PassportQuantumLink.getStatus().connected) {
            throw new Error('Passport Prime disconnected during account setup');
          }
          try {
            session = await createPassportWalletSession(quantumLinkTransport, {
              provider: SEPOLIA_RPC,
              retries: 2,
              transferMaxFee: PASSPORT_MAX_FEE_WEI,
              transactionMaxFee: PASSPORT_MAX_FEE_WEI,
            });
            break;
          } catch (cause) {
            session?.manager.dispose();
            session = null;
            lastError = cause;
          }
        }
        if (!session) throw lastError;

        sessionRef.current = session;
        setAddress(session.address);
        const connectedDevice = PassportQuantumLink.getStatus().deviceAddress;
        if (connectedDevice) {
          AsyncStorage.setItem(
            ACCOUNT_KEY,
            JSON.stringify({
              deviceAddress: connectedDevice,
              address: session.address,
            })
          ).catch(() => undefined);
        }
        setError(null);

        try {
          const [eth, usdt] = await Promise.all([
            session.account.getBalance(),
            session.account.getTokenBalance(SEPOLIA_USDT_ADDRESS),
          ]);
          setBalances((current) => ({ ...current, eth, usdt }));
        } catch (cause) {
          // The verified public address remains usable for Receive even when
          // the public Sepolia RPC is temporarily unavailable.
          setError(`Account connected, but balances could not refresh: ${errorMessage(cause)}`);
        }

        // Bitcoin is a negotiated extension to the original EVM application.
        // Older Passport builds do not recognize the account request and time
        // out. Attach it in the background so that this optional capability
        // can never discard a valid USD₮/ETH wallet session.
        void (async () => {
          let btcSession: PassportBtcSession | null = null;
          try {
            btcSession = await createPassportBtcSession(quantumLinkTransport);
            if (sessionRef.current !== session || !PassportQuantumLink.getStatus().connected) {
              btcSession.dispose();
              return;
            }

            btcSessionRef.current?.dispose();
            btcSessionRef.current = btcSession;
            setBtcAddress(btcSession.passport.address);
            if (connectedDevice) {
              AsyncStorage.setItem(
                ACCOUNT_KEY,
                JSON.stringify({
                  deviceAddress: connectedDevice,
                  address: session.address,
                  btcAddress: btcSession.passport.address,
                })
              ).catch(() => undefined);
            }

            try {
              const btc = await btcSession.getBalance();
              if (btcSessionRef.current === btcSession) {
                setBalances((current) => ({ ...current, btc }));
              }
            } catch (cause) {
              console.warn('Bitcoin balance refresh failed', cause);
            }
          } catch (cause) {
            btcSession?.dispose();
            console.warn('Bitcoin account unavailable; continuing with USD₮ and ETH', cause);
          }
        })();
      } catch (cause) {
        console.warn(
          'Passport wallet bootstrap failed',
          cause,
          PassportQuantumLink.getDiagnostics()
        );
        disposeSession();
        setError(`Passport wallet unavailable: ${errorMessage(cause)}`);
        throw cause;
      } finally {
        bootstrappingRef.current = null;
        setWalletLoading(false);
      }
    })();
    bootstrappingRef.current = operation;
    return operation;
  }, [disposeSession]);

  useEffect(() => {
    let active = true;
    const updateStatus = () => {
      if (!active) return;
      const next = PassportQuantumLink.getStatus();
      setStatus(next);
      if (next.paired && next.connected) {
        initializeWallet().catch(() => undefined);
      } else if (!next.connected) {
        disposeSession();
      }
    };

    const connection = PassportQuantumLink.addListener('onConnectionChanged', updateStatus);
    const unpaired = PassportQuantumLink.addListener('onUnpaired', () => {
      disposeSession();
      setAddress(null);
      setBtcAddress(null);
      setBalances({ eth: 0n, usdt: 0n, btc: 0n });
      updateStatus();
    });

    Promise.all([loadActivity()])
      .then(async ([storedActivity]) => {
        if (!active) return;
        setActivity(storedActivity);
        const current = PassportQuantumLink.getStatus();
        if (current.paired) {
          setAddress(await loadCachedAddress(current.deviceAddress));
          setBtcAddress(await loadCachedBtcAddress(current.deviceAddress));
        }
      })
      .finally(async () => {
        if (!active) return;
        updateStatus();
        const current = PassportQuantumLink.getStatus();
        if (current.paired && !current.connected) {
          try {
            await PassportQuantumLink.reconnect();
          } catch {
            // Staying paired but offline is a recoverable home-screen state.
          }
          updateStatus();
        }
        if (active) setInitializing(false);
      });

    return () => {
      active = false;
      connection.remove();
      unpaired.remove();
      disposeSession();
    };
  }, [disposeSession, initializeWallet]);

  const connect = useCallback(async (deviceAddress: string) => {
    setError(null);
    await ensureQuantumLinkPermissions();
    await PassportQuantumLink.connect(deviceAddress);
    setStatus(PassportQuantumLink.getStatus());
  }, []);

  const pair = useCallback(
    async (primeXidBase64: string) => {
      setError(null);
      const name = await PassportQuantumLink.pair(primeXidBase64, 'Tether WDK');
      setStatus(PassportQuantumLink.getStatus());
      await initializeWallet();
      return name;
    },
    [initializeWallet]
  );

  const reconnect = useCallback(async () => {
    setError(null);
    if (!PassportQuantumLink.getStatus().connected) {
      await ensureQuantumLinkPermissions();
      await PassportQuantumLink.reconnect();
    }
    setStatus(PassportQuantumLink.getStatus());
    await initializeWallet();
  }, [initializeWallet]);

  const disconnect = useCallback(async () => {
    await PassportQuantumLink.disconnect();
    disposeSession();
    setStatus(PassportQuantumLink.getStatus());
  }, [disposeSession]);

  const unpair = useCallback(async () => {
    await PassportQuantumLink.unpair();
    disposeSession();
    setAddress(null);
    setBtcAddress(null);
    setBalances({ eth: 0n, usdt: 0n, btc: 0n });
    await AsyncStorage.removeItem(ACCOUNT_KEY);
    setStatus(PassportQuantumLink.getStatus());
  }, [disposeSession]);

  const forget = useCallback(async () => {
    await PassportQuantumLink.forget();
    disposeSession();
    setAddress(null);
    setBtcAddress(null);
    setBalances({ eth: 0n, usdt: 0n, btc: 0n });
    await AsyncStorage.removeItem(ACCOUNT_KEY);
    setStatus(PassportQuantumLink.getStatus());
  }, [disposeSession]);

  const quoteTransfer = useCallback(
    async (asset: PassportAsset, amount: string, recipient: string): Promise<TransferQuote> => {
      if (asset === 'BTC') {
        const session = btcSessionRef.current;
        if (!session) throw new Error('Reconnect Passport Prime before preparing a transfer');
        const amountSats = parseUnits(amount, 8);
        if (amountSats <= 0n) throw new Error('Enter an amount greater than zero');
        if (amountSats > balances.btc) throw new Error('Insufficient BTC balance');
        const prepared = await session.prepareTransfer(recipient, amountSats);
        return {
          asset,
          amount,
          recipient: prepared.recipient,
          feeWei: prepared.feeSats,
          btc: prepared,
        };
      }
      const account = sessionRef.current?.account as WalletAccountEvm | undefined;
      if (!account) throw new Error('Reconnect Passport Prime before preparing a transfer');
      const canonicalRecipient = getAddress(recipient);
      const units = asset === 'ETH' ? parseEther(amount) : parseUnits(amount, 6);
      if (units <= 0n) throw new Error('Enter an amount greater than zero');
      if (asset === 'ETH' && units > balances.eth) throw new Error('Insufficient ETH balance');
      if (asset === 'USD₮' && units > balances.usdt) throw new Error('Insufficient USD₮ balance');

      const result =
        asset === 'ETH'
          ? await account.quoteSendTransaction({ to: canonicalRecipient, value: units })
          : await account.quoteTransfer({
              token: SEPOLIA_USDT_ADDRESS,
              recipient: canonicalRecipient,
              amount: units,
            });
      if (result.fee > PASSPORT_MAX_FEE_WEI) {
        throw new Error('The network fee exceeds the Passport safety limit');
      }
      return { asset, amount, recipient: canonicalRecipient, feeWei: result.fee };
    },
    [balances]
  );

  const sendTransfer = useCallback(
    async (quote: TransferQuote): Promise<PassportActivity> => {
      const account = sessionRef.current?.account as WalletAccountEvm | undefined;
      const units =
        quote.asset === 'BTC'
          ? parseUnits(quote.amount, 8)
          : quote.asset === 'ETH'
            ? parseEther(quote.amount)
            : parseUnits(quote.amount, 6);
      let result: { hash: string; fee: bigint };
      if (quote.asset === 'BTC') {
        const session = btcSessionRef.current;
        if (!session || !quote.btc) {
          throw new Error('Reconnect Passport Prime before signing');
        }
        result = await session.signAndBroadcast(quote.btc);
      } else {
        if (!account) throw new Error('Reconnect Passport Prime before signing');
        result =
          quote.asset === 'ETH'
            ? await account.sendTransaction({ to: quote.recipient, value: units })
            : await account.transfer({
                token: SEPOLIA_USDT_ADDRESS,
                recipient: quote.recipient,
                amount: units,
              });
      }
      const entry: PassportActivity = {
        hash: result.hash,
        asset: quote.asset,
        amount: quote.amount,
        recipient: quote.recipient,
        feeWei: result.fee.toString(),
        feeUnit: quote.asset === 'BTC' ? 'sats' : 'wei',
        timestamp: Date.now(),
      };
      setActivity((current) => {
        const next = [entry, ...current].slice(0, 50);
        AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(next)).catch(() => undefined);
        return next;
      });

      // Reflect the deterministic transfer amount immediately. A mined-chain
      // refresh below reconciles gas and any concurrent wallet activity.
      setBalances((current) =>
        quote.asset === 'BTC'
          ? {
              ...current,
              btc: current.btc > units + result.fee ? current.btc - units - result.fee : 0n,
            }
          : quote.asset === 'ETH'
            ? {
                ...current,
                eth: current.eth > units + result.fee ? current.eth - units - result.fee : 0n,
              }
            : {
                ...current,
                usdt: current.usdt > units ? current.usdt - units : 0n,
                eth: current.eth > result.fee ? current.eth - result.fee : 0n,
              }
      );

      // WDK returns after broadcast, which can be one or more blocks before
      // balance RPCs expose the new state. Wait for confirmation in the
      // background, then retry so returning to the wallet never leaves a stale
      // balance on screen.
      void (async () => {
        if (quote.asset === 'BTC') {
          for (const delay of POST_BROADCAST_REFRESH_DELAYS) {
            if (delay > 0) await wait(delay);
            await refresh().catch(() => undefined);
          }
          return;
        }
        try {
          const provider = new JsonRpcProvider(SEPOLIA_RPC);
          await provider.waitForTransaction(result.hash, 1, 60_000);
        } catch {
          // The retry loop still handles providers that time out while polling.
        }
        for (const delay of POST_BROADCAST_REFRESH_DELAYS) {
          if (delay > 0) await wait(delay);
          await refresh().catch(() => undefined);
        }
      })();

      return entry;
    },
    [refresh]
  );

  const cancelSigning = useCallback(async () => {
    await quantumLinkTransport.cancelPending();
  }, []);

  const value = useMemo<PassportContextValue>(
    () => ({
      status,
      initializing,
      walletLoading,
      address,
      btcAddress,
      balances,
      activity,
      error,
      connect,
      pair,
      reconnect,
      disconnect,
      unpair,
      forget,
      refresh,
      quoteTransfer,
      sendTransfer,
      cancelSigning,
      clearError: () => setError(null),
    }),
    [
      status,
      initializing,
      walletLoading,
      address,
      btcAddress,
      balances,
      activity,
      error,
      connect,
      pair,
      reconnect,
      disconnect,
      unpair,
      forget,
      refresh,
      quoteTransfer,
      sendTransfer,
      cancelSigning,
    ]
  );

  return <PassportContext.Provider value={value}>{children}</PassportContext.Provider>;
}

export function usePassport(): PassportContextValue {
  const value = useContext(PassportContext);
  if (!value) throw new Error('usePassport must be used inside PassportProvider');
  return value;
}

export function displayBalance(asset: PassportAsset, balances: PassportBalances): string {
  return asset === 'BTC'
    ? Number(formatUnits(balances.btc, 8)).toLocaleString(undefined, {
        maximumFractionDigits: 8,
      })
    : asset === 'ETH'
      ? Number(formatEther(balances.eth)).toLocaleString(undefined, {
          maximumFractionDigits: 6,
        })
      : Number(formatUnits(balances.usdt, 6)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        });
}
