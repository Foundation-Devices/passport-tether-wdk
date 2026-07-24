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
import { quantumLinkTransport } from './QuantumLinkTransport';

export const SEPOLIA_USDT_ADDRESS = '0xd077a400968890eacc75cdc901f0356c943e4fdb';
export const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';
export const PASSPORT_MAX_FEE_WEI = 50_000_000_000_000_000n;
const SEPOLIA_RPC =
  process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const ACTIVITY_KEY = 'passport_tether_wdk_activity_v1';
const ACCOUNT_KEY = 'passport_tether_wdk_account_v1';
const WALLET_BOOTSTRAP_RETRY_DELAYS = [0, 750, 2_000];
const POST_BROADCAST_REFRESH_DELAYS = [0, 1_500, 4_000];

export type PassportAsset = 'ETH' | 'USD₮';

export type PassportBalances = {
  eth: bigint;
  usdt: bigint;
};

export type PassportActivity = {
  hash: string;
  asset: PassportAsset;
  amount: string;
  recipient: string;
  feeWei: string;
  timestamp: number;
};

export type TransferQuote = {
  asset: PassportAsset;
  amount: string;
  recipient: string;
  feeWei: bigint;
};

type PassportContextValue = {
  status: QuantumLinkStatus;
  initializing: boolean;
  walletLoading: boolean;
  address: string | null;
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
    const parsed = JSON.parse(value) as { deviceAddress?: string; address?: string };
    if (parsed.deviceAddress?.toUpperCase() !== deviceAddress.toUpperCase() || !parsed.address) {
      return null;
    }
    return getAddress(parsed.address);
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
  const [balances, setBalances] = useState<PassportBalances>({ eth: 0n, usdt: 0n });
  const [activity, setActivity] = useState<PassportActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<PassportWalletSession | null>(null);
  const bootstrappingRef = useRef<Promise<void> | null>(null);

  const disposeSession = useCallback(() => {
    sessionRef.current?.manager.dispose();
    sessionRef.current = null;
    bootstrappingRef.current = null;
    setWalletLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const account = sessionRef.current?.account;
    if (!account) return;
    setWalletLoading(true);
    try {
      const [eth, usdt] = await Promise.all([
        account.getBalance(),
        account.getTokenBalance(SEPOLIA_USDT_ADDRESS),
      ]);
      setBalances({ eth, usdt });
      setError(null);
    } catch (cause) {
      setError(`Could not refresh Sepolia balances: ${errorMessage(cause)}`);
    } finally {
      setWalletLoading(false);
    }
  }, []);

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
            JSON.stringify({ deviceAddress: connectedDevice, address: session.address })
          ).catch(() => undefined);
        }
        setError(null);

        try {
          const [eth, usdt] = await Promise.all([
            session.account.getBalance(),
            session.account.getTokenBalance(SEPOLIA_USDT_ADDRESS),
          ]);
          setBalances({ eth, usdt });
        } catch (cause) {
          // The verified public address remains usable for Receive even when
          // the public Sepolia RPC is temporarily unavailable.
          setError(`Account connected, but balances could not refresh: ${errorMessage(cause)}`);
        }
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
      setBalances({ eth: 0n, usdt: 0n });
      updateStatus();
    });

    Promise.all([loadActivity()])
      .then(async ([storedActivity]) => {
        if (!active) return;
        setActivity(storedActivity);
        const current = PassportQuantumLink.getStatus();
        if (current.paired) {
          setAddress(await loadCachedAddress(current.deviceAddress));
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
    setBalances({ eth: 0n, usdt: 0n });
    await AsyncStorage.removeItem(ACCOUNT_KEY);
    setStatus(PassportQuantumLink.getStatus());
  }, [disposeSession]);

  const forget = useCallback(async () => {
    await PassportQuantumLink.forget();
    disposeSession();
    setAddress(null);
    setBalances({ eth: 0n, usdt: 0n });
    await AsyncStorage.removeItem(ACCOUNT_KEY);
    setStatus(PassportQuantumLink.getStatus());
  }, [disposeSession]);

  const quoteTransfer = useCallback(
    async (asset: PassportAsset, amount: string, recipient: string): Promise<TransferQuote> => {
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
      if (!account) throw new Error('Reconnect Passport Prime before signing');
      const units = quote.asset === 'ETH' ? parseEther(quote.amount) : parseUnits(quote.amount, 6);
      const result =
        quote.asset === 'ETH'
          ? await account.sendTransaction({ to: quote.recipient, value: units })
          : await account.transfer({
              token: SEPOLIA_USDT_ADDRESS,
              recipient: quote.recipient,
              amount: units,
            });
      const entry: PassportActivity = {
        hash: result.hash,
        asset: quote.asset,
        amount: quote.amount,
        recipient: quote.recipient,
        feeWei: result.fee.toString(),
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
        quote.asset === 'ETH'
          ? {
              ...current,
              eth: current.eth > units ? current.eth - units : 0n,
            }
          : {
              ...current,
              usdt: current.usdt > units ? current.usdt - units : 0n,
            }
      );

      // WDK returns after broadcast, which can be one or more blocks before
      // balance RPCs expose the new state. Wait for confirmation in the
      // background, then retry so returning to the wallet never leaves a stale
      // balance on screen.
      void (async () => {
        try {
          const provider = new JsonRpcProvider(SEPOLIA_RPC);
          await provider.waitForTransaction(result.hash, 1, 60_000);
        } catch {
          // The retry loop still handles providers that time out while polling.
        }
        for (const delay of POST_BROADCAST_REFRESH_DELAYS) {
          if (delay > 0) await wait(delay);
          await refresh();
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
  return asset === 'ETH'
    ? Number(formatEther(balances.eth)).toLocaleString(undefined, {
        maximumFractionDigits: 6,
      })
    : Number(formatUnits(balances.usdt, 6)).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      });
}
