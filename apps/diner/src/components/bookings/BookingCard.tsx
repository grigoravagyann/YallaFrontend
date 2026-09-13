import type { Booking, BookingStatus } from '@yalla/api';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { canCancel } from '../../lib/bookingActions';
import { usePlace } from '../../places/hooks';
import {
  colors,
  fontWeight,
  iconSize,
  placeTypeIcon,
  radius,
  space,
  typography,
} from '../../theme';
import { Badge, type BadgeVariant } from '../Badge';
import { Button } from '../Button';
import { Card } from '../Card';
import { PhotoImage } from '../PhotoImage';
import { Skeleton } from '../Skeleton';
import { Text } from '../Text';

export const BOOKING_THUMB = 56;

/**
 * A booking's status in the one pill vocabulary the app has.
 *
 * The colour comes from the nearest order/table variant, the words from the
 * booking's own `bookings.status.*` copy — so "Awaiting venue" is orange like
 * every other "not yet", and a venue cancellation is red where the diner's own
 * is grey. Which side cancelled is the one thing a list reader wants to know.
 */
export const bookingBadgeVariant: Readonly<Record<BookingStatus, BadgeVariant>> = {
  confirmed: 'confirmed',
  pendingApproval: 'preparing',
  seated: 'ready',
  completed: 'completed',
  cancelledByDiner: 'closed',
  cancelledByVenue: 'cancelled',
  noShow: 'cancelled',
  unknown: 'closed',
};

export function BookingBadge({ status }: { readonly status: BookingStatus }) {
  const { t } = useTranslation('diner');
  return (
    <Badge
      variant={bookingBadgeVariant[status]}
      tone="soft"
      size="sm"
      label={t(`bookings.status.${status}`)}
    />
  );
}

export interface BookingCardProps {
  readonly booking: Booking;
  readonly onViewDetails: () => void;
  /** Offered only while the server would still accept a cancellation. */
  readonly onCancel?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * One booking in the Bookings tab, the same shape as an order card: thumb from
 * the place when the browse data knows the branch, name, status pill, table
 * and party, the date and time in the branch's zone, and the buttons.
 */
export function BookingCard({ booking, onViewDetails, onCancel, style }: BookingCardProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { data: place } = usePlace(booking.branchId);
  const photo = place?.photos[0];
  // The place the diner browsed when the browse data knows the branch; the
  // server's venue name otherwise.
  const where = place?.name ?? booking.venueName ?? booking.branchName;
  const tableLine = t('orders.tableAndParty', {
    table: booking.tableLabel,
    count: booking.partySize,
  });
  // Branch timezone, always — the diner may be reading this from Moscow.
  const when = `${formatDate(booking.slotUtc, booking.timeZoneId, locale)} · ${formatTime(
    booking.slotUtc,
    booking.timeZoneId,
    locale,
  )}`;
  const showCancel = onCancel !== undefined && canCancel(booking.status);

  return (
    <Card style={style}>
      {/* Only the summary block opens the detail: the buttons under it are
          controls of their own, and a button inside a button is invalid on the
          web build and nests them in the accessibility tree on the phone. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${where}, ${t(`bookings.status.${booking.status}`)}, ${tableLine}, ${when}, ${booking.code}`}
        onPress={onViewDetails}
        style={({ pressed }) => [styles.top, pressed && styles.topPressed]}
      >
        {photo ? (
          <PhotoImage source={photo} style={styles.thumb} accessibilityLabel={where} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons
              name={place?.type === 'cafe' ? placeTypeIcon.cafe : placeTypeIcon.restaurant}
              size={iconSize.lg}
              color={colors.textSubtle}
            />
          </View>
        )}
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {where}
            </Text>
            <BookingBadge status={booking.status} />
          </View>
          <Text numberOfLines={1} style={styles.detail}>
            {tableLine}
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
            label={t('booking.cancel')}
            variant="outline"
            onPress={onCancel}
            style={styles.action}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** The same shape, cream, while the list loads. */
export function BookingCardSkeleton({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  return (
    <Card style={style}>
      <View style={styles.top}>
        <Skeleton width={BOOKING_THUMB} height={BOOKING_THUMB} borderRadius={radius.chip} />
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
  thumb: { width: BOOKING_THUMB, height: BOOKING_THUMB, borderRadius: radius.chip },
  thumbFallback: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  skeletonBody: { gap: space.xs + 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text, flex: 1 },
  detail: { ...typography.body, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  action: { flex: 1, paddingHorizontal: space.md },
});
