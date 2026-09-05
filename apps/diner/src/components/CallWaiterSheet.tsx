import { WAITER_CALL_REASONS, isEndpointNotWired, type WaiterCallReason } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import {
  color,
  elevation,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
  touchTarget,
} from '@yalla/tokens';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useCallWaiter } from '../data/queries';
import { newCommandId } from '../lib/commandId';

export interface CallWaiterSheetProps {
  readonly tabId: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  /**
   * Opened for a particular reason — "ask for the bill" from the settle screen.
   *
   * Highlighted rather than sent: the tap is still the diner's. A sheet that
   * fires on open would summon a waiter to a table that was only being read.
   */
  readonly initialReason?: WaiterCallReason | undefined;
  /** The table number, so the confirmation says where the counter was pinged. */
  readonly tableLabel?: string | undefined;
}

/**
 * Raise a hand, in software.
 *
 * Four presets, one tap, no typing, no reply. Not a chat: a chat creates the
 * expectation of an answer, and during the Friday rush nobody answers — which
 * leaves the diner more annoyed than if they had simply raised a hand.
 *
 * The endpoint does not exist on the backend yet. Rather than fake a
 * confirmation, the HTTP gateway throws `EndpointNotWiredError` and this sheet
 * says so plainly. Telling someone a waiter is coming when nobody was told is
 * strictly worse than telling them to catch an eye.
 */
export function CallWaiterSheet({
  tabId,
  visible,
  onClose,
  initialReason,
  tableLabel,
}: CallWaiterSheetProps) {
  const { t } = useTranslation('diner');
  const call = useCallWaiter();

  const [sent, setSent] = useState<WaiterCallReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  const raise = useCallback(
    async (reason: WaiterCallReason) => {
      setError(null);
      try {
        await call.mutateAsync({ tabId, reason, commandId: newCommandId() });
        setSent(reason);
      } catch (caught) {
        // The one branch that must never be silent.
        setError(isEndpointNotWired(caught) ? t('waiter.notWired') : t('waiter.failed'));
      }
    },
    [call, tabId, t],
  );

  const close = useCallback(() => {
    setSent(null);
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('waiter.close')} onPress={close} />

      <View style={styles.sheet}>
        <Text style={styles.title}>{t('waiter.title')}</Text>
        <Text style={styles.body}>{t('waiter.body')}</Text>

        {sent === null ? (
          <View style={styles.grid}>
            {WAITER_CALL_REASONS.map((reason) => (
              <Pressable
                key={reason}
                accessibilityRole="button"
                accessibilityState={{ disabled: call.isPending, busy: call.isPending }}
                disabled={call.isPending}
                onPress={() => void raise(reason)}
                style={({ pressed }) => [
                  styles.preset,
                  reason === initialReason && styles.presetSuggested,
                  pressed && styles.pressed,
                  call.isPending && styles.disabled,
                ]}
              >
                <Text style={styles.presetText}>{t(`waiter.${reason}`)}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.sent}>
            {tableLabel
              ? t('waiter.sentAtTable', { what: t(`waiter.${sent}`), label: tableLabel })
              : t('waiter.sent', { what: t(`waiter.${sent}`) })}
          </Text>
        )}

        {call.isPending ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={color.primary} />
            <Text style={styles.body}>{t('waiter.sending')}</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={close}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>{t('waiter.close')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  presetSuggested: { borderColor: color.primary, borderWidth: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(18, 33, 26, 0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.xl,
    paddingBottom: space.xxl,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: color.surface,
    ...elevation.sheet.native,
    gap: space.sm,
  },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
  body: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  preset: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: touchTarget.minimum + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.paper,
  },
  presetText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.foreground },
  sent: {
    marginTop: space.sm,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: fontWeight.medium,
    color: color.success,
  },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  error: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.danger },
  close: {
    marginTop: space.sm,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  closeText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.foreground },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
});
