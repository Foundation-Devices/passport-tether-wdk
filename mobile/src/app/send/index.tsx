import { AssetGlyph, NetworkGlyph } from '@/components/wallet/AssetGlyph';
import { AssetSheet, NetworkSheet } from '@/components/wallet/AssetNetworkSheets';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import {
  getDefaultNetwork,
  getWalletAsset,
  toPassportAsset,
  type WalletAsset,
  type WalletAssetId,
  type WalletNetwork,
} from '@/wallet/catalog';
import { useRouter } from 'expo-router';
import { ChevronDown, ShieldCheck } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SendFundsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [assetId, setAssetId] = useState<WalletAssetId>('usdt');
  const [network, setNetwork] = useState<WalletNetwork | null>(getDefaultNetwork('usdt'));
  const [assetSheet, setAssetSheet] = useState(false);
  const [networkSheet, setNetworkSheet] = useState(false);
  const asset = useMemo(() => getWalletAsset(assetId), [assetId]);
  const passportAsset = toPassportAsset(assetId);
  const canContinue = Boolean(asset.enabled && network?.enabled && passportAsset);

  const selectAsset = (next: WalletAsset) => {
    setAssetId(next.id);
    setNetwork(getDefaultNetwork(next.id));
    setAssetSheet(false);
    if (next.enabled) setNetworkSheet(true);
  };

  const selectNetwork = (next: WalletNetwork) => {
    setNetwork(next);
    setNetworkSheet(false);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <WalletHeader title="Send Funds" back />
      <View style={styles.content}>
        <Text style={styles.title}>Choose what to send</Text>
        <Text style={styles.subtitle}>
          Select a test asset and network. Passport Prime will independently review every transfer.
        </Text>

        <Text style={styles.label}>Currency</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setAssetSheet(true)}>
          <AssetGlyph assetId={assetId} size={44} />
          <View style={styles.selectorCopy}>
            <Text style={styles.selectorTitle}>{asset.name}</Text>
            <Text style={styles.selectorDetail}>{asset.symbol}</Text>
          </View>
          <ChevronDown size={21} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={styles.label}>Network</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setNetworkSheet(true)}>
          {network ? (
            <NetworkGlyph networkId={network.id} size={44} />
          ) : (
            <View style={styles.networkMark} />
          )}
          <View style={styles.selectorCopy}>
            <Text style={styles.selectorTitle}>{network?.chainLabel ?? 'Choose Network'}</Text>
            <Text style={styles.selectorDetail}>
              {network?.enabled ? 'Testnet · Passport enabled' : 'Unavailable in this testnet POC'}
            </Text>
          </View>
          <ChevronDown size={21} color={colors.textSecondary} />
        </TouchableOpacity>

        {!canContinue ? (
          <View style={styles.unavailable}>
            <Text style={styles.unavailableTitle}>This route is not enabled</Text>
            <Text style={styles.unavailableText}>
              {network?.reason ??
                'There is no documented public test deployment and Passport signer for this route.'}
            </Text>
          </View>
        ) : (
          <View style={styles.security}>
            <ShieldCheck size={20} color={colors.connected} />
            <Text style={styles.securityText}>Private key stays on Passport Prime</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.continueButton, !canContinue && styles.disabled]}
          disabled={!canContinue}
          onPress={() =>
            router.push({
              pathname: '/send/details',
              params: { asset: passportAsset ?? 'USD₮' },
            })
          }
        >
          <Text style={styles.continueText}>Continue</Text>
        </TouchableOpacity>
      </View>

      <AssetSheet
        visible={assetSheet}
        onClose={() => setAssetSheet(false)}
        onSelect={selectAsset}
        includeGas
      />
      <NetworkSheet
        visible={networkSheet}
        assetId={assetId}
        onClose={() => setNetworkSheet(false)}
        onSelect={selectNetwork}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: 21, paddingTop: 22 },
  title: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 26 },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 9 },
  label: { color: colors.textSecondary, fontSize: 12, marginTop: 27, marginBottom: 9 },
  selector: {
    height: 76,
    borderRadius: 18,
    paddingHorizontal: 15,
    backgroundColor: 'rgba(255,255,255,0.055)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectorCopy: { flex: 1, marginLeft: 13 },
  selectorTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  selectorDetail: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  networkMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  unavailable: {
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 16,
    marginTop: 25,
  },
  unavailableTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  unavailableText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  security: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 25 },
  securityText: { color: colors.textSecondary, fontSize: 13 },
  continueButton: {
    height: 59,
    borderRadius: 16,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    marginBottom: 28,
  },
  disabled: { opacity: 0.28 },
  continueText: { color: colors.background, fontFamily: fonts.displayMedium, fontSize: 17 },
});
