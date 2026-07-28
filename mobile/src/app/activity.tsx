import { AssetGlyph } from '@/components/wallet/AssetGlyph';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { SEPOLIA_EXPLORER, usePassport } from '@/passport/PassportProvider';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Repeat2 } from 'lucide-react-native';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function short(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { activity } = usePassport();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <WalletHeader title="Transactions" back />
      <View style={styles.filters}>
        {['Date', 'Currency', 'Type'].map((filter) => (
          <TouchableOpacity key={filter} style={styles.filter}>
            <Text style={styles.filterText}>{filter}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
      >
        {activity.length ? (
          <View style={styles.list}>
            {activity.map((item) => (
              <TouchableOpacity
                key={item.hash}
                style={styles.row}
                onPress={() =>
                  Linking.openURL(
                    item.asset === 'BTC'
                      ? `https://mempool.space/testnet/tx/${item.hash}`
                      : `${SEPOLIA_EXPLORER}/tx/${item.hash}`
                  )
                }
              >
                <View style={styles.iconWrap}>
                  <AssetGlyph
                    assetId={item.asset === 'BTC' ? 'btc' : item.asset === 'ETH' ? 'eth' : 'usdt'}
                    size={43}
                  />
                  <View style={styles.direction}>
                    {item.direction === 'in' ? (
                      <ArrowDownLeft size={12} color={colors.background} strokeWidth={2.5} />
                    ) : (
                      <ArrowUpRight size={12} color={colors.background} strokeWidth={2.5} />
                    )}
                  </View>
                </View>
                <View style={styles.copy}>
                  <Text style={styles.rowTitle}>
                    {item.direction === 'in' ? 'Received' : 'Sent'} {item.asset}
                  </Text>
                  <Text style={styles.rowDetail}>
                    {new Date(item.timestamp).toLocaleDateString()} ·{' '}
                    {item.recipient ? short(item.recipient) : '—'}
                  </Text>
                  <Text style={styles.hash}>{short(item.hash)}</Text>
                </View>
                <View style={styles.amountWrap}>
                  <Text style={styles.amount}>
                    {item.direction === 'in' ? '+' : '−'}
                    {item.amount} {item.asset}
                  </Text>
                  <ExternalLink size={15} color={colors.textTertiary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Repeat2 size={48} color={colors.text} strokeWidth={1.45} />
            <Text style={styles.emptyTitle}>Nothing here yet…</Text>
            <Text style={styles.emptyDetail}>
              Once you send or receive, your transactions will show up here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  filters: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  filter: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.055)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterText: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 15 },
  content: { flexGrow: 1, paddingHorizontal: 20 },
  empty: {
    flex: 1,
    minHeight: 520,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingBottom: 50,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 21,
    marginTop: 25,
  },
  emptyDetail: {
    color: colors.text,
    fontFamily: fonts.displayBook,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 9,
    maxWidth: 320,
  },
  list: { marginTop: 22, gap: 9 },
  row: {
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: { width: 49, height: 49 },
  direction: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, marginLeft: 12 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowDetail: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  hash: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: 9, marginTop: 3 },
  amountWrap: { alignItems: 'flex-end', gap: 7 },
  amount: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
