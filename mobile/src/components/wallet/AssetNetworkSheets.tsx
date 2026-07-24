import { AssetGlyph, NetworkGlyph } from '@/components/wallet/AssetGlyph';
import { WalletBottomSheet } from '@/components/wallet/WalletBottomSheet';
import { colors } from '@/constants/colors';
import {
  getNetworksForAsset,
  walletAssets,
  type WalletAsset,
  type WalletAssetId,
  type WalletNetwork,
} from '@/wallet/catalog';
import { ChevronRight, LockKeyhole } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const groups = ['Bitcoin', 'Digital Dollars', 'Gold', 'Network gas'] as const;

export function AssetSheet({
  visible,
  onClose,
  onSelect,
  includeGas = false,
}: {
  visible: boolean;
  onClose(): void;
  onSelect(asset: WalletAsset): void;
  includeGas?: boolean;
}) {
  return (
    <WalletBottomSheet visible={visible} title="Choose Currency" onClose={onClose}>
      {groups.map((group) => {
        if (group === 'Network gas' && !includeGas) return null;
        const entries = walletAssets.filter((asset) => asset.group === group);
        if (!entries.length) return null;
        return (
          <View key={group} style={styles.group}>
            <Text style={styles.groupTitle}>{group}</Text>
            {entries.map((asset) => (
              <TouchableOpacity
                key={asset.id}
                style={styles.row}
                onPress={() => onSelect(asset)}
                activeOpacity={0.75}
              >
                <AssetGlyph assetId={asset.id} size={48} />
                <View style={styles.copy}>
                  <Text style={styles.rowTitle}>
                    {asset.id === 'btc'
                      ? 'BTC'
                      : asset.id === 'eth'
                        ? 'Ethereum'
                        : asset.id === 'xaut'
                          ? `${asset.name} ${asset.symbol}`
                          : `Tether ${asset.symbol}`}
                  </Text>
                  {!asset.enabled ? (
                    <Text style={styles.unavailable}>Testnet unavailable</Text>
                  ) : null}
                </View>
                <ChevronRight size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
    </WalletBottomSheet>
  );
}

export function NetworkSheet({
  visible,
  assetId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  assetId: WalletAssetId;
  onClose(): void;
  onSelect(network: WalletNetwork): void;
}) {
  const networks = getNetworksForAsset(assetId);
  return (
    <WalletBottomSheet visible={visible} title="Choose Network" onClose={onClose}>
      <Text style={styles.groupTitle}>
        {assetId === 'btc' ? 'Bitcoin' : assetId === 'xaut' ? 'Gold' : 'Digital Dollars'}
      </Text>
      {networks.length ? (
        networks.map((network) => (
          <TouchableOpacity
            key={`${network.assetId}-${network.id}`}
            style={styles.row}
            onPress={() => onSelect(network)}
            activeOpacity={0.75}
          >
            <NetworkGlyph networkId={network.id} size={48} />
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>{network.displayName}</Text>
              {!network.enabled ? (
                <Text style={styles.unavailable}>Testnet unavailable</Text>
              ) : (
                <Text style={styles.available}>Passport enabled</Text>
              )}
            </View>
            {network.enabled ? (
              <ChevronRight size={20} color={colors.textTertiary} />
            ) : (
              <LockKeyhole size={17} color={colors.textTertiary} />
            )}
          </TouchableOpacity>
        ))
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No public testnet route</Text>
          <Text style={styles.emptyCopy}>
            This Tether asset does not have a documented public test deployment for this POC.
          </Text>
        </View>
      )}
    </WalletBottomSheet>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 20 },
  groupTitle: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 9,
    marginLeft: 5,
  },
  row: {
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.045)',
    marginBottom: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  copy: { flex: 1, marginLeft: 13 },
  rowTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  unavailable: { color: colors.textTertiary, fontSize: 11, marginTop: 4 },
  available: { color: colors.connected, fontSize: 11, marginTop: 4 },
  empty: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 22,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  emptyCopy: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 7 },
});
