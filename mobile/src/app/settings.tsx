import { WalletBottomSheet } from '@/components/wallet/WalletBottomSheet';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { usePassport } from '@/passport/PassportProvider';
import { useRouter } from 'expo-router';
import {
  Bluetooth,
  ChevronRight,
  CircleHelp,
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

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, reconnect, disconnect, unpair, forget } = usePassport();
  const [busy, setBusy] = useState(false);
  const [howItWorks, setHowItWorks] = useState(false);

  const toggleConnection = async () => {
    setBusy(true);
    try {
      if (status.connected) {
        await disconnect();
        toast.success('Passport Prime disconnected');
      } else {
        await reconnect();
        toast.success('Passport Prime connected');
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const confirmReplacePassport = () => {
    const canNotifyPassport = status.connected;
    Alert.alert(
      'Connect a different Passport Prime?',
      canNotifyPassport
        ? 'This removes the encrypted Bluetooth relationship from both devices and returns to pairing. Your wallet stays on Passport Prime.'
        : 'Passport Prime is offline, so this app can only forget it locally. Also disconnect the phone from the Tether Wallet app on Passport Prime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: canNotifyPassport ? 'Unpair' : 'Forget',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              if (canNotifyPassport) await unpair();
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
      <WalletHeader title="Menu" back />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 35 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Passport connection</Text>
        <View style={styles.passportCard}>
          <View
            style={[
              styles.passportIcon,
              status.connected ? styles.passportIconOnline : styles.passportIconOffline,
            ]}
          >
            <ShieldCheck
              size={28}
              color={status.connected ? colors.connected : colors.textSecondary}
              strokeWidth={1.7}
            />
          </View>
          <View style={styles.passportCopy}>
            <Text style={styles.passportTitle}>Passport Prime</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: status.connected ? colors.connected : colors.disconnected,
                  },
                ]}
              />
              <Text style={styles.passportStatus}>
                {status.connected ? 'Connected' : status.paired ? 'Paired · offline' : 'Not paired'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.menuCard}>
          <MenuRow icon={CircleHelp} label="How it works" onPress={() => setHowItWorks(true)} />
          <MenuRow
            icon={ExternalLink}
            label="Tether WDK documentation"
            onPress={() => Linking.openURL('https://docs.wdk.tether.io/')}
            last
          />
        </View>

        <TouchableOpacity
          style={styles.connectionButton}
          onPress={toggleConnection}
          disabled={busy || !status.paired}
        >
          {busy ? (
            <ActivityIndicator color={colors.background} />
          ) : status.connected ? (
            <Link2Off size={21} color={colors.background} />
          ) : (
            <RefreshCw size={21} color={colors.background} />
          )}
          <Text style={styles.connectionButtonText}>
            {status.connected ? 'Disconnect Passport Prime' : 'Reconnect Passport Prime'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.replaceButton}
          onPress={confirmReplacePassport}
          disabled={busy}
        >
          <Text style={styles.replaceText}>Connect a different Passport Prime</Text>
        </TouchableOpacity>

        <View style={styles.testnet}>
          <Text style={styles.testnetTitle}>TESTNET PROOF OF CONCEPT</Text>
          <Text style={styles.testnetCopy}>
            Ethereum Sepolia only. Never send mainnet assets or real USD₮ to this app.
          </Text>
        </View>
      </ScrollView>

      <WalletBottomSheet
        visible={howItWorks}
        title="How it works"
        onClose={() => setHowItWorks(false)}
      >
        <HowRow
          icon={KeyRound}
          title="Keys stay on Passport Prime"
          detail="The app receives a public address. The private key never reaches this phone."
        />
        <HowRow
          icon={Bluetooth}
          title="Encrypted Bluetooth"
          detail="QuantumLink securely carries wallet requests and signed responses."
        />
        <HowRow
          icon={Smartphone}
          title="You approve every transfer"
          detail="Passport Prime reconstructs the details and signs only after your approval."
          last
        />
      </WalletBottomSheet>
    </View>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onPress,
  last,
}: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  label: string;
  onPress(): void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.menuRow, last && styles.last]} onPress={onPress}>
      <Icon size={23} color={colors.text} strokeWidth={1.65} />
      <Text style={styles.menuLabel}>{label}</Text>
      <ChevronRight size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

function HowRow({
  icon: Icon,
  title,
  detail,
  last,
}: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.howRow, last && styles.last]}>
      <View style={styles.howIcon}>
        <Icon size={23} color={colors.text} strokeWidth={1.65} />
      </View>
      <View style={styles.howCopy}>
        <Text style={styles.howTitle}>{title}</Text>
        <Text style={styles.howDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 11 },
  sectionLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 10 },
  passportCard: {
    minHeight: 96,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.055)',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passportIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passportIconOnline: { backgroundColor: 'rgba(38,161,123,0.12)' },
  passportIconOffline: { backgroundColor: 'rgba(255,255,255,0.04)' },
  passportCopy: { flex: 1, marginLeft: 14 },
  passportTitle: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  passportStatus: { color: colors.textSecondary, fontSize: 12 },
  menuCard: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
    paddingHorizontal: 16,
    marginTop: 20,
  },
  menuRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuLabel: { flex: 1, color: colors.text, fontFamily: fonts.displayMedium, fontSize: 17 },
  last: { borderBottomWidth: 0 },
  connectionButton: {
    height: 59,
    borderRadius: 16,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 24,
  },
  connectionButtonText: {
    color: colors.background,
    fontFamily: fonts.displayMedium,
    fontSize: 16,
  },
  replaceButton: { height: 56, alignItems: 'center', justifyContent: 'center' },
  replaceText: { color: colors.danger, fontFamily: fonts.displayMedium, fontSize: 15 },
  testnet: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warningBorder,
    padding: 16,
    marginTop: 12,
  },
  testnetTitle: { color: colors.warning, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  testnetCopy: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 7 },
  howRow: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  howIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  howCopy: { flex: 1 },
  howTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  howDetail: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5 },
});
