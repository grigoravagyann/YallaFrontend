import {
  ServiceRequestRateLimitedError,
  WAITER_CALL_REASONS,
  isTabAccessEnded,
  type WaiterCallReason,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, space, typography } from '../theme';
import { Button } from './Button';
import { Chip } from './Chip';
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

/** The veil fades; the sheet rises. Separate timings, so the sheet never drags a grey box up with it. */
const BACKDROP_IN_MS = 180;
const BACKDROP_OUT_MS = 160;
const SHEET_IN_MS = 260;
const SHEET_OUT_MS = 200;
/** Far enough to start below any phone's bottom edge. */
const SHEET_TRAVEL = 480;

/**
 * Raise a hand, in software.
 *
 * Four presets, one tap, no typing, no reply. Not a chat: a chat creates the
 * expectation of an answer, and during the Friday rush nobody answers — which
 * leaves the diner more annoyed than if they had simply raised a hand.
 *
 * A table that has already asked several times in a few minutes is told a
 * waiter is on the way — that is what the server's rate limit means, and it is
 * not a failure to apologise for. Anything else that did not go through says so
 * plainly: telling someone a waiter is coming when nobody was told is strictly
 * worse than telling them to catch an eye.
 */
export function CallWaiterSheet({
  tabId,
  visible,
  onClose,
  initialReason,
  tableLabel,
}: CallWaiterSheetProps) {
  const { t } = useTranslation('diner');
  const insets = useSafeAreaInsets();
  const call = useCallWaiter();

  const [sent, setSent] = useState<WaiterCallReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The rate limit's answer: not an error, the floor already knows. */
  const [notice, setNotice] = useState<string | null>(null);

  const [backdrop] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(0));
  // Mounted the moment `visible` turns on (state adjusted during render, so
  // the modal exists for the way in); unmounted only once the way out ends.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    const animation = Animated.parallel([
      Animated.timing(backdrop, {
        toValue: visible ? 1 : 0,
        duration: visible ? BACKDROP_IN_MS : BACKDROP_OUT_MS,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: visible ? 1 : 0,
        duration: visible ? SHEET_IN_MS : SHEET_OUT_MS,
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, mounted, backdrop, rise]);

  const raise = useCallback(
    async (reason: WaiterCallReason) => {
      setError(null);
      setNotice(null);
      try {
        await call.mutateAsync({ tabId, reason, commandId: newCommandId() });
        setSent(reason);
      } catch (caught) {
        // The one branch that must never be silent.
        if (caught instanceof ServiceRequestRateLimitedError) {
          setNotice(
            caught.windowMinutes
              ? t('waiter.rateLimited', { count: caught.windowMinutes })
              : t('waiter.rateLimitedNoWindow'),
          );
        } else if (isTabAccessEnded(caught)) {
          setError(t('tab.accessEnded.body'));
        } else {
          setError(t('waiter.failed'));
        }
      }
    },
    [call, tabId, t],
  );

  const close = useCallback(() => {
    setSent(null);
    setError(null);
    setNotice(null);
    onClose();
  }, [onClose]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [SHEET_TRAVEL, 0] });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={close}>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable
          style={styles.fill}
          accessibilityRole="button"
          accessibilityLabel={t('waiter.close')}
          onPress={close}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + space.xl, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={styles.title} accessibilityRole="header">
          {t('waiter.title')}
        </Text>
        <Text style={styles.body}>{t('waiter.body')}</Text>

        {sent === null ? (
          <View style={styles.presets}>
            {WAITER_CALL_REASONS.map((reason) => (
              <Chip
                key={reason}
                label={t(`waiter.${reason}`)}
                selected={reason === initialReason}
                disabled={call.isPending}
                onPress={() => void raise(reason)}
                style={styles.preset}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.sent} accessibilityRole="alert">
            {tableLabel
              ? t('waiter.sentAtTable', { what: t(`waiter.${sent}`), label: tableLabel })
              : t('waiter.sent', { what: t(`waiter.${sent}`) })}
          </Text>
        )}

        {call.isPending ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.body}>{t('waiter.sending')}</Text>
          </View>
        ) : null}

        {notice ? <Text style={styles.sent}>{notice}</Text> : null}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Button label={t('waiter.close')} variant="text" onPress={close} style={styles.close} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlayDark,
  },
  fill: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.surface,
    gap: space.sm,
    ...shadows.float,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: space.sm,
  },
  title: { ...typography.h3, color: colors.text },
  body: { ...typography.body, color: colors.textMuted },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  // Two to a row, each taking half, so four presets read as a grid of choices.
  preset: { flexGrow: 1, flexBasis: '45%' },
  sent: {
    marginTop: space.sm,
    ...typography.bodyLg,
    fontWeight: typography.buttonMedium.fontWeight,
    color: colors.successInk,
  },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  error: { ...typography.body, color: colors.errorInk },
  close: { marginTop: space.xs },
});
