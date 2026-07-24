import type { WalletAssetId, WalletNetworkId } from '@/wallet/catalog';
import { Bitcoin, CircleDollarSign, Coins, Gem } from 'lucide-react-native';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const assetImages: Partial<Record<WalletAssetId, number>> = {
  btc: require('../../../assets/images/tokens/bitcoin-btc-logo.png'),
  usdt: require('../../../assets/images/tokens/tether-usdt-logo.png'),
  xaut: require('../../../assets/images/tokens/tether-xaut-logo.png'),
  eth: require('../../../assets/images/chains/ethereum-eth-logo.png'),
};

const networkImages: Partial<Record<WalletNetworkId, number>> = {
  'bitcoin-testnet': require('../../../assets/images/chains/bitcoin-btc-logo.png'),
  'ethereum-sepolia': require('../../../assets/images/chains/ethereum-eth-logo.png'),
  polygon: require('../../../assets/images/chains/polygon-matic-logo.png'),
  arbitrum: require('../../../assets/images/chains/arbitrum-arb-logo.png'),
  tron: require('../../../assets/images/chains/tron-trx-logo.png'),
};

export function AssetGlyph({ assetId, size = 48 }: { assetId: WalletAssetId; size?: number }) {
  const image = assetImages[assetId];
  if (image) {
    return <Image source={image} style={{ width: size, height: size, resizeMode: 'contain' }} />;
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: assetId === 'usat' ? '#3423A6' : '#242424',
        },
      ]}
    >
      {assetId === 'usat' ? (
        <Text style={[styles.star, { fontSize: size * 0.46 }]}>★</Text>
      ) : assetId === 'btc' ? (
        <Bitcoin size={size * 0.54} color="#FFFFFF" />
      ) : assetId === 'xaut' ? (
        <Gem size={size * 0.48} color="#FFFFFF" />
      ) : assetId === 'usdt' ? (
        <CircleDollarSign size={size * 0.48} color="#FFFFFF" />
      ) : (
        <Coins size={size * 0.48} color="#FFFFFF" />
      )}
    </View>
  );
}

export function NetworkGlyph({
  networkId,
  size = 48,
}: {
  networkId: WalletNetworkId;
  size?: number;
}) {
  const image = networkImages[networkId];
  if (image) {
    return <Image source={image} style={{ width: size, height: size, resizeMode: 'contain' }} />;
  }
  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: '#242424' },
      ]}
    >
      <Text style={[styles.networkLetter, { fontSize: size * 0.36 }]}>
        {networkId === 'plasma' ? 'P' : '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  star: { color: '#FFFFFF', lineHeight: undefined },
  networkLetter: { color: '#FFFFFF', fontWeight: '700' },
});
