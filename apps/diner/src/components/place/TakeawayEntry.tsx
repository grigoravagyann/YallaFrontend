import { Ionicons } from '@expo/vector-icons';
import { useLocale, useTranslation } from '@yalla/i18n';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { formatClock, type Place } from '../../places/model';
import { useTakeawayAvailability } from '../../takeaway/queries';
import { actionIcon, colors, fontWeight, iconSize, radius, space, typography } from '../../theme';
import { usePressScale } from '../motion/usePressScale';
import { Text } from '../Text';

/**
 * Takeaway on the place page (2026-10-22): the card under the header that says
 * what it is, and the "Order to take away" button above "Book a table" — or,
 * while the place is shut, when it opens for takeaway again.
 *
 * Both render only for a place that takes takeaway at all (`place.takeaway`,
 * public). Whether it takes orders *now* is the availability's, which needs a
 * session; signed out, the place's own "open now" stands in, and the checkout
 * asks for a log-in.
 */

/** "Order to take away · Ready in about 20 minutes, pay when you pick it up". */
export function TakeawayInfoCard({
  prepMinutes,
  style,
}: {
  readonly prepMinutes: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardGlyph} aria-hidden>
        <Ionicons name={actionIcon.takeaway} size={iconSize.md} color={colors.primary} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{t('takeaway.place.cardTitle')}</Text>
        <Text style={styles.cardBody}>
          {t('takeaway.place.cardBody', { minutes: prepMinutes })}
        </Text>
      </View>
    </View>
  );
}

/**
 * The footer's takeaway line: the outline button while orders are taken, the
 * quiet "Takeaway from opening, 10:00" while they are not.
 */
export function TakeawayFooterAction({
  place,
  onOpen,
}: {
  readonly place: Place;
  readonly onOpen: () => void;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const press = usePressScale();
  const { data: availability } = useTakeawayAvailability(place.id);

  const open = availability ? availability.open : place.openState.isOpen;
  if (availability && !availability.enabled) return null;

  if (!open) {
    const opensAt = availability ? availability.opensAt : (place.openState.opensAt ?? null);
    return (
      <View style={styles.closed} accessibilityRole="text" accessibilityLiveRegion="polite">
        <Text style={styles.closedText} numberOfLines={2}>
          {opensAt
            ? t('takeaway.place.closedFrom', { time: formatClock(opensAt, locale) })
            : t('takeaway.place.closed')}
        </Text>
      </View>
    );
  }

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('takeaway.place.cta')}
        onPress={onOpen}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [styles.outline, pressed && styles.outlinePressed]}
      >
        <Ionicons name={actionIcon.takeaway} size={iconSize.md - 2} color={colors.logoInk} />
        <Text style={styles.outlineLabel}>{t('takeaway.place.cta')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const BUTTON_HEIGHT = 52;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md + 2,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.logoInk,
  },
  cardGlyph: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold, color: colors.text },
  cardBody: { fontSize: 13, lineHeight: 19, color: colors.textMuted },

  outline: {
    minHeight: BUTTON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.logoInk,
  },
  outlinePressed: { backgroundColor: colors.primarySoft },
  outlineLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold, color: colors.text },
  closed: {
    minHeight: BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralSoft,
  },
  closedText: { ...typography.body, color: colors.neutralBadge, textAlign: 'center' },
});
