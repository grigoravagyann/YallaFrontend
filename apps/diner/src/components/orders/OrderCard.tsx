import { YEREVAN, branchDayKey, formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { canCancelOrder, canTrackOrder, type Order } from '../../orders/model';
import { usePlace } from '../../places/hooks';
import { colors, fontWeight, radius, space, typography } from '../../theme';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Card } from '../Card';
import { PhotoImage } from '../PhotoImage';
import { Skeleton } from '../Skeleton';
import { Text } from '../Text';

export const ORDER_THUMB = 56;

export interface OrderCardProps {
  readonly order: Order;
  /** The diner's clock, for "Today, 10:15". Passed in so a list re-renders once a minute, not per card. */
  readonly now: Date;
  readonly onViewDetails: () => void;
  readonly onCancel?: () => void;
  readonly onTrack?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Where and when an order was placed, in the place's own timezone.
 *
 * An order carries no zone of its own; the place it was made at does. A diner
 * reading this from another country still sees the kitchen's clock — which is
 * the clock on the receipt. Until the place resolves (or when it cannot), the
 * venue's home zone stands in.
 */
export function useOrderWhen(order: Pick<Order, 'placeId' | 'placedAt'>, now: Date): string {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { data: place } = usePlace(order.placeId);
  const zone = place?.timeZoneId ?? YEREVAN;
  const time = formatTime(order.placedAt, zone, locale);
  if (branchDayKey(order.placedAt, zone) === branchDayKey(now, zone)) {
    return t('orders.today', { time });
  }
  return `${formatDate(order.placedAt, zone, locale)}, ${time}`;
}

/** "Table 5 · 2 people" for dine-in, "Takeaway" otherwise. */
export function useOrderWhere(order: Pick<Order, 'kind' | 'tableLabel' | 'partySize'>): string {
  const { t } = useTranslation('diner');
  if (order.kind === 'takeaway' || !order.tableLabel) return t('orders.kind.takeaway');
  if (order.partySize === undefined) return t('tables.table', { label: order.tableLabel });
  return t('orders.tableAndParty', { table: order.tableLabel, count: order.partySize });
}

/**
 * One order in the Orders tab: thumb, place, status pill, where, when, and
 * the one or two things you can do about it.
 */
export function OrderCard({ order, now, onViewDetails, onCancel, onTrack, style }: OrderCardProps) {
  const { t } = useTranslation('diner');
  const where = useOrderWhere(order);
  const when = useOrderWhen(order, now);
  const showCancel = onCancel !== undefined && canCancelOrder(order);
  const showTrack = onTrack !== undefined && canTrackOrder(order);

  return (
    <Card style={style}>
      {/* Only the summary block opens the detail: the buttons under it are
          controls of their own, and a button inside a button is invalid on the
          web build and nests them in the accessibility tree on the phone. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${order.placeName}, ${t(`orders.status.${order.status}`)}, ${where}, ${when}`}
        onPress={onViewDetails}
        style={({ pressed }) => [styles.top, pressed && styles.topPressed]}
      >
        <PhotoImage
          source={order.placePhoto}
          style={styles.thumb}
          accessibilityLabel={order.placeName}
        />
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {order.placeName}
            </Text>
            <Badge variant={order.status} tone="soft" size="sm" />
          </View>
          <Text numberOfLines={1} style={styles.detail}>
            {where}
          </Text>
          <Text numberOfLines={1} style={styles.detail}>
            {when}
          </Text>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Button
          label={t('orders.viewDetails')}
          variant="outline"
          onPress={onViewDetails}
          style={styles.action}
        />
        {showCancel ? (
          <Button
            label={t('orders.cancel')}
            variant="outline"
            onPress={onCancel}
            style={styles.action}
          />
        ) : null}
        {showTrack ? (
          <Button
            label={t('orders.trackOrder')}
            variant="outline"
            onPress={onTrack}
            style={styles.action}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** The same shape, cream, while the list loads. */
export function OrderCardSkeleton({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  return (
    <Card style={style}>
      <View style={styles.top}>
        <Skeleton width={ORDER_THUMB} height={ORDER_THUMB} borderRadius={radius.chip} />
        <View style={[styles.body, styles.skeletonBody]}>
          <View style={styles.nameRow}>
            <Skeleton width="55%" height={18} />
            <Skeleton width={64} height={18} borderRadius={radius.pill} />
          </View>
          <Skeleton width="45%" height={14} />
          <Skeleton width="35%" height={14} />
        </View>
      </View>
      <View style={styles.actions}>
        <Skeleton height={48} borderRadius={radius.pill} style={styles.action} />
        <Skeleton height={48} borderRadius={radius.pill} style={styles.action} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: space.md },
  topPressed: { opacity: 0.7 },
  thumb: { width: ORDER_THUMB, height: ORDER_THUMB, borderRadius: radius.chip },
  body: { flex: 1, gap: 2 },
  skeletonBody: { gap: space.xs + 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text, flex: 1 },
  detail: { ...typography.body, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  action: { flex: 1, paddingHorizontal: space.md },
});
