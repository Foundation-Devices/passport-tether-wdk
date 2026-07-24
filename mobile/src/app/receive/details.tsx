import { AssetGlyph } from '@/components/wallet/AssetGlyph';
import { AssetSheet, NetworkSheet } from '@/components/wallet/AssetNetworkSheets';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { usePassport } from '@/passport/PassportProvider';
import {
  getDefaultNetwork,
  getWalletAsset,
  type WalletAsset,
  type WalletAssetId,
  type WalletNetwork,
} from '@/wallet/catalog';
import { QRCode } from '@tetherto/wdk-uikit-react-native';
import * as Clipboard from 'expo-clipboard';
import { ChevronDown, Copy, RefreshCw, Share2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

export default function ReceiveScreen() {
  const insets = useSafeAreaInsets();
  const { status, walletLoading, address, reconnect } = usePassport();
  const [tab, setTab] = useState<'tetherme' | 'blockchains'>('blockchains');
  const [assetId, setAssetId] = useState<WalletAssetId>('usdt');
  const [network, setNetwork] = useState<WalletNetwork | null>(getDefaultNetwork('usdt'));
  const [assetSheet, setAssetSheet] = useState(false);
  const [networkSheet, setNetworkSheet] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const asset = useMemo(() => getWalletAsset(assetId), [assetId]);
  const routeAvailable = Boolean(asset.enabled && network?.enabled);
  const qrValue = routeAvailable ? address : null;

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

  const copy = async () => {
    if (!qrValue) return;
    await Clipboard.setStringAsync(qrValue);
    toast.success(`${network?.chainLabel ?? 'Wallet'} address copied`);
  };

  const share = async () => {
    if (!qrValue) return;
    await Share.share({
      title: 'Passport Tether Wallet address',
      message: `${network?.chainLabel ?? 'Testnet'} address: ${qrValue}`,
    });
  };

  const retry = async () => {
    setRetrying(true);
    try {
      await reconnect();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not load the Passport account');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <WalletHeader title="Receive Funds" back />
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'tetherme' && styles.tabActive]}
          onPress={() => setTab('tetherme')}
        >
          <Text style={[styles.tabText, tab === 'tetherme' && styles.tabTextActive]}>
            tether.me
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'blockchains' && styles.tabActive]}
          onPress={() => setTab('blockchains')}
        >
          <Text style={[styles.tabText, tab === 'blockchains' && styles.tabTextActive]}>
            Blockchains
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'tetherme' ? (
        <View style={styles.tetherMeUnavailable}>
          <Text style={styles.unavailableTitle}>tether.me isn’t configured</Text>
          <Text style={styles.unavailableCopy}>
            This Passport proof of concept receives directly on public test networks. Choose
            Blockchains to use your Passport-controlled address.
          </Text>
          <TouchableOpacity style={styles.outlineButton} onPress={() => setTab('blockchains')}>
            <Text style={styles.outlineButtonText}>Use Blockchains</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 118 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Receive via Blockchain</Text>
            <View style={styles.selectors}>
              <TouchableOpacity style={styles.selector} onPress={() => setAssetSheet(true)}>
                <AssetGlyph assetId={assetId} size={27} />
                <Text style={styles.selectorText} numberOfLines={1}>
                  {asset.name} {asset.symbol}
                </Text>
                <ChevronDown size={17} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.selector}
                onPress={() => setNetworkSheet(true)}
                disabled={!asset}
              >
                <Text style={styles.selectorText} numberOfLines={1}>
                  {network?.chainLabel ?? 'Choose Network'}
                </Text>
                <ChevronDown size={17} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {routeAvailable ? (
              qrValue ? (
                <View style={styles.receiveReady}>
                  <View style={styles.qrWrap}>
                    <QRCode value={qrValue} size={224} color={colors.text} />
                  </View>
                  <TouchableOpacity style={styles.addressPill} onPress={copy}>
                    <Text style={styles.addressText} numberOfLines={1}>
                      {qrValue}
                    </Text>
                    <Copy size={18} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.testnetWarning}>
                    Testnet only · Never send mainnet funds to this address
                  </Text>
                </View>
              ) : (
                <View style={styles.waiting}>
                  {walletLoading || retrying ? (
                    <ActivityIndicator size="large" color={colors.text} />
                  ) : (
                    <RefreshCw size={42} color={colors.textTertiary} strokeWidth={1.4} />
                  )}
                  <Text style={styles.waitingTitle}>
                    {status.connected ? 'Loading your wallet…' : 'Passport Prime is offline'}
                  </Text>
                  <Text style={styles.waitingCopy}>
                    Connect Passport Prime to load its public receiving address.
                  </Text>
                  <TouchableOpacity style={styles.outlineButton} onPress={retry}>
                    <Text style={styles.outlineButtonText}>Reconnect</Text>
                  </TouchableOpacity>
                </View>
              )
            ) : (
              <View style={styles.waiting}>
                <AssetGlyph assetId={assetId} size={58} />
                <Text style={styles.waitingTitle}>Not available on a public testnet</Text>
                <Text style={styles.waitingCopy}>
                  {network?.reason ??
                    'This asset has no documented public test deployment for the Passport POC.'}
                </Text>
                <Text style={styles.truthLabel}>No mock balance or address will be shown.</Text>
              </View>
            )}
          </ScrollView>
          {qrValue ? (
            <View style={[styles.shareWrap, { bottom: insets.bottom + 18 }]}>
              <TouchableOpacity style={styles.shareButton} onPress={share}>
                <Share2 size={22} color={colors.text} />
                <Text style={styles.shareText}>Share</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}

      <AssetSheet
        visible={assetSheet}
        onClose={() => setAssetSheet(false)}
        onSelect={selectAsset}
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
  tabs: {
    alignSelf: 'center',
    flexDirection: 'row',
    padding: 3,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.035)',
    marginTop: 4,
  },
  tab: {
    minWidth: 104,
    height: 39,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.075)' },
  tabText: { color: colors.textTertiary, fontFamily: fonts.displayBook, fontSize: 16 },
  tabTextActive: { color: colors.text },
  content: { paddingHorizontal: 20, alignItems: 'center' },
  title: {
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 23,
    marginTop: 28,
  },
  selectors: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 25,
  },
  selector: {
    flex: 1,
    height: 53,
    borderRadius: 15,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectorText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.displayBook,
    fontSize: 13,
  },
  receiveReady: { alignItems: 'center', width: '100%', marginTop: 28 },
  qrWrap: {
    width: 250,
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressPill: {
    width: 288,
    height: 53,
    borderRadius: 25,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.075)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  addressText: { flex: 1, color: colors.text, fontFamily: 'monospace', fontSize: 12 },
  testnetWarning: { color: colors.warning, fontSize: 11, marginTop: 13, textAlign: 'center' },
  waiting: {
    width: '100%',
    minHeight: 390,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  waitingTitle: {
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 20,
    marginTop: 22,
    textAlign: 'center',
  },
  waitingCopy: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 310,
  },
  truthLabel: { color: colors.textTertiary, fontSize: 11, marginTop: 13 },
  outlineButton: {
    minWidth: 190,
    height: 51,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  outlineButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  tetherMeUnavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingBottom: 80,
  },
  unavailableTitle: { color: colors.text, fontSize: 23, fontFamily: fonts.displayMedium },
  unavailableCopy: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  shareWrap: { position: 'absolute', left: 20, right: 20 },
  shareButton: {
    height: 60,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.text,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shareText: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 17 },
});
