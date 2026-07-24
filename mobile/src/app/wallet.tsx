import { WalletHeader } from '@/components/wallet/WalletHeader';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { displayBalance, usePassport } from '@/passport/PassportProvider';
import { useRouter } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  EyeOff,
  RefreshCw,
  Repeat2,
  ShieldCheck,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, balances, error, walletLoading, reconnect, refresh, clearError } = usePassport();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const usdtBalance = useMemo(() => displayBalance('USD₮', balances), [balances]);

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
      toast.error(cause instanceof Error ? cause.message : 'Could not reconnect Passport Prime');
    } finally {
      setReconnecting(false);
    }
  }, [clearError, reconnect]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <WalletHeader showPassport menu />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 132, minHeight: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
        }
      >
        {!status.connected ? (
          <TouchableOpacity style={styles.connectionBanner} onPress={onReconnect}>
            <View style={styles.offlineDot} />
            <View style={styles.connectionCopy}>
              <Text style={styles.connectionTitle}>Passport Prime is offline</Text>
              <Text style={styles.connectionDetail}>Tap to reconnect</Text>
            </View>
            {reconnecting ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <RefreshCw size={18} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.connectedLine}>
            <ShieldCheck size={15} color={colors.connected} />
            <Text style={styles.connectedText}>Secured by Passport Prime</Text>
          </View>
        )}

        {error ? (
          <TouchableOpacity style={styles.errorBanner} onPress={clearError}>
            <Text style={styles.errorText} numberOfLines={2}>
              {error}
            </Text>
            <Text style={styles.dismiss}>Dismiss</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.balanceStage}>
          <TouchableOpacity
            style={styles.balanceLabelRow}
            onPress={() => setBalanceVisible((current) => !current)}
            accessibilityLabel={balanceVisible ? 'Hide wallet balance' : 'Show wallet balance'}
          >
            <Text style={styles.balanceLabel}>Total Wallet Balance</Text>
            {balanceVisible ? (
              <Eye size={21} color={colors.text} strokeWidth={1.7} />
            ) : (
              <EyeOff size={21} color={colors.text} strokeWidth={1.7} />
            )}
          </TouchableOpacity>
          <View style={styles.balanceValueRow}>
            {walletLoading ? <ActivityIndicator color={colors.text} style={styles.loader} /> : null}
            <Text
              style={styles.balanceValue}
              adjustsFontSizeToFit
              numberOfLines={1}
              minimumFontScale={0.64}
            >
              {balanceVisible ? `$${usdtBalance}` : '$••••'}
            </Text>
          </View>
          <Text style={styles.balanceCaption}>USD₮ on Ethereum Sepolia</Text>

          <TouchableOpacity
            style={styles.transactionsLink}
            onPress={() => router.push('/activity')}
          >
            <Repeat2 size={21} color={colors.text} strokeWidth={1.8} />
            <Text style={styles.transactionsText}>Transactions</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={[styles.actionDockWrap, { bottom: insets.bottom + 18 }]}>
        <View style={styles.actionDock}>
          <TouchableOpacity
            style={styles.action}
            onPress={() => router.push('/receive/details')}
            accessibilityLabel="Receive funds"
          >
            <ArrowDownLeft size={29} color={colors.text} strokeWidth={1.55} />
            <Text style={styles.actionText}>Receive</Text>
          </TouchableOpacity>
          <View style={styles.actionDivider} />
          <TouchableOpacity
            style={styles.action}
            onPress={() => router.push('/send')}
            accessibilityLabel="Send funds"
          >
            <ArrowUpRight size={29} color={colors.text} strokeWidth={1.55} />
            <Text style={styles.actionText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 21 },
  connectionBanner: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.055)',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.disconnected,
    marginRight: 11,
  },
  connectionCopy: { flex: 1 },
  connectionTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  connectionDetail: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  connectedLine: {
    alignSelf: 'center',
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 2,
  },
  connectedText: { color: colors.textSecondary, fontSize: 11, fontWeight: '500' },
  errorBanner: {
    marginTop: 8,
    borderRadius: 14,
    padding: 12,
    backgroundColor: colors.dangerBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.dangerBorder,
  },
  errorText: { color: colors.error, fontSize: 12, lineHeight: 17 },
  dismiss: { color: colors.textSecondary, fontSize: 10, marginTop: 5 },
  balanceStage: {
    flex: 1,
    minHeight: 460,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 35,
  },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceLabel: {
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 18,
  },
  balanceValueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  loader: { marginRight: 8 },
  balanceValue: {
    color: colors.text,
    fontFamily: fonts.displayBook,
    fontSize: 68,
    letterSpacing: -2.2,
    maxWidth: 330,
  },
  balanceCaption: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 5,
  },
  transactionsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 18,
    marginTop: 27,
  },
  transactionsText: {
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 17,
  },
  actionDockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  actionDock: {
    width: 248,
    height: 84,
    borderRadius: 34,
    backgroundColor: '#17181B',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  action: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 5 },
  actionDivider: { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: colors.border },
  actionText: {
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 16,
  },
});
