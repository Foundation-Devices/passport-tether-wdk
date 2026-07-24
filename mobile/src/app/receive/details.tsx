import { colors } from '@/constants/colors';
import { typography } from '@/constants/typography';
import { usePassport } from '@/passport/PassportProvider';
import { QRCode } from '@tetherto/wdk-uikit-react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ArrowLeft, Copy, RefreshCw, Share2, ShieldCheck } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

export default function ReceiveScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, walletLoading, address, reconnect } = usePassport();
  const [retrying, setRetrying] = useState(false);

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    toast.success('Sepolia address copied');
  };

  const share = async () => {
    if (!address) return;
    await Share.share({
      title: 'Tether WDK Passport address',
      message: `Ethereum Sepolia address: ${address}`,
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
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={21} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Receive</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>ETHEREUM SEPOLIA</Text>
        <Text style={styles.title}>Receive ETH or USD₮</Text>
        <Text style={styles.subtitle}>
          Both assets use the Passport-controlled address below. Only send Sepolia testnet assets.
        </Text>

        {address ? (
          <View style={styles.qrCard}>
            <QRCode value={address} size={220} color={colors.text} />
          </View>
        ) : (
          <View style={styles.qrCard}>
            {walletLoading || retrying ? (
              <>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.unavailable}>Requesting your address from Passport Prime…</Text>
              </>
            ) : (
              <>
                <Text style={styles.unavailable}>
                  {status.connected
                    ? 'Passport is connected, but the account address has not loaded.'
                    : 'Reconnect Passport Prime to load the account.'}
                </Text>
                <TouchableOpacity style={styles.retryButton} onPress={retry}>
                  <RefreshCw size={17} color={colors.black} />
                  <Text style={styles.retryText}>
                    {status.connected ? 'Retry account' : 'Reconnect'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View style={styles.verified}>
          <ShieldCheck size={17} color={colors.success} />
          <Text style={styles.verifiedText}>
            {address
              ? 'Address derived and verified through Passport Prime'
              : 'Address will be verified through Passport Prime'}
          </Text>
        </View>
        <TouchableOpacity style={styles.addressCard} onPress={copy} disabled={!address}>
          <Text style={styles.addressLabel}>YOUR SEPOLIA ADDRESS</Text>
          <Text style={styles.address} numberOfLines={2}>
            {address ??
              (walletLoading ? 'Requesting Passport account…' : 'Passport account not loaded')}
          </Text>
        </TouchableOpacity>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={copy} disabled={!address}>
            <Copy size={19} color={colors.black} />
            <Text style={styles.primaryText}>Copy address</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={share} disabled={!address}>
            <Share2 size={19} color={colors.text} />
            <Text style={styles.secondaryText}>Share</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.warning}>
          Testnet only. Mainnet funds sent to this demo address may be unrecoverable from the POC.
        </Text>
      </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 40 },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 26 },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 29,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
    ...typography.display,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
  },
  qrCard: {
    alignSelf: 'center',
    width: 270,
    height: 270,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 25,
    marginBottom: 16,
  },
  unavailable: { color: colors.textTertiary, textAlign: 'center', padding: 30 },
  retryButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryText: { color: colors.black, fontSize: 14, fontWeight: '700' },
  verified: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  verifiedText: { color: colors.textSecondary, fontSize: 11 },
  addressCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 17,
    padding: 16,
    marginTop: 22,
  },
  addressLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  address: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  actions: { flexDirection: 'row', gap: 11, marginTop: 16 },
  primaryButton: {
    flex: 1.25,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: { color: colors.black, fontSize: 14, fontWeight: '800' },
  secondaryButton: {
    flex: 0.75,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  warning: {
    color: colors.warning,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 18,
  },
});
