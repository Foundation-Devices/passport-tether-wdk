import { colors } from '@/constants/colors';
import { typography } from '@/constants/typography';
import { SEPOLIA_EXPLORER, usePassport } from '@/passport/PassportProvider';
import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowUpRight, ExternalLink } from 'lucide-react-native';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function short(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activity } = usePassport();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={21} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activity</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 35 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>ETHEREUM SEPOLIA</Text>
        <Text style={styles.title}>Passport transfers</Text>
        <Text style={styles.subtitle}>
          Transactions signed on Passport Prime and broadcast through Tether WDK.
        </Text>
        {activity.length ? (
          <View style={styles.card}>
            {activity.map((item, index) => (
              <TouchableOpacity
                key={item.hash}
                style={[styles.row, index === activity.length - 1 ? styles.last : null]}
                onPress={() => Linking.openURL(`${SEPOLIA_EXPLORER}/tx/${item.hash}`)}
              >
                <View style={styles.icon}>
                  <ArrowUpRight size={19} color={colors.primary} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.rowTitle}>
                    Sent {item.amount} {item.asset}
                  </Text>
                  <Text style={styles.rowDetail}>
                    {new Date(item.timestamp).toLocaleString()} • {short(item.recipient)}
                  </Text>
                  <Text style={styles.hash}>{short(item.hash)}</Text>
                </View>
                <ExternalLink size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <ArrowUpRight size={30} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No transfers yet</Text>
            <Text style={styles.emptyDetail}>
              Your locally recorded POC activity will appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 40 },
  content: { padding: 21 },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 12,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '700',
    marginTop: 8,
    ...typography.display,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    overflow: 'hidden',
  },
  row: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  last: { borderBottomWidth: 0 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  copy: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  rowDetail: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  hash: { color: colors.textTertiary, fontFamily: 'monospace', fontSize: 10, marginTop: 4 },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 42,
    paddingHorizontal: 25,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 13 },
  emptyDetail: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 5 },
});
