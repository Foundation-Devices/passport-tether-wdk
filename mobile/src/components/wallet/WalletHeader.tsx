import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { usePassport } from '@/passport/PassportProvider';
import { useRouter } from 'expo-router';
import { ArrowLeft, Menu } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function WalletHeader({
  title,
  back,
  showPassport = false,
  menu = false,
}: {
  title?: string;
  back?: boolean;
  showPassport?: boolean;
  menu?: boolean;
}) {
  const router = useRouter();
  const { status } = usePassport();

  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {back ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={25} color={colors.text} strokeWidth={1.8} />
          </TouchableOpacity>
        ) : null}
        {showPassport ? (
          <TouchableOpacity
            style={styles.passportPill}
            onPress={() => router.push('/settings')}
            accessibilityLabel={`Passport Prime ${status.connected ? 'connected' : 'disconnected'}`}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: status.connected ? colors.connected : colors.disconnected },
              ]}
            />
            <Text style={styles.passportText}>Passport</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View pointerEvents="none" style={styles.center}>
        {title ? (
          <Text style={styles.title}>{title}</Text>
        ) : (
          <Text style={styles.wordmark}>tether.</Text>
        )}
      </View>
      <View style={[styles.side, styles.sideRight]}>
        {menu ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Open wallet menu"
          >
            <Menu size={25} color={colors.text} strokeWidth={1.8} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 72,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  side: { minWidth: 42, minHeight: 42, flexDirection: 'row', alignItems: 'center' },
  sideRight: { justifyContent: 'flex-end', gap: 8 },
  center: {
    position: 'absolute',
    left: 84,
    right: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 29,
    letterSpacing: -1.2,
  },
  title: { color: colors.text, fontSize: 19, fontWeight: '600' },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passportPill: {
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  passportText: { color: colors.text, fontSize: 11, fontWeight: '600' },
});
