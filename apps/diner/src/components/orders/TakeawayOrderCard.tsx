import { Ionicons } from '@expo/vector-icons';
import { isTakeawayActive, type DinerTakeawaySummary } from '@yalla/api';
import { YEREVAN, formatDram, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Order } from '../../orders/model';
import { usePlace } from '../../places/hooks';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  radius,
  space,
  tabularNumbers,
  typography,
} from '../../theme';
import { Text } from '../Text';
import { useOrderWhen } from './OrderCard';

/**
 * A takeaway order on the Orders tab (2026-10-22), opening its status screen.
 *
 * On its way: the bag, the venue, "Takeaway · T-482 · 4 items", the status
 * pill on a row of its own (so a long venue name never squeezes it), and
 * under them when it will be ready and what is paid at the venue. Finished:
 * one quiet row — the venue, when, how many, and the total.
 */
export function TakeawayOrderCard({
  order,
  takeaway,
  now,
  onOpen,
  style,
}: {
  readonly order: Order;
  readonly takeaway: DinerTakeawaySummary;
  readonly now: Date;
  readonly onOpen: () => void;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return isTakeawayActive(takeaway.status) ? (
    <ActiveCard order={order} takeaway={takeaway} onOpen={onOpen} style={style} />
  ) : (
    <PastRow order={order} takeaway={takeaway} now={now} onOpen={onOpen} style={style} />
  );
}

function ActiveCard({
  order,
  takeaway,
  onOpen,
  style,
}: {
  readonly order: Order;
  readonly takeaway: DinerTakeawaySummary;
  readonly onOpen: () => void;
  readonly style?: StyleProp<ViewStyle> | undefined;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { data: place } = usePlace(order.placeId);
  const zone = place?.timeZoneId ?? YEREVAN;
  const kindLine = t('takeaway.orders.kindLine', {
    code: takeaway.code,
    count: takeaway.itemCount,
  });
  const status = t(`takeaway.orderStatus.${statusWord(takeaway.status)}`);
  const ready = takeaway.readyAtUtc
    ? t('takeaway.orders.readyAt', { time: formatTime(takeaway.readyAtUtc, zone, locale) })
    : t('takeaway.orders.readyAround', {
        time: formatTime(takeaway.requestedPickupUtc, zone, locale),
      });
  const total = t('takeaway.orders.atVenue', { total: formatDram(order.totalDram, locale) });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[order.placeName, kindLine, status, ready, total].join(', ')}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, styles.active, pressed && styles.pressed, style]}
    >
      <View style={styles.top}>
        <View style={styles.glyph} aria-hidden>
          <Ionicons name={actionIcon.takeaway} size={iconSize.md} color={colors.primary} />
        </View>
        <View style={styles.text}>
          <Text numberOfLines={2} style={styles.name}>
            {order.placeName}
          </Text>
          <Text style={styles.detail}>{kindLine}</Text>
          <View style={styles.pill}>
            <View style={[styles.pillDot, takeaway.status === 'ready' && styles.pillDotReady]} />
            <Text style={styles.pillText}>{status}</Text>
          </View>
        </View>
      </View>
      <View style={styles.bottom}>
        <Text style={styles.ready}>{ready}</Text>
        <Text style={styles.total}>{total}</Text>
      </View>
    </Pressable>
  );
}

function PastRow({
  order,
  takeaway,
  now,
  onOpen,
  style,
}: {
  readonly order: Order;
  readonly takeaway: DinerTakeawaySummary;
  readonly now: Date;
  readonly onOpen: () => void;
  readonly style?: StyleProp<ViewStyle> | undefined;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const when = useOrderWhen(order, now);
  const line = t('takeaway.orders.pastLine', { when, count: takeaway.itemCount });
  const status = t(`takeaway.orderStatus.${statusWord(takeaway.status)}`);
  const total = formatDram(order.totalDram, locale);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[order.placeName, line, status, total].join(', ')}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, styles.past, pressed && styles.pressed, style]}
    >
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.name}>
          {order.placeName}
        </Text>
        <Text numberOfLines={1} style={styles.detail}>
          {line}
        </Text>
        {takeaway.status === 'collected' ? null : <Text style={styles.detail}>{status}</Text>}
      </View>
      <Text style={styles.total}>{total}</Text>
    </Pressable>
  );
}

/** The pill's word: a status a newer server added reads as waiting. */
function statusWord(status: DinerTakeawaySummary['status']) {
  return status === 'unknown' ? 'sent' : status;
}

const GLYPH = 40;

const styles = StyleSheet.create({
  card: {
    padding: space.md + 2,
    borderRadius: radius.card + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  active: { gap: space.sm + 2, borderColor: colors.logoInk },
  past: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  pressed: { opacity: 0.75 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm + 2 },
  glyph: {
    width: GLYPH,
    height: GLYPH,
    borderRadius: GLYPH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, minWidth: 0, gap: space.xs },
  name: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold, color: colors.text },
  detail: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 26,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.logoInk,
    backgroundColor: colors.surface,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.text },
  pillDotReady: { backgroundColor: colors.success },
  pillText: { fontSize: 12.5, lineHeight: 16, fontWeight: fontWeight.bold, color: colors.text },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  ready: { fontSize: 13.5, lineHeight: 18, ...tabularNumbers, color: colors.text, flexShrink: 1 },
  total: {
    ...typography.body,
    fontWeight: fontWeight.bold,
    ...tabularNumbers,
    color: colors.text,
  },
});
