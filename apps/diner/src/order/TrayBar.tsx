import { formatDram, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { usePressScale } from '../components/motion/usePressScale';
import { Text } from '../components/Text';
import { useNow } from '../hooks/useNow';
import {
  colors,
  fontWeight,
  layout,
  radius,
  shadows,
  space,
  tabularNumbers,
  typography,
} from '../theme';
import { trayBarState } from './tray';
import { useTray } from './TrayProvider';

/**
 * The bar at the bottom of the menu.
 *
 * **This bar's only job is that it cannot be read as "sent".**
 *
 * It used to be a single filled pill: a count, a total, and the word *Review*.
 * Every part of that reads like an order that exists. "Review" describes looking
 * at something already done; a total beside it looks like a bill; and the only
 * other filled pill on this flow is the one that confirms things. A diner who
 * reads it that way puts the phone down and waits twenty minutes for food nobody
 * is cooking — the worst failure in the app, and the one Prompt 9 flagged and
 * could not test.
 *
 * Three rules, all of them about the same thing:
 *
 * 1. **The action says what it does.** "Add to bill" opens the tray, where the
 *    one press that places anything reads "Send N items to the kitchen".
 * 2. **The bar states the negative.** While anything is in the tray its second
 *    line says, in words rather than by implication, that nothing has been
 *    sent. A state a person has to infer is a state half of them infer wrongly.
 * 3. **The confirmed state is a different object.** Different colour, different
 *    shape, no count, no subtotal, and the server's own estimate on it. Nothing
 *    about it can be produced by rendering the tray differently, which is what
 *    stops the two from converging the next time somebody edits this file.
 *
 * The same honesty rule the staff app's queue follows: never present a state the
 * server does not agree with. `lastSent` is set only from a `PlaceOrderResult`.
 */

export interface TrayBarProps {
  readonly tabId: string;
  /** Opens the tray for review before sending. */
  readonly onReview: () => void;
  /** Dismisses the confirmed state and goes to the bill. */
  readonly onSeeBill: () => void;
  /** The branch's zone. Never the device's — see `RenderedTab.timeZoneId`. */
  readonly timeZoneId: string;
  /**
   * Whether this person may order now. With an empty tray the bar is a dimmed
   * "Pick some dishes" for them, and nothing at all for anyone who cannot order.
   */
  readonly canOrder?: boolean;
}

/** How far the menu's list scrolls under the bar (plus the device's bottom inset). */
export const TRAY_BAR_CLEARANCE = layout.controlHeightLarge + space.xxxl + space.lg;

export function TrayBar({ onReview, onSeeBill, timeZoneId, canOrder = false }: TrayBarProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { state, dispatch } = useTray();
  const insets = useSafeAreaInsets();

  // Subscribed rather than read at render, so "sitting in your tray" actually
  // appears while somebody is staring at the menu and not touching anything.
  const now = useNow(30_000);
  const bar = trayBarState(state, now.getTime());

  if (bar.kind === 'empty' && !canOrder) return null;

  return (
    <View style={[styles.slot, { paddingBottom: insets.bottom + space.md }]}>
      {/* The list fades into the ground under the bar instead of being cut. */}
      <LinearGradient
        pointerEvents="none"
        colors={[colors.backgroundClear, colors.background, colors.background]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />

      {bar.kind === 'sent' ? (
        <View style={styles.sentBar} accessibilityRole="summary">
          <View style={styles.sentText}>
            <Text style={styles.sentTitle}>{t('tray.bar.sentTitle')}</Text>
            {/*
              The kitchen's own estimate, stated once. Not a progress bar that
              creeps for twenty minutes and is wrong at the end of it, and not a
              countdown computed here: `estimatedReadyAtUtc` is the longest prep
              time on the order, from the server.
            */}
            <Text style={styles.sentBody}>
              {bar.estimatedReadyAtUtc
                ? t('tray.bar.sentReady', {
                    time: formatTime(bar.estimatedReadyAtUtc, timeZoneId, locale),
                  })
                : t('tray.bar.sentNoEstimate')}
            </Text>
          </View>
          <Button
            label={t('tray.bar.seeBill')}
            variant="secondary"
            size="small"
            fullWidth={false}
            onPress={() => {
              dispatch({ type: 'dismissSent' });
              onSeeBill();
            }}
          />
        </View>
      ) : bar.kind === 'holding' ? (
        <BarButton
          title={t('tray.bar.addToBill')}
          // The negative, in words, on the button itself: the count and the
          // tray's own arithmetic, then that none of it has gone anywhere yet.
          detail={[
            t('tray.bar.count', { count: bar.count }),
            formatDram(bar.subtotalDram, locale),
            bar.nudge ? t('tray.bar.stillNotSent') : t('tray.bar.notSent'),
          ].join(' · ')}
          onPress={onReview}
        />
      ) : (
        <BarButton title={t('tray.bar.empty')} disabled onPress={onReview} />
      )}
    </View>
  );
}

/** The brand pill: what it does on the first line, what is in the tray on the second. */
function BarButton({
  title,
  detail,
  disabled = false,
  onPress,
}: {
  readonly title: string;
  readonly detail?: string;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  const press = usePressScale();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={detail ? `${title}. ${detail}` : title}
        accessibilityState={{ disabled }}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.cta,
          pressed && styles.ctaPressed,
          disabled && styles.ctaDisabled,
        ]}
      >
        <Text style={styles.ctaTitle}>{title}</Text>
        {detail ? (
          <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.ctaDetail}>
            {detail}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: { paddingHorizontal: layout.screenPadding, paddingTop: space.md + 2 },
  cta: {
    minHeight: layout.controlHeightLarge,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandEdge,
    ...shadows.brand,
  },
  ctaPressed: { backgroundColor: colors.brandPressed },
  ctaDisabled: { opacity: 0.55 },
  ctaTitle: { ...typography.button, color: colors.onPrimary },
  ctaDetail: { ...typography.caption, color: colors.onPrimary, ...tabularNumbers },

  // The confirmation: a green tint with a green edge, no count and no money on it.
  sentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.controlHeightLarge,
    paddingVertical: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    borderRadius: radius.hero,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.successStrong,
  },
  sentText: { flex: 1, gap: 2 },
  sentTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  sentBody: { ...typography.caption, color: colors.text },
});
