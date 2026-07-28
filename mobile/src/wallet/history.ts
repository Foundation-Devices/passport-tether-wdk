import { formatUnits } from 'ethers';

/**
 * Chain-derived transaction history.
 *
 * The wallet used to list only the transfers this install had sent, so funding
 * a fresh account left the Transactions screen empty while the balance moved.
 * Receives are read back from the same public testnet services the balances
 * already use, and both directions are merged in the provider.
 *
 * Everything here is testnet-only and takes an injected fetch so the parsing
 * can be exercised without network access.
 */

export type HistoryAsset = 'BTC' | 'ETH' | 'USD₮';
export type HistoryDirection = 'in' | 'out';

export type HistoryEntry = {
  hash: string;
  asset: HistoryAsset;
  amount: string;
  /** The other side of the transfer: sender for receives, recipient for sends. */
  recipient: string;
  direction: HistoryDirection;
  feeWei: string;
  feeUnit: 'wei' | 'sats';
  timestamp: number;
};

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const SATS_DECIMALS = 8;
const USDT_DECIMALS = 6;

function trimAmount(value: bigint, decimals: number): string {
  const text = formatUnits(value, decimals);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

function sameAddress(left: string | null | undefined, right: string): boolean {
  return typeof left === 'string' && left.toLowerCase() === right.toLowerCase();
}

/* ------------------------------- Bitcoin -------------------------------- */

type EsploraVin = { prevout?: { scriptpubkey_address?: string; value?: number } | null };
type EsploraVout = { scriptpubkey_address?: string; value?: number };
type EsploraTx = {
  txid?: string;
  fee?: number;
  vin?: EsploraVin[];
  vout?: EsploraVout[];
  status?: { confirmed?: boolean; block_time?: number };
};

/**
 * Esplora reports raw inputs and outputs rather than a direction, so classify
 * by the net effect on our own scriptPubKey. A send is measured by what left
 * the wallet rather than the net delta, otherwise change outputs would
 * understate the transfer.
 */
export function parseEsploraHistory(
  transactions: unknown,
  address: string,
  now: number
): HistoryEntry[] {
  if (!Array.isArray(transactions)) return [];
  const entries: HistoryEntry[] = [];

  for (const raw of transactions as EsploraTx[]) {
    const hash = raw?.txid;
    if (typeof hash !== 'string' || !hash) continue;

    const vins = Array.isArray(raw.vin) ? raw.vin : [];
    const vouts = Array.isArray(raw.vout) ? raw.vout : [];

    let ownedIn = 0n;
    for (const vin of vins) {
      if (sameAddress(vin?.prevout?.scriptpubkey_address, address)) {
        ownedIn += BigInt(Math.trunc(vin?.prevout?.value ?? 0));
      }
    }

    let ownedOut = 0n;
    let sentOut = 0n;
    let counterparty = '';
    for (const vout of vouts) {
      const value = BigInt(Math.trunc(vout?.value ?? 0));
      if (sameAddress(vout?.scriptpubkey_address, address)) {
        ownedOut += value;
      } else {
        sentOut += value;
        if (!counterparty && typeof vout?.scriptpubkey_address === 'string') {
          counterparty = vout.scriptpubkey_address;
        }
      }
    }

    if (ownedIn === 0n && ownedOut === 0n) continue;

    const outgoing = ownedIn > 0n;
    const amount = outgoing ? sentOut : ownedOut - ownedIn;
    if (amount <= 0n) continue;

    if (!outgoing) {
      counterparty = '';
      for (const vin of vins) {
        const from = vin?.prevout?.scriptpubkey_address;
        if (typeof from === 'string' && !sameAddress(from, address)) {
          counterparty = from;
          break;
        }
      }
    }

    const blockTime = raw.status?.block_time;
    entries.push({
      hash,
      asset: 'BTC',
      amount: trimAmount(amount, SATS_DECIMALS),
      recipient: counterparty,
      direction: outgoing ? 'out' : 'in',
      feeWei: String(Math.trunc(raw.fee ?? 0)),
      feeUnit: 'sats',
      timestamp: typeof blockTime === 'number' && blockTime > 0 ? blockTime * 1000 : now,
    });
  }

  return entries;
}

export async function fetchBitcoinHistory(
  address: string,
  apiBase: string,
  fetcher: Fetcher,
  now: number
): Promise<HistoryEntry[]> {
  const response = await fetcher(`${apiBase.replace(/\/$/, '')}/address/${address}/txs`);
  if (!response.ok) {
    throw new Error(`Bitcoin history request failed with status ${response.status}`);
  }
  return parseEsploraHistory(await response.json(), address, now);
}

/* -------------------------------- Sepolia -------------------------------- */

type BlockscoutAddress = { hash?: string } | null;
type BlockscoutNativeTx = {
  hash?: string;
  from?: BlockscoutAddress;
  to?: BlockscoutAddress;
  value?: string;
  timestamp?: string;
  fee?: { value?: string } | null;
};
type BlockscoutTokenTransfer = {
  transaction_hash?: string;
  from?: BlockscoutAddress;
  to?: BlockscoutAddress;
  timestamp?: string;
  // Blockscout returns the contract as `address_hash`; some deployments still
  // emit `address`. Reading only one of them silently drops every token
  // transfer, which looks identical to "no USD₮ history" because the native
  // ETH feed keeps working.
  token?: { address?: string; address_hash?: string } | null;
  total?: { value?: string; decimals?: string } | null;
};

function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBigInt(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 0n;
  return BigInt(value);
}

/** Native Sepolia ETH transfers. Contract calls that move no value are noise here. */
export function parseSepoliaNativeHistory(
  payload: unknown,
  address: string,
  now: number
): HistoryEntry[] {
  const items = (payload as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];

  const entries: HistoryEntry[] = [];
  for (const raw of items as BlockscoutNativeTx[]) {
    const hash = raw?.hash;
    if (typeof hash !== 'string' || !hash) continue;

    const value = toBigInt(raw.value);
    if (value === 0n) continue;

    const from = raw.from?.hash ?? '';
    const to = raw.to?.hash ?? '';
    const outgoing = sameAddress(from, address);
    if (!outgoing && !sameAddress(to, address)) continue;

    entries.push({
      hash,
      asset: 'ETH',
      amount: trimAmount(value, 18),
      recipient: outgoing ? to : from,
      direction: outgoing ? 'out' : 'in',
      feeWei: toBigInt(raw.fee?.value).toString(),
      feeUnit: 'wei',
      timestamp: parseTimestamp(raw.timestamp, now),
    });
  }
  return entries;
}

/**
 * ERC-20 transfers, restricted to the allowlisted test USD₮ contract. Any
 * address can mint a token that claims to be USD₮, so an unfiltered feed would
 * let a stranger write convincing entries into the history.
 */
export function parseSepoliaTokenHistory(
  payload: unknown,
  address: string,
  tokenAddress: string,
  now: number
): HistoryEntry[] {
  const items = (payload as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];

  const entries: HistoryEntry[] = [];
  for (const raw of items as BlockscoutTokenTransfer[]) {
    const hash = raw?.transaction_hash;
    if (typeof hash !== 'string' || !hash) continue;
    const contract = raw.token?.address_hash ?? raw.token?.address;
    if (!sameAddress(contract, tokenAddress)) continue;

    const from = raw.from?.hash ?? '';
    const to = raw.to?.hash ?? '';
    const outgoing = sameAddress(from, address);
    if (!outgoing && !sameAddress(to, address)) continue;

    const value = toBigInt(raw.total?.value);
    if (value === 0n) continue;

    const decimals = Number(raw.total?.decimals ?? USDT_DECIMALS);
    entries.push({
      hash,
      asset: 'USD₮',
      amount: trimAmount(value, Number.isFinite(decimals) ? decimals : USDT_DECIMALS),
      recipient: outgoing ? to : from,
      direction: outgoing ? 'out' : 'in',
      feeWei: '0',
      feeUnit: 'wei',
      timestamp: parseTimestamp(raw.timestamp, now),
    });
  }
  return entries;
}

export async function fetchSepoliaHistory(
  address: string,
  explorerBase: string,
  tokenAddress: string,
  fetcher: Fetcher,
  now: number
): Promise<HistoryEntry[]> {
  const base = explorerBase.replace(/\/$/, '');
  const [native, tokens] = await Promise.allSettled([
    fetcher(`${base}/api/v2/addresses/${address}/transactions`),
    fetcher(`${base}/api/v2/addresses/${address}/token-transfers?type=ERC-20`),
  ]);

  const entries: HistoryEntry[] = [];
  if (native.status === 'fulfilled' && native.value.ok) {
    entries.push(...parseSepoliaNativeHistory(await native.value.json(), address, now));
  }
  if (tokens.status === 'fulfilled' && tokens.value.ok) {
    entries.push(
      ...parseSepoliaTokenHistory(await tokens.value.json(), address, tokenAddress, now)
    );
  }
  return entries;
}

/* -------------------------------- Merging -------------------------------- */

/**
 * Confirmed chain entries win over the optimistic record written at send time,
 * which carries a local clock and no confirmation. Locally-known sends that the
 * explorer has not indexed yet are kept so a fresh transfer never disappears.
 */
export function mergeHistory(
  chain: HistoryEntry[],
  local: HistoryEntry[],
  limit = 50
): HistoryEntry[] {
  const byHash = new Map<string, HistoryEntry>();
  for (const entry of local) byHash.set(entry.hash.toLowerCase(), entry);
  for (const entry of chain) byHash.set(entry.hash.toLowerCase(), entry);
  return [...byHash.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}
