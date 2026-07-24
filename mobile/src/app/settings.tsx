import { colors } from '@/constants/colors';
import { typography } from '@/constants/typography';
import { SEPOLIA_USDT_ADDRESS, usePassport } from '@/passport/PassportProvider';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Bluetooth,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2Off,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

function short(value: string): string {
  return `${value.slice(0, 9)}…${value.slice(-7)}`;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, address, reconnect, disconnect, unpair, forget } = usePassport();
  const [busy, setBusy] = useState(false);

  const copy = async (value: string, label: string) => {
    await Clipboard.setStringAsync(value);
    toast.success(`${label} copied`);
  };

  const toggleConnection = async () => {
    setBusy(true);
    try {
      if (status.connected) await disconnect();
      else await reconnect();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const confirmReplacePassport = () => {
    const canNotifyPrime = status.connected;
    Alert.alert(
      'Connect a different Passport?',
      canNotifyPrime
        ? 'This securely removes the QuantumLink relationship from both devices, then returns to pairing. Your wallet seed remains on Passport.'
        : 'This Passport is offline, so the app can only forget it on this phone. Also choose “Disconnect phone” on Passport before pairing it again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: canNotifyPrime ? 'Unpair & continue' : 'Forget & continue',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              if (canNotifyPrime) await unpair();
              else await forget();
              router.replace('/onboarding');
            } catch (cause) {
              toast.error(cause instanceof Error ? cause.message : String(cause));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={21} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Passport Prime</Text>
        <View style={styles.deviceCard}>
          <View style={styles.deviceTop}>
            <View style={styles.deviceIcon}>
              <ShieldCheck size={28} color={colors.primary} />
            </View>
            <View style={styles.deviceCopy}>
              <Text style={styles.deviceName}>{status.deviceName ?? 'Passport Prime'}</Text>
              <View style={styles.statusRow}>
                <View
                  style={[styles.dot, status.connected ? styles.dotOnline : styles.dotOffline]}
                />
                <Text style={styles.statusText}>
                  {status.connected ? 'QuantumLink connected' : 'Paired • currently offline'}
                </Text>
              </View>
            </View>
            <CheckCircle2 size={21} color={status.paired ? colors.success : colors.textTertiary} />
          </View>
          <View style={styles.divider} />
          <SettingRow
            icon={Bluetooth}
            label="BLE address"
            value={status.deviceAddress ?? 'Not available'}
          />
          <SettingRow
            icon={KeyRound}
            label="Wallet account"
            value={address ? short(address) : 'Reconnect to load'}
            onPress={address ? () => copy(address, 'Wallet address') : undefined}
          />
        </View>

        <TouchableOpacity
          style={styles.connectionButton}
          onPress={toggleConnection}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.text} />
          ) : status.connected ? (
            <Link2Off size={19} color={colors.text} />
          ) : (
            <RefreshCw size={19} color={colors.text} />
          )}
          <Text style={styles.connectionText}>
            {status.connected ? 'Disconnect for now' : 'Reconnect Passport'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Security model</Text>
        <View style={styles.infoCard}>
          <InfoRow
            icon={KeyRound}
            title="Passport Prime owns the key"
            detail="The per-app seed and derived EVM private key never leave Passport Prime."
          />
          <InfoRow
            icon={Bluetooth}
            title="Post-quantum transport"
            detail="Requests and responses are authenticated, encrypted, replay-checked, and framed over BLE."
          />
          <InfoRow
            icon={Smartphone}
            title="Public data on Android"
            detail="This phone stores only its encrypted QuantumLink identity, public pairing metadata, and transaction history."
            last
          />
        </View>

        <Text style={styles.sectionTitle}>Proof-of-concept scope</Text>
        <View style={styles.detailsCard}>
          <DetailRow label="Network" value="Ethereum Sepolia" />
          <DetailRow label="Derivation" value="m/44'/60'/0'/0/0" mono />
          <DetailRow label="WDK wallet" value="@tetherto/wdk-wallet-evm 1.0.0-beta.16" />
          <DetailRow
            label="Sepolia USD₮"
            value={short(SEPOLIA_USDT_ADDRESS)}
            mono
            onPress={() => copy(SEPOLIA_USDT_ADDRESS, 'USD₮ contract')}
          />
          <DetailRow label="Protocol" value="Passport WDK v1" last />
        </View>

        <TouchableOpacity
          style={styles.docsLink}
          onPress={() => Linking.openURL('https://docs.wdk.tether.io/')}
        >
          <Text style={styles.docsText}>Tether WDK documentation</Text>
          <ExternalLink size={16} color={colors.primary} />
        </TouchableOpacity>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Change Passport Prime</Text>
          <Text style={styles.dangerDetail}>
            Disconnect this relationship and return to the scanner to pair a different device. This
            never deletes a Passport seed.
          </Text>
          <TouchableOpacity
            style={styles.unpairButton}
            onPress={confirmReplacePassport}
            disabled={busy}
          >
            <Link2Off size={19} color={colors.danger} />
            <Text style={styles.unpairText}>Forget & connect another Passport</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingRow({
  icon: Icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.settingRow} onPress={onPress} disabled={!onPress}>
      <Icon size={18} color={colors.textSecondary} />
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
      {onPress ? <Copy size={15} color={colors.primary} /> : null}
    </TouchableOpacity>
  );
}

function InfoRow({
  icon: Icon,
  title,
  detail,
  last,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, last ? styles.last : null]}>
      <View style={styles.infoIcon}>
        <Icon size={19} color={colors.primary} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function DetailRow({
  label,
  value,
  mono,
  last,
  onPress,
}: {
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.detailRow, last ? styles.last : null]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono ? styles.mono : null]}>{value}</Text>
    </TouchableOpacity>
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
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700', ...typography.title },
  headerSpacer: { width: 40 },
  content: { padding: 20 },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 12,
  },
  deviceCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
  },
  deviceTop: { flexDirection: 'row', alignItems: 'center' },
  deviceIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceCopy: { flex: 1, marginHorizontal: 13 },
  deviceName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  dotOnline: { backgroundColor: colors.success },
  dotOffline: { backgroundColor: colors.warning },
  statusText: { color: colors.textSecondary, fontSize: 12 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 15 },
  settingRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  settingLabel: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  settingValue: { color: colors.text, fontSize: 12, fontFamily: 'monospace' },
  connectionButton: {
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 13,
    marginBottom: 24,
  },
  connectionText: { color: colors.text, fontSize: 14, fontWeight: '700', ...typography.label },
  infoCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  last: { borderBottomWidth: 0 },
  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoCopy: { flex: 1 },
  infoTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  infoDetail: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  detailsCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
  },
  detailRow: {
    minHeight: 57,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: { color: colors.textSecondary, fontSize: 12 },
  detailValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    maxWidth: '64%',
    textAlign: 'right',
  },
  mono: { fontFamily: 'monospace' },
  docsLink: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 9,
  },
  docsText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  dangerZone: {
    backgroundColor: colors.dangerBackground,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 20,
    padding: 17,
    marginTop: 24,
  },
  dangerTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  dangerDetail: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5 },
  unpairButton: {
    height: 49,
    borderRadius: 14,
    backgroundColor: 'rgba(255,59,48,0.11)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  unpairText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
});
