import { Ionicons } from '@expo/vector-icons';
import {
  ServiceRequestRateLimitedError,
  WAITER_CALL_REASONS,
  isTabAccessEnded,
  type WaiterCallReason,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  radius,
  shadows,
  space,
  typography,
  type IoniconName,
} from '../theme';
import { IconButton } from './IconButton';
import { SheetModal } from './motion/SheetModal';
import { usePressScale } from './motion/usePressScale';
import { Text } from './Text';
import { useCallWaiter } from '../data/queries';
import { newCommandId } from '../lib/commandId';
import { haptics } from '../lib/haptics';

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
  /** The floor has been told — the tab screen turns its Call button into "Called". */
  readonly onSent?: ((reason: WaiterCallReason) => void) | undefined;
}

/** A glyph for each preset, in the tile above its label. */
const REASON_ICON: Record<WaiterCallReason, IoniconName> = {
  napkins: 'layers-outline',
  water: 'water-outline',
  bill: 'receipt-outline',
  other: 'hand-left-outline',
};

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
  onSent,
}: CallWaiterSheetProps) {
  const { t } = useTranslation('diner');
  const call = useCallWaiter();

  const [sent, setSent] = useState<WaiterCallReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The rate limit's answer: not an error, the floor already knows. */
  const [notice, setNotice] = useState<string | null>(null);

  // A fresh sheet every time it opens. Cleared on the way in rather than the
  // way out, so the confirmation stays put while the sheet slides away.
  const [shown, setShown] = useState(visible);
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      setSent(null);
      setError(null);
      setNotice(null);
    }
  }

  const raise = useCallback(
    async (reason: WaiterCallReason) => {
      setError(null);
      setNotice(null);
      try {
        await call.mutateAsync({ tabId, reason, commandId: newCommandId() });
        haptics.tap();
        setSent(reason);
        onSent?.(reason);
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
    [call, tabId, t, onSent],
  );

  return (
    <SheetModal
      visible={visible}
      onRequestClose={onClose}
      closeLabel={t('waiter.close')}
      accessibilityLabel={t('waiter.title')}
    >
      <View style={styles.head}>
        <Text display style={styles.title} accessibilityRole="header">
          {t('waiter.title')}
        </Text>
        <IconButton
          icon={actionIcon.close}
          accessibilityLabel={t('waiter.close')}
          onPress={onClose}
        />
      </View>

      {sent === null ? (
        <View style={styles.grid}>
          {WAITER_CALL_REASONS.map((reason) => (
            <ReasonTile
              key={reason}
              icon={REASON_ICON[reason]}
              label={t(`waiter.${reason}`)}
              selected={reason === initialReason}
              disabled={call.isPending}
              onPress={() => void raise(reason)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.sentRow}>
          <Ionicons name="checkmark-circle-outline" size={iconSize.lg} color={colors.successInk} />
          <Text style={styles.sent} accessibilityRole="alert">
            {tableLabel
              ? t('waiter.sentAtTable', { what: t(`waiter.${sent}`), label: tableLabel })
              : t('waiter.sent', { what: t(`waiter.${sent}`) })}
          </Text>
        </View>
      )}

      {call.isPending ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.hint}>{t('waiter.sending')}</Text>
        </View>
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {sent === null ? <Text style={[styles.hint, styles.centred]}>{t('waiter.body')}</Text> : null}
    </SheetModal>
  );
}

/** One preset: the glyph over its label on a glass tile; brand-filled when it is the one asked for. */
function ReasonTile({
  icon,
  label,
  selected,
  disabled,
  onPress,
}: {
  readonly icon: IoniconName;
  readonly label: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const press = usePressScale();
  const ink = selected ? colors.onPrimary : colors.text;
  return (
    <Animated.View style={[styles.tileWrap, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.tile,
          selected && styles.tileSelected,
          pressed && (selected ? styles.tileSelectedPressed : styles.tilePressed),
          disabled && styles.tileDisabled,
        ]}
      >
        <Ionicons name={icon} size={iconSize.md + 2} color={ink} />
        <Text numberOfLines={1} style={[styles.tileLabel, { color: ink }]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const TILE_HEIGHT = 76;

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 19, lineHeight: 26, color: colors.text, flexShrink: 1 },
  // Two to a row, each taking half, so four presets read as a grid of choices.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tileWrap: { flexGrow: 1, flexBasis: '45%' },
  tile: {
    height: TILE_HEIGHT,
    borderRadius: radius.hero,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.sm,
  },
  tilePressed: { opacity: 0.7 },
  tileSelected: { backgroundColor: colors.brand, borderColor: colors.brand, ...shadows.brand },
  tileSelectedPressed: { backgroundColor: colors.brandPressed },
  tileDisabled: { opacity: 0.5 },
  tileLabel: { ...typography.body, fontWeight: fontWeight.medium },
  sentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  sent: {
    flex: 1,
    ...typography.bodyLg,
    fontWeight: fontWeight.medium,
    color: colors.successInk,
  },
  notice: { ...typography.bodyLg, fontWeight: fontWeight.medium, color: colors.successInk },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hint: { ...typography.caption, color: colors.textMuted },
  centred: { textAlign: 'center' },
  error: { ...typography.body, color: colors.errorInk },
});
