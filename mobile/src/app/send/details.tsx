import { colors } from '@/constants/colors';
import {
  displayBalance,
  SEPOLIA_EXPLORER,
  usePassport,
  type PassportActivity,
  type PassportAsset,
  type TransferQuote,
} from '@/passport/PassportProvider';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatEther } from 'ethers';
import {
  ArrowLeft,
  Check,
  ClipboardPaste,
  ExternalLink,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TransferStage = 'form' | 'quoting' | 'review' | 'signing' | 'success' | 'error';

function short(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export default function SendScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ asset?: string; scannedAddress?: string }>();
  const {
    status,
    address,
    btcAddress,
    balances,
    quoteTransfer,
    sendTransfer,
    cancelSigning,
    reconnect,
  } = usePassport();
  const [asset, setAsset] = useState<PassportAsset>(
    params.asset === 'BTC' ? 'BTC' : params.asset === 'ETH' ? 'ETH' : 'USD₮'
  );
  const [recipient, setRecipient] = useState(params.scannedAddress ?? '');
  const [amount, setAmount] = useState('');
  const [stage, setStage] = useState<TransferStage>('form');
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [result, setResult] = useState<PassportActivity | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const operationRef = useRef(0);

  useEffect(() => {
    if (params.scannedAddress) setRecipient(params.scannedAddress);
  }, [params.scannedAddress]);

  const balance = useMemo(() => displayBalance(asset, balances), [asset, balances]);

  const prepare = async () => {
    setProblem(null);
    if (!status.connected) {
      setStage('quoting');
      try {
        await reconnect();
      } catch (cause) {
        setStage('form');
        setProblem(cause instanceof Error ? cause.message : 'Passport Prime is offline');
        return;
      }
    }
    setStage('quoting');
    try {
      const next = await quoteTransfer(asset, amount.trim(), recipient.trim());
      setQuote(next);
      setStage('review');
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
      setStage('form');
    }
  };

  const submit = async () => {
    if (!quote) return;
    const operation = ++operationRef.current;
    setProblem(null);
    setStage('signing');
    try {
      const next = await sendTransfer(quote);
      if (operation !== operationRef.current) return;
      setResult(next);
      setStage('success');
    } catch (cause) {
      if (operation !== operationRef.current) return;
      setProblem(cause instanceof Error ? cause.message : String(cause));
      setStage('error');
    }
  };

  const cancel = async () => {
    operationRef.current += 1;
    if (stage === 'signing') {
      await cancelSigning().catch(() => undefined);
    }
    setQuote(null);
    setStage('form');
  };

  const paste = async () => setRecipient(await Clipboard.getStringAsync());

  const scan = () => {
    router.push({
      pathname: '/scan-qr',
      params: { returnRoute: '/send/details', asset, amount },
    });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <ArrowLeft size={21} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send</Text>
        <View style={styles.networkPill}>
          <Text style={styles.networkText}>{asset === 'BTC' ? 'BITCOIN TESTNET' : 'SEPOLIA'}</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>ASSET</Text>
        <View style={styles.segment}>
          {(['USD₮', 'ETH', 'BTC'] as PassportAsset[]).map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.segmentButton, asset === item ? styles.segmentActive : null]}
              onPress={() => setAsset(item)}
            >
              <Text style={[styles.segmentText, asset === item ? styles.segmentTextActive : null]}>
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>AVAILABLE</Text>
          <Text style={styles.balanceValue}>
            {balance} {asset}
          </Text>
        </View>

        <Text style={styles.eyebrow}>RECIPIENT</Text>
        <View style={styles.inputCard}>
          <TextInput
            value={recipient}
            onChangeText={setRecipient}
            placeholder={asset === 'BTC' ? 'tb1…' : '0x…'}
            placeholderTextColor={colors.textDisabled}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.addressInput}
          />
          <TouchableOpacity style={styles.smallAction} onPress={paste}>
            <ClipboardPaste size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.smallAction} onPress={scan}>
            <QrCode size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.eyebrow}>AMOUNT</Text>
        <View style={styles.amountCard}>
          <TextInput
            value={amount}
            onChangeText={(value) => setAmount(value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            placeholderTextColor={colors.textDisabled}
            keyboardType="decimal-pad"
            style={styles.amountInput}
          />
          <Text style={styles.amountAsset}>{asset}</Text>
          <TouchableOpacity
            style={styles.maxButton}
            onPress={() => {
              if (asset === 'BTC') {
                setAmount(balance.replaceAll(',', ''));
              } else if (asset === 'ETH') {
                const feeReserve = 5_000_000_000_000_000n;
                setAmount(formatEther(balances.eth > feeReserve ? balances.eth - feeReserve : 0n));
              } else {
                setAmount(balance.replaceAll(',', ''));
              }
            }}
          >
            <Text style={styles.maxText}>MAX</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.securityCard}>
          <ShieldCheck size={23} color={colors.primary} />
          <View style={styles.securityCopy}>
            <Text style={styles.securityTitle}>Verified on Passport Prime</Text>
            <Text style={styles.securityDetail}>
              The final amount, address, and maximum network fee appear on Passport before signing.
            </Text>
          </View>
        </View>
        {asset === 'BTC' && btcAddress ? (
          <Text style={styles.fromText}>FROM {short(btcAddress).toUpperCase()}</Text>
        ) : address ? (
          <Text style={styles.fromText}>FROM {short(address).toUpperCase()}</Text>
        ) : null}
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
        <TouchableOpacity
          style={[
            styles.continueButton,
            (!recipient || !amount || stage === 'quoting') && styles.buttonDisabled,
          ]}
          onPress={prepare}
          disabled={!recipient || !amount || stage === 'quoting'}
        >
          {stage === 'quoting' ? (
            <ActivityIndicator color={colors.black} />
          ) : (
            <Text style={styles.continueText}>Review transfer</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={
          stage === 'review' || stage === 'signing' || stage === 'success' || stage === 'error'
        }
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={cancel}
      >
        <View style={[styles.modal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {stage === 'success' && result ? (
            <ResultView result={result} onDone={() => router.replace('/wallet')} />
          ) : stage === 'error' ? (
            <View style={styles.modalContent}>
              <View style={styles.errorIcon}>
                <X size={38} color={colors.white} />
              </View>
              <Text style={styles.modalTitle}>Transfer not sent</Text>
              <Text style={styles.modalSubtitle}>{problem}</Text>
              <TouchableOpacity style={styles.modalPrimary} onPress={cancel}>
                <Text style={styles.modalPrimaryText}>Back to transfer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalEyebrow}>
                {stage === 'signing' ? 'PASSPORT PRIME' : 'FINAL REVIEW'}
              </Text>
              <Text style={styles.modalTitle}>
                {stage === 'signing'
                  ? 'Approve on Passport'
                  : `Send ${quote?.amount} ${quote?.asset}`}
              </Text>
              <Text style={styles.modalSubtitle}>
                {stage === 'signing'
                  ? 'Compare the details below with Passport Prime, then slide to approve on the device.'
                  : `WDK prepared this ${quote?.asset === 'BTC' ? 'Bitcoin testnet' : 'Sepolia'} transfer. Passport will independently reconstruct and review it.`}
              </Text>
              <View style={styles.reviewCard}>
                <ReviewRow label="Asset" value={quote?.asset ?? ''} />
                <ReviewRow label="Amount" value={`${quote?.amount ?? ''} ${quote?.asset ?? ''}`} />
                <ReviewRow label="To" value={quote ? short(quote.recipient) : ''} mono />
                <ReviewRow
                  label="Maximum fee"
                  value={
                    quote
                      ? quote.asset === 'BTC'
                        ? `${quote.feeWei.toString()} sats`
                        : `${Number(formatEther(quote.feeWei)).toFixed(6)} ETH`
                      : ''
                  }
                  last
                />
              </View>
              {stage === 'signing' ? (
                <View style={styles.signingState}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.signingLabel}>Waiting for hardware approval…</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.modalPrimary} onPress={submit}>
                  <ShieldCheck size={20} color={colors.black} />
                  <Text style={styles.modalPrimaryText}>Continue on Passport</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cancelButton} onPress={cancel}>
                <Text style={styles.cancelText}>
                  {stage === 'signing' ? 'Cancel request' : 'Back'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function ReviewRow({
  label,
  value,
  mono,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.reviewRow, last ? styles.reviewRowLast : null]}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, mono ? styles.mono : null]}>{value}</Text>
    </View>
  );
}

function ResultView({ result, onDone }: { result: PassportActivity; onDone(): void }) {
  return (
    <View style={styles.modalContent}>
      <View style={styles.successIcon}>
        <Check size={43} color={colors.black} />
      </View>
      <Text style={styles.modalEyebrow}>
        {result.asset === 'BTC' ? 'BROADCAST TO BITCOIN TESTNET' : 'BROADCAST TO SEPOLIA'}
      </Text>
      <Text style={styles.modalTitle}>Transfer submitted</Text>
      <Text style={styles.modalSubtitle}>
        Passport Prime approved the transaction and Tether WDK broadcast the signed payload.
      </Text>
      <View style={styles.hashCard}>
        <Text style={styles.reviewLabel}>TRANSACTION HASH</Text>
        <Text style={styles.hashText}>{result.hash}</Text>
      </View>
      <TouchableOpacity
        style={styles.explorerButton}
        onPress={() =>
          Linking.openURL(
            result.asset === 'BTC'
              ? `https://mempool.space/testnet/tx/${result.hash}`
              : `${SEPOLIA_EXPLORER}/tx/${result.hash}`
          )
        }
      >
        <ExternalLink size={18} color={colors.primary} />
        <Text style={styles.explorerText}>
          {result.asset === 'BTC' ? 'View on mempool.space' : 'View on Etherscan'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.modalPrimary} onPress={onDone}>
        <Text style={styles.modalPrimaryText}>Done</Text>
      </TouchableOpacity>
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
  networkPill: {
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  networkText: { color: colors.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  content: { padding: 21 },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 15,
  },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentButton: {
    flex: 1,
    height: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' },
  segmentTextActive: { color: colors.black },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 10,
  },
  balanceLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  balanceValue: { color: colors.text, fontSize: 12, fontWeight: '700' },
  inputCard: {
    height: 61,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  addressInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontFamily: 'monospace',
    paddingRight: 8,
  },
  smallAction: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 7,
  },
  amountCard: {
    minHeight: 92,
    borderRadius: 19,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
  },
  amountInput: { flex: 1, color: colors.text, fontSize: 34, fontWeight: '700' },
  amountAsset: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
    marginHorizontal: 10,
  },
  maxButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.cardDark,
  },
  maxText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  securityCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 22,
  },
  securityCopy: { flex: 1, marginLeft: 12 },
  securityTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  securityDetail: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  fromText: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 16,
  },
  problem: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 15,
  },
  continueButton: {
    height: 58,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  buttonDisabled: { opacity: 0.45 },
  continueText: { color: colors.black, fontSize: 16, fontWeight: '800' },
  modal: { flex: 1, backgroundColor: colors.background },
  modalContent: { flex: 1, paddingHorizontal: 22, justifyContent: 'center' },
  modalHandle: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  modalEyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textAlign: 'center',
    marginBottom: 10,
  },
  modalTitle: { color: colors.text, fontSize: 31, fontWeight: '700', textAlign: 'center' },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 11,
  },
  reviewCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    marginTop: 28,
    marginBottom: 24,
  },
  reviewRow: {
    minHeight: 59,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reviewRowLast: { borderBottomWidth: 0 },
  reviewLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  reviewValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  mono: { fontFamily: 'monospace', fontSize: 13 },
  modalPrimary: {
    height: 58,
    borderRadius: 17,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  modalPrimaryText: { color: colors.black, fontSize: 15, fontWeight: '800' },
  cancelButton: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  signingState: { alignItems: 'center', paddingVertical: 18 },
  signingLabel: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 14 },
  errorIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 26,
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 26,
  },
  hashCard: {
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    marginTop: 26,
  },
  hashText: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  explorerButton: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 13,
  },
  explorerText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
});
