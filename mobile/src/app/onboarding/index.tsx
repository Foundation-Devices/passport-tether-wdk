import { colors } from '@/constants/colors';
import { fonts, typography } from '@/constants/typography';
import { usePassport } from '@/passport/PassportProvider';
import {
  parsePassportPairingQr,
  PassportXidDecoder,
  recoverPairingConnection,
} from '@/passport/pairing';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Bluetooth, Camera, Check, LockKeyhole, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PairingPhase = 'welcome' | 'static' | 'connecting' | 'xid' | 'pairing' | 'complete';

async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Number(Platform.Version) >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  }
  return (
    (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)) ===
    PermissionsAndroid.RESULTS.GRANTED
  );
}

export default function PassportOnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, connect, pair, clearError } = usePassport();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<PairingPhase>('welcome');
  const phaseRef = useRef<PairingPhase>('welcome');
  const decoder = useRef(new PassportXidDecoder());
  const processing = useRef(false);
  const reconnecting = useRef(false);
  const primeAddress = useRef<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState('Passport Prime');
  const [openingCamera, setOpeningCamera] = useState(false);
  const openingCameraRef = useRef(false);

  const transition = useCallback((next: PairingPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    if (status.paired) router.replace('/wallet');
  }, [router, status.paired]);

  useEffect(() => {
    if (
      phaseRef.current !== 'xid' ||
      status.state !== 'disconnected' ||
      reconnecting.current ||
      !primeAddress.current
    ) {
      return;
    }

    reconnecting.current = true;
    processing.current = true;
    setProblem('Bluetooth connection interrupted. Reconnecting to Passport Prime…');
    const address = primeAddress.current;

    recoverPairingConnection(connect, address)
      .then(() => {
        if (phaseRef.current === 'xid') setProblem(null);
      })
      .catch((cause) => {
        if (phaseRef.current !== 'xid') return;
        decoder.current.reset();
        setProgress(0);
        setProblem(
          `Passport Prime disconnected. Scan its first QR code again. ${
            cause instanceof Error ? cause.message : String(cause)
          }`
        );
        transition('static');
      })
      .finally(() => {
        reconnecting.current = false;
        processing.current = false;
      });
  }, [connect, status.state, transition]);

  const begin = useCallback(async () => {
    if (openingCameraRef.current) return;
    openingCameraRef.current = true;
    setOpeningCamera(true);
    setProblem(null);
    clearError();
    try {
      // Android cannot reliably present camera and nearby-device permission
      // dialogs at the same time. Request them in sequence, then mount the
      // camera only after both dialogs have settled.
      const camera = cameraPermission?.granted ? true : (await requestCameraPermission()).granted;
      if (!camera) {
        setProblem('Camera permission is required to scan Passport Prime.');
        return;
      }
      const bluetooth = await requestBluetoothPermissions();
      if (!bluetooth) {
        setProblem('Nearby-device permission is required to connect Passport Prime.');
        return;
      }
      decoder.current.reset();
      primeAddress.current = null;
      setProgress(0);
      await new Promise<void>((resolve) => setTimeout(resolve, 120));
      transition('static');
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    } finally {
      openingCameraRef.current = false;
      setOpeningCamera(false);
    }
  }, [cameraPermission?.granted, clearError, requestCameraPermission, transition]);

  const retry = useCallback(() => {
    processing.current = false;
    decoder.current.reset();
    setProblem(null);
    setProgress(0);
    if (phaseRef.current === 'xid') return;
    primeAddress.current = null;
    transition('static');
  }, [transition]);

  const onScan = useCallback(
    async ({ data }: { data: string }) => {
      if (processing.current) return;
      const current = phaseRef.current;
      if (current === 'static') {
        const mac = parsePassportPairingQr(data);
        if (!mac) return;
        primeAddress.current = mac;
        processing.current = true;
        transition('connecting');
        try {
          await connect(mac);
          transition('xid');
        } catch (cause) {
          setProblem(cause instanceof Error ? cause.message : String(cause));
          transition('static');
        } finally {
          processing.current = false;
        }
        return;
      }
      if (current !== 'xid' || !data.toLowerCase().startsWith('ur:')) return;
      try {
        const result = decoder.current.receive(data);
        if (!result.complete) {
          setProgress(result.progress);
          return;
        }
        processing.current = true;
        setProgress(1);
        transition('pairing');
        const name = await pair(result.xidBase64);
        setDeviceName(name);
        transition('complete');
        setTimeout(() => router.replace('/wallet'), 650);
      } catch (cause) {
        console.warn('Passport secure identity scan failed', cause);
        setProblem(
          phaseRef.current === 'pairing'
            ? 'Secure pairing did not complete. Keep both devices nearby and scan the identity code again.'
            : 'Could not read the secure identity. Keep the animated code inside the frame and try again.'
        );
        decoder.current.reset();
        setProgress(0);
        transition('xid');
      } finally {
        processing.current = false;
      }
    },
    [connect, pair, router, transition]
  );

  const scannerVisible = phase === 'static' || phase === 'connecting' || phase === 'xid';
  const title =
    phase === 'static'
      ? 'Scan Passport Prime'
      : phase === 'connecting'
        ? 'Opening QuantumLink'
        : 'Scan secure identity';
  const instruction =
    phase === 'static'
      ? 'Scan the first QR code shown by the Tether WDK app on Passport.'
      : phase === 'connecting'
        ? 'Keep both devices nearby while Bluetooth connects.'
        : 'Passport now shows an animated identity code. Hold steady while all frames are read.';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.brandRow}>
        <Image
          source={require('../../../assets/images/tether-wallet-wordmark.png')}
          style={styles.brand}
        />
        <View style={styles.pocPill}>
          <Text style={styles.pocText}>PASSPORT PRIME</Text>
        </View>
      </View>

      {phase === 'welcome' ? (
        <View style={styles.welcome}>
          <View style={styles.heroIcon}>
            <Image
              source={require('../../../assets/images/tether-wallet-app-icon.png')}
              style={styles.heroMark}
            />
          </View>
          <Text style={styles.eyebrow}>WDK HARDWARE WALLET</Text>
          <Text style={styles.heading}>Your keys stay on Passport Prime.</Text>
          <Text style={styles.body}>
            Pair over encrypted Bluetooth with QuantumLink, then use Tether WDK to view and transfer
            Sepolia ETH and USD₮. Every transaction is reviewed and approved on Passport.
          </Text>
          <View style={styles.featureCard}>
            <Feature
              icon={LockKeyhole}
              title="No phone seed"
              detail="Private keys never enter Android"
            />
            <Feature
              icon={Bluetooth}
              title="QuantumLink"
              detail="Authenticated encrypted BLE channel"
            />
            <Feature
              icon={Check}
              title="Verify on device"
              detail="Amount, recipient and fee on Passport"
            />
          </View>
          {problem ? <Text style={styles.error}>{problem}</Text> : null}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={begin}
            activeOpacity={0.85}
            disabled={openingCamera}
          >
            {openingCamera ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Camera size={20} color={colors.text} />
            )}
            <Text style={styles.primaryButtonText}>
              {openingCamera ? 'Opening camera…' : 'Pair Passport Prime'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.testnet}>POC • ETHEREUM SEPOLIA TESTNET</Text>
        </View>
      ) : scannerVisible ? (
        <View style={styles.scannerPage}>
          <View style={styles.scannerHeader}>
            <View>
              <Text style={styles.eyebrow}>STEP {phase === 'xid' ? '2 OF 2' : '1 OF 2'}</Text>
              <Text style={styles.scannerTitle}>{title}</Text>
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={() => transition('welcome')}>
              <X size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.scannerInstruction}>{instruction}</Text>
          <View style={styles.cameraShell}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onScan}
            />
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            {phase === 'connecting' ? (
              <View style={styles.cameraLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.cameraLoadingText}>Connecting…</Text>
              </View>
            ) : null}
          </View>
          {phase === 'xid' ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          ) : null}
          <Text style={styles.scanStatus}>
            {phase === 'xid'
              ? `${Math.round(progress * 100)}% identity frames captured`
              : 'Waiting for the Passport pairing code'}
          </Text>
          {problem ? (
            <View style={styles.problemCard}>
              <Text style={styles.error}>{problem}</Text>
              <TouchableOpacity onPress={retry}>
                <Text style={styles.retry}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.completing}>
          {phase === 'complete' ? (
            <View style={styles.successIcon}>
              <Check size={48} color={colors.black} />
            </View>
          ) : (
            <ActivityIndicator size="large" color={colors.primary} />
          )}
          <Text style={styles.heading}>
            {phase === 'complete' ? 'Passport connected' : 'Completing secure pairing'}
          </Text>
          <Text style={styles.body}>
            {phase === 'complete'
              ? `${deviceName} is ready to authorize Tether WDK transactions.`
              : 'Exchanging encrypted QuantumLink identities with Passport Prime.'}
          </Text>
        </View>
      )}
    </View>
  );
}

