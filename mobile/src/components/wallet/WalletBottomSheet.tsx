import { colors } from '@/constants/colors';
import { fonts } from '@/constants/typography';
import { X } from 'lucide-react-native';
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function WalletBottomSheet({
  visible,
  title,
  onClose,
  children,
}: React.PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose(): void;
}>) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerSide} />
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              style={[styles.headerSide, styles.close]}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <X size={29} color={colors.text} strokeWidth={1.65} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  sheet: {
    maxHeight: '76%',
    minHeight: 320,
    borderTopLeftRadius: 29,
    borderTopRightRadius: 29,
    backgroundColor: '#1C1D20',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 52,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.30)',
    marginTop: 10,
  },
  header: {
    height: 70,
    paddingHorizontal: 21,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSide: { width: 42, height: 42 },
  close: { alignItems: 'center', justifyContent: 'center' },
  title: {
    color: colors.text,
    fontFamily: fonts.displayMedium,
    fontSize: 19,
    textAlign: 'center',
  },
  scroll: { flexGrow: 0 },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
});
