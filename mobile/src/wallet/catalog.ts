export type WalletAssetId = 'btc' | 'usdt' | 'usat' | 'xaut' | 'eth';

export type WalletNetworkId =
  | 'bitcoin-testnet'
  | 'ethereum-sepolia'
  | 'plasma'
  | 'polygon'
  | 'arbitrum'
  | 'tron';

export type WalletAsset = {
  id: WalletAssetId;
  name: string;
  symbol: string;
  group: 'Bitcoin' | 'Digital Dollars' | 'Gold' | 'Network gas';
  accent: string;
  enabled: boolean;
};

export type WalletNetwork = {
  id: WalletNetworkId;
  assetId: WalletAssetId;
  name: string;
  displayName: string;
  chainLabel: string;
  enabled: boolean;
  reason?: string;
};

export const walletAssets: readonly WalletAsset[] = [
  {
    id: 'btc',
    name: 'Bitcoin',
    symbol: 'BTC',
    group: 'Bitcoin',
    accent: '#F7931A',
    enabled: true,
  },
  {
    id: 'usdt',
    name: 'Tether USD',
    symbol: 'USD₮',
    group: 'Digital Dollars',
    accent: '#26A17B',
    enabled: true,
  },
  {
    id: 'usat',
    name: 'Tether USA',
    symbol: 'USA₮',
    group: 'Digital Dollars',
    accent: '#4B37D1',
    enabled: false,
  },
  {
    id: 'xaut',
    name: 'Tether Gold',
    symbol: 'XAU₮',
    group: 'Gold',
    accent: '#D9B642',
    enabled: false,
  },
  {
    id: 'eth',
    name: 'Ethereum',
    symbol: 'ETH',
    group: 'Network gas',
    accent: '#6F7CBA',
    enabled: true,
  },
] as const;

export const walletNetworks: readonly WalletNetwork[] = [
  {
    id: 'bitcoin-testnet',
    assetId: 'btc',
    name: 'Bitcoin Testnet',
    displayName: 'BTC on Bitcoin Testnet',
    chainLabel: 'Bitcoin Testnet',
    enabled: true,
  },
  {
    id: 'ethereum-sepolia',
    assetId: 'usdt',
    name: 'Ethereum Sepolia',
    displayName: 'USD₮ on Ethereum',
    chainLabel: 'Ethereum Sepolia',
    enabled: true,
  },
  {
    id: 'plasma',
    assetId: 'usdt',
    name: 'Plasma',
    displayName: 'USD₮ on Plasma',
    chainLabel: 'Plasma',
    enabled: false,
    reason: 'No public testnet route is configured for this proof of concept.',
  },
  {
    id: 'polygon',
    assetId: 'usdt',
    name: 'Polygon',
    displayName: 'USD₮ on Polygon',
    chainLabel: 'Polygon',
    enabled: false,
    reason: 'No allowlisted test USD₮ deployment is configured on Polygon Amoy.',
  },
  {
    id: 'arbitrum',
    assetId: 'usdt',
    name: 'Arbitrum',
    displayName: 'USD₮ on Arbitrum',
    chainLabel: 'Arbitrum',
    enabled: false,
    reason: 'No allowlisted test USD₮ deployment is configured on Arbitrum Sepolia.',
  },
  {
    id: 'tron',
    assetId: 'usdt',
    name: 'Tron',
    displayName: 'USD₮ on Tron',
    chainLabel: 'Tron',
    enabled: false,
    reason: 'Passport hardware signing for the WDK Tron module is not implemented yet.',
  },
  {
    id: 'ethereum-sepolia',
    assetId: 'eth',
    name: 'Ethereum Sepolia',
    displayName: 'ETH on Ethereum',
    chainLabel: 'Ethereum Sepolia',
    enabled: true,
  },
] as const;

export function getWalletAsset(id: WalletAssetId): WalletAsset {
  const asset = walletAssets.find((candidate) => candidate.id === id);
  if (!asset) throw new Error(`Unknown wallet asset: ${id}`);
  return asset;
}

export function getNetworksForAsset(assetId: WalletAssetId): readonly WalletNetwork[] {
  return walletNetworks.filter((network) => network.assetId === assetId);
}

export function getDefaultNetwork(assetId: WalletAssetId): WalletNetwork | null {
  return getNetworksForAsset(assetId).find((network) => network.enabled) ?? null;
}

export function toPassportAsset(assetId: WalletAssetId): 'BTC' | 'USD₮' | 'ETH' | null {
  if (assetId === 'btc') return 'BTC';
  if (assetId === 'usdt') return 'USD₮';
  if (assetId === 'eth') return 'ETH';
  return null;
}