function Feature({
  icon: Icon,
  title,
  detail,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Icon size={19} color={colors.primary} />
      </View>
      <View style={styles.featureCopy}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDetail}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 22 },
  brandRow: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { width: 164, height: 28, resizeMode: 'contain' },
  pocPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  pocText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  welcome: { flex: 1, justifyContent: 'center', paddingBottom: 14 },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  heroMark: { width: 68, height: 68, borderRadius: 18 },
  eyebrow: {
    ...typography.label,
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  heading: {
    color: colors.text,
    fontSize: 35,
    lineHeight: 41,
    fontWeight: '700',
    marginBottom: 15,
    ...typography.display,
  },
  body: { color: colors.textSecondary, fontSize: 16, lineHeight: 24, fontFamily: fonts.ui },
  featureCard: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 17,
    marginTop: 28,
    marginBottom: 22,
  },
  feature: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  featureCopy: { flex: 1 },
  featureTitle: { color: colors.text, fontSize: 15, fontWeight: '700', fontFamily: fonts.ui },
  featureDetail: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    fontFamily: fonts.ui,
  },
  primaryButton: {
    height: 58,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.ui,
    letterSpacing: 0.4,
  },
  testnet: {
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginTop: 17,
  },
  error: { color: colors.error, fontSize: 14, lineHeight: 20 },
  scannerPage: { flex: 1, paddingTop: 24 },
  scannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  scannerTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    ...typography.display,
  },
  scannerInstruction: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    marginBottom: 22,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraShell: {
    flex: 1,
    maxHeight: 480,
    minHeight: 320,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: { width: 248, height: 248 },
  corner: { position: 'absolute', width: 34, height: 34, borderColor: colors.text },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 8 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 8 },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraLoadingText: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 14 },
  progressTrack: {
    height: 6,
    backgroundColor: colors.cardDark,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 18,
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 6 },
  scanStatus: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 12 },
  problemCard: {
    backgroundColor: colors.dangerBackground,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  retry: { color: colors.primary, fontSize: 14, fontWeight: '700', marginTop: 9 },
  completing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  successIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
});
