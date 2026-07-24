import { colors } from '@/constants/colors';
import { fonts, typography } from '@/constants/typography';
import {
  displayBalance,
  SEPOLIA_EXPLORER,
  usePassport,
  type PassportAsset,
} from '@/passport/PassportProvider';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  RefreshCw,
  Settings,
  ShieldCheck,
  Unplug,
} from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

const ASSETS: {
  symbol: PassportAsset;
  name: string;
  icon: number;
}[] = [
  {
    symbol: 'USD₮',
    name: 'Tether USD',
    icon: require('../../assets/images/tokens/tether-usdt-logo.png'),
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    icon: require('../../assets/images/chains/ethereum-eth-logo.png'),
  },
];

function shortAddress(value: string): string {
  return `${value.slice(0, 7)}…${value.slice(-5)}`;
}

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    status,
    walletLoading,
    address,
    balances,
    activity,
    error,
    reconnect,
    refresh,
    clearError,
  } = usePassport();
  const [refreshing, setRefreshing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const copyAddress = useCallback(async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    toast.success('Sepolia address copied');
  }, [address]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const onReconnect = useCallback(async () => {
    setReconnecting(true);
    clearError();
    try {
      await reconnect();
      toast.success('Passport Prime connected');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not reconnect Passport');
    } finally {
      setReconnecting(false);
    }
  }, [clearError, reconnect]);

  const openSend = (asset: PassportAsset = 'USD₮') => {
    router.push({ pathname: '/send/details', params: { asset } });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/tether-wallet-wordmark.png')}
          style={styles.brand}
        />
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.linkPill, status.connected ? styles.linkPillOnline : null]}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Manage Passport Prime connection"
          >
            <View
              style={[
                styles.linkDot,
                status.connected ? styles.linkDotOnline : styles.linkDotOffline,
              ]}
            />
            <Text style={styles.linkText}>PASSPORT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/settings')}>
            <Settings size={21} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {!status.connected ? (
          <View style={styles.offlineCard}>
            <View style={styles.offlineIcon}>
              <Unplug size={21} color={colors.warning} />
            </View>
            <View style={styles.offlineCopy}>
              <Text style={styles.offlineTitle}>Passport Prime is offline</Text>
              <Text style={styles.offlineDetail}>
                Reconnect to refresh or authorize a transfer.
              </Text>
            </View>
            <TouchableOpacity style={styles.reconnectButton} onPress={onReconnect}>
              {reconnecting ? (
                <ActivityIndicator color={colors.black} size="small" />
              ) : (
                <RefreshCw size={17} color={colors.black} />
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {error ? (
          <TouchableOpacity style={styles.errorCard} onPress={clearError}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.dismiss}>DISMISS</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.walletLabelRow}>
          <View>
            <Text style={styles.eyebrow}>PASSPORT WALLET</Text>
            <Text style={styles.walletTitle}>Sepolia portfolio</Text>
          </View>
          <View style={styles.testnetPill}>
            <Text style={styles.testnetText}>TESTNET</Text>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceGlow} />
          <View style={styles.balanceTop}>
            <View>
              <Text style={styles.balanceLabel}>Tether USD</Text>
              <View style={styles.balanceLine}>
                <Text style={styles.balanceValue}>{displayBalance('USD₮', balances)}</Text>
                <Text style={styles.balanceSymbol}> USD₮</Text>
              </View>
            </View>
            <Image
              source={require('../../assets/images/tokens/tether-usdt-logo.png')}
              style={styles.heroToken}
            />
          </View>
          <TouchableOpacity style={styles.addressRow} onPress={copyAddress} disabled={!address}>
            <ShieldCheck size={16} color="rgba(255,255,255,0.78)" />
            <Text style={styles.addressText}>
              {address
                ? shortAddress(address)
                : status.connected
                  ? 'Loading account…'
                  : 'Reconnect to load'}
            </Text>
            {address ? <Copy size={15} color="rgba(255,255,255,0.78)" /> : null}
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <ActionButton icon={ArrowUpRight} title="Send" primary onPress={() => openSend('USD₮')} />
          <ActionButton
            icon={ArrowDownLeft}
            title="Receive"
            onPress={() => router.push('/receive/details')}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Assets</Text>
          {walletLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>
        <View style={styles.listCard}>
          {ASSETS.map((asset, index) => (
            <TouchableOpacity
              key={asset.symbol}
              style={[styles.assetRow, index === ASSETS.length - 1 ? styles.lastRow : null]}
              onPress={() => openSend(asset.symbol)}
            >
              <Image source={asset.icon} style={styles.assetIcon} />
              <View style={styles.assetCopy}>
                <Text style={styles.assetName}>{asset.name}</Text>
                <Text style={styles.assetNetwork}>Ethereum Sepolia</Text>
              </View>
              <View style={styles.assetBalance}>
                <Text style={styles.assetAmount}>{displayBalance(asset.symbol, balances)}</Text>
                <Text style={styles.assetSymbol}>{asset.symbol}</Text>
              </View>
              <ChevronRight size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <TouchableOpacity onPress={() => router.push('/activity')}>
            <Text style={styles.seeAll}>SEE ALL</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.listCard}>
          {activity.length ? (
            activity.slice(0, 3).map((item, index) => (
              <TouchableOpacity
                key={item.hash}
                style={[
                  styles.activityRow,
                  index === Math.min(activity.length, 3) - 1 && styles.lastRow,
                ]}
                onPress={() => Linking.openURL(`${SEPOLIA_EXPLORER}/tx/${item.hash}`)}
              >
                <View style={styles.sentIcon}>
                  <ArrowUpRight size={18} color={colors.primary} />
                </View>
                <View style={styles.assetCopy}>
                  <Text style={styles.assetName}>Sent {item.asset}</Text>
                  <Text style={styles.assetNetwork}>
                    {new Date(item.timestamp).toLocaleDateString()} • {shortAddress(item.recipient)}
                  </Text>
                </View>
                <Text style={styles.sentAmount}>
                  −{item.amount} {item.asset}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyActivity}>
              <View style={styles.emptyCheck}>
                <Check size={18} color={colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptyDetail}>Approved Sepolia transfers will appear here.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function ActionButton({
  icon: Icon,
  title,
  onPress,
  primary,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  onPress(): void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, primary ? styles.actionPrimary : null]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <Icon size={21} color={colors.text} />
      <Text style={[styles.actionText, primary ? styles.actionTextPrimary : null]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 68,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  brand: { width: 148, height: 24, resizeMode: 'contain' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkPill: {
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  linkPillOnline: { backgroundColor: colors.tintedBackground },
  linkDot: { width: 7, height: 7, borderRadius: 4 },
  linkDotOnline: { backgroundColor: colors.connected },
  linkDotOffline: { backgroundColor: colors.disconnected },
  linkText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 20, paddingBottom: 50 },
  offlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningBackground,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: 17,
    padding: 13,
    marginBottom: 18,
  },
  offlineIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,149,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineCopy: { flex: 1, marginHorizontal: 12 },
  offlineTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  offlineDetail: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  reconnectButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    backgroundColor: colors.dangerBackground,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    marginBottom: 18,
  },
  errorText: { color: colors.error, fontSize: 13, lineHeight: 19 },
  dismiss: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', marginTop: 8 },
  walletLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 3,
    marginBottom: 17,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 5,
  },
  walletTitle: {
    color: colors.text,
    fontSize: 29,
    fontWeight: '700',
    ...typography.display,
  },
  testnetPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  testnetText: { color: colors.textSecondary, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  balanceCard: {
    height: 190,
    borderRadius: 20,
    backgroundColor: colors.background,
    padding: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceGlow: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(242,241,239,0.035)',
    right: -85,
    top: -115,
  },
  balanceTop: { flexDirection: 'row', justifyContent: 'space-between', flex: 1 },
  balanceLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.ui,
  },
  balanceLine: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 },
  balanceValue: { color: colors.text, fontSize: 39, fontWeight: '600', ...typography.display },
  balanceSymbol: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.ui,
  },
  heroToken: { width: 42, height: 42, borderRadius: 21 },
  addressRow: {
    alignSelf: 'flex-start',
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressText: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 15, marginBottom: 30 },
  actionButton: {
    flex: 1,
    height: 56,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  actionPrimary: { backgroundColor: colors.background, borderColor: colors.text },
  actionText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  actionTextPrimary: { color: colors.text },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 2,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', ...typography.title },
  seeAll: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  listCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 28,
  },
  assetRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  lastRow: { borderBottomWidth: 0 },
  assetIcon: { width: 42, height: 42, borderRadius: 21, marginRight: 12 },
  assetCopy: { flex: 1 },
  assetName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  assetNetwork: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  assetBalance: { alignItems: 'flex-end', marginRight: 9 },
  assetAmount: { color: colors.text, fontSize: 15, fontWeight: '700' },
  assetSymbol: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  activityRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sentIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sentAmount: { color: colors.text, fontSize: 12, fontWeight: '700', maxWidth: 120 },
  emptyActivity: { alignItems: 'center', paddingVertical: 27, paddingHorizontal: 20 },
  emptyCheck: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  emptyDetail: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
});
