import { awaitsVenueAnswer, preOrderView, type Booking, type BookingStatus } from '@yalla/api';
import { formatDate, formatDayAndTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { canCancel } from '../../lib/bookingActions';
import { bookingCountdown } from '../../lib/bookingsList';
import { usePlace } from '../../places/hooks';
import {
  actionIcon,
  colors,
  displayWeight,
  fontWeight,
  iconSize,
  radius,
  shadows,
  space,
  tabularNumbers,
  typography,
  type BadgeTone,
  type IoniconName,
} from '../../theme';
import { Badge, type BadgeVariant } from '../Badge';
import { Button } from '../Button';
import { Card } from '../Card';
import { usePressScale } from '../motion/usePressScale';
import { directionsUrl } from '../place/PlaceActions';
import { PhotoImage } from '../PhotoImage';
import { Skeleton } from '../Skeleton';
import { Text } from '../Text';
import { tableWithRoom } from './bookingText';
import { PRE_ORDER_ICON, PreOrderSummaryLine } from './PreOrderCard';
import { PromiseNote, promiseCopy } from './PromiseNote';
import { TableRequestCard } from './TableRequestCard';
import { useVenueAnswer, VenueAnswerNote } from './VenueAnswer';

/** The photo band across the top of the next booking. */
export const HERO_PHOTO_HEIGHT = 118;
/** The square photo of every other booking in the list. */
export const BOOKING_THUMB = 64;
/** The photo in the cancel sheet's summary. */
const SUMMARY_THUMB = 52;

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

/**
 * The status's words. Two venue-side cancellations read as what they were:
 * declined — "Not confirmed", never confirmed in the first place — and
 * cancelled automatically by the pause after three no-shows in three days
 * (guest record, 2026-10-20), which the venue did not do.
 */
export function bookingStatusKey(
  booking: Pick<Booking, 'status' | 'declinedBecause' | 'cancelledBecause'>,
): string {
  if (booking.status === 'cancelledByVenue') {
    if (booking.cancelledBecause === 'noShowBlock') return 'bookings.status.cancelledAutomatically';
    if (booking.declinedBecause) return 'bookings.status.declined';
  }
  return `bookings.status.${booking.status}`;
}

export function BookingBadge({
  booking,
  tone = 'soft',
}: {
  readonly booking: Pick<Booking, 'status' | 'declinedBecause' | 'cancelledBecause'>;
  /** `solid` on a photo and in the list; `soft` on the detail card. */
  readonly tone?: BadgeTone;
}) {
  const { t } = useTranslation('diner');
  return (
    <Badge
      variant={bookingBadgeVariant[booking.status]}
      tone={tone}
      size="sm"
      label={t(bookingStatusKey(booking))}
    />
  );
}

/** "Three missed bookings in three days." under a booking the pause cancelled; else nothing. */
export function NoShowBlockReason({
  booking,
  style,
}: {
  readonly booking: Pick<Booking, 'status' | 'cancelledBecause'>;
  readonly style?: StyleProp<TextStyle>;
}) {
  const { t } = useTranslation('diner');
  if (booking.status !== 'cancelledByVenue' || booking.cancelledBecause !== 'noShowBlock') {
    return null;
  }
  return <Text style={[styles.blockReason, style]}>{t('bookings.noShowBlockReason')}</Text>;
}

/** What every view of a booking says about it, in the branch's own clock. */
function useBookingFacts(booking: Booking, now: Date) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { data: place } = usePlace(booking.branchId);
  // The place the diner browsed when the browse data knows the branch; the
  // server's venue name otherwise.
  const where = place?.name ?? booking.venueName ?? booking.branchName;
  // Branch timezone, always — the diner may be reading this from Moscow.
  const moment = formatDayAndTime(booking.slotUtc, booking.timeZoneId, locale, now);
  const day =
    moment.day === 'today'
      ? t('booking.today')
      : moment.day === 'tomorrow'
        ? t('booking.tomorrow')
        : moment.date;
  // "4 · Hall": the room, when the server named one, goes everywhere the table does.
  const tableValue = tableWithRoom(booking);
  const tableLine = t('orders.tableAndParty', { table: tableValue, count: booking.partySize });
  const when = `${formatDate(booking.slotUtc, booking.timeZoneId, locale)} · ${moment.time}`;
  return {
    place,
    where,
    photo: place?.photos[0],
    day,
    date: moment.date,
    time: moment.time,
    guests: t('booking.guests', { count: booking.partySize }),
    /** "Table 4 · Hall". */
    table: t('tables.table', { label: tableValue }),
    /** "4 · Hall", under the "Table" caption. */
    tableValue,
    hasRoom: tableValue !== booking.tableLabel,
    // The code is in the name: it is what the diner reads out at the door, and
    // what the list is searched by.
    label: `${where}, ${t(bookingStatusKey(booking))}, ${tableLine}, ${when}, ${booking.code}`,
  };
}

export interface BookingHeroCardProps {
  readonly booking: Booking;
  /** The diner's clock, ticking in the list rather than in every card. */
  readonly now: Date;
  readonly onOpen: () => void;
  /**
   * The booking screen on this booking, to move it. Offered only while the
   * server would still accept a change: left out, there is no Change.
   */
  readonly onChange?: (() => void) | undefined;
  /** Offered only while the server would still accept a cancellation. */
  readonly onCancel: () => void;
  /** Just cancelled here: the card stays, says so, and offers the place again. */
  readonly onBookAgain?: () => void;
  /**
   * The pre-order editor (2026-10-21), offered while one may be added or
   * changed — the server's window, read through `preOrderView`.
   */
  readonly onPreOrder?: (() => void) | undefined;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The next booking, large: the place's photo with how long until it starts and
 * the status, the day, guests and table, and the three things a diner does
 * with a booking that is coming up — get there, change it, cancel it.
 */
export function BookingHeroCard({
  booking,
  now,
  onOpen,
  onChange,
  onCancel,
  onBookAgain,
  onPreOrder,
  style,
}: BookingHeroCardProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const facts = useBookingFacts(booking, now);
  const active = canCancel(booking.status);
  // The pressable's name is all a screen reader says of what it holds: the
  // venue's answer and the guest's own promise, shown inside it, go in too.
  const answer = useVenueAnswer(booking).line;
  const promise = promiseCopy(booking, locale);
  const label = [facts.label, answer, promise]
    .map((part) =>
      part === null ? null : typeof part === 'string' ? part : t(part.key, part.params),
    )
    .filter((part): part is string => part !== null)
    .join(', ');
  const countdown = active ? bookingCountdown(booking.slotUtc, now) : null;
  const coords = facts.place?.coords ?? null;
  const preOrder = preOrderView(booking, now);
  const preOrderAction =
    onPreOrder && !onBookAgain
      ? preOrder.kind === 'offer'
        ? 'preOrder.add'
        : preOrder.kind === 'editable' && preOrder.canEdit
          ? 'preOrder.edit'
          : null
      : null;

  return (
    <Card padded={false} radiusToken="hero" style={[styles.hero, style]}>
      {/* Only the photo and the facts open the detail: the buttons under them
          are controls of their own, and a button inside a button is invalid on
          the web build and nests them in the accessibility tree on the phone. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onOpen}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <PhotoImage source={facts.photo} gradient={1} style={styles.heroPhoto}>
          {countdown ? (
            <View style={styles.countdown}>
              <Ionicons
                name={countdown.kind === 'date' ? actionIcon.calendar : actionIcon.time}
                size={13}
                color={colors.onPrimary}
              />
              <Text numberOfLines={1} style={styles.countdownText}>
                {countdown.kind === 'date' ? facts.date : t(countdown.key, countdown.params)}
              </Text>
            </View>
          ) : null}
          <View style={styles.heroStatus}>
            <BookingBadge booking={booking} tone="solid" />
          </View>
          <Text display numberOfLines={1} style={styles.heroName}>
            {facts.where}
          </Text>
        </PhotoImage>

        <View style={styles.facts}>
          <Fact label={facts.day} value={facts.time} />
          <Fact label={t('booking.partySize')} value={String(booking.partySize)} />
          <Fact label={t('confirm.tableRow')} value={facts.tableValue} />
        </View>
        {/* While the venue decides: the minutes it has left to answer. */}
        <VenueAnswerNote booking={booking} style={styles.answer} />
        {/* The guest's own yes to the guest after them, for good. */}
        <PromiseNote booking={booking} style={styles.answer} />
        {/* The dishes chosen ahead, and what became of them; or "are you on your way?". */}
        <PreOrderSummaryLine booking={booking} now={now} style={styles.answer} />
      </Pressable>

      {preOrderAction && onPreOrder ? (
        <View style={styles.request}>
          <Button
            label={t(preOrderAction)}
            icon={PRE_ORDER_ICON}
            variant="secondary"
            size="small"
            onPress={onPreOrder}
          />
        </View>
      ) : null}

      {/* Outside the pressable: its Yes and No are buttons of their own. */}
      <TableRequestCard booking={booking} style={styles.request} />

      {onBookAgain || coords || onChange || active ? <DashedRule /> : null}

      {onBookAgain ? (
        <View style={styles.footer}>
          <Button label={t('bookings.bookAgain')} onPress={onBookAgain} />
        </View>
      ) : coords || onChange || active ? (
        <View style={styles.actions}>
          {coords ? (
            <HeroAction
              icon={actionIcon.directions}
              label={t('place.action.directions')}
              onPress={() => {
                void Linking.openURL(directionsUrl(coords, facts.where)).catch(() => undefined);
              }}
            />
          ) : null}
          {onChange ? (
            <HeroAction icon="pencil-outline" label={t('bookings.change')} onPress={onChange} />
          ) : null}
          {active ? (
            <HeroAction label={t('booking.cancel')} onPress={onCancel} destructive />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.fact}>
      <Text numberOfLines={1} style={styles.factLabel}>
        {label}
      </Text>
      <Text numberOfLines={1} style={styles.factValue}>
        {value}
      </Text>
    </View>
  );
}

/** A hairline of dashes, the tear line of a ticket. */
function DashedRule() {
  return (
    <View style={styles.rule} accessibilityElementsHidden importantForAccessibility="no">
      <View style={styles.ruleDashes} />
    </View>
  );
}

function HeroAction({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  readonly icon?: IoniconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly destructive?: boolean;
}) {
  const press = usePressScale();
  const ink = destructive ? colors.errorInk : colors.text;
  return (
    <Animated.View style={[styles.actionCell, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.action,
          destructive && styles.actionDestructive,
          pressed && (destructive ? styles.actionDestructivePressed : styles.actionPressed),
        ]}
      >
        {icon ? <Ionicons name={icon} size={iconSize.sm} color={ink} /> : null}
        <Text numberOfLines={1} style={[styles.actionLabel, { color: ink }]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export interface BookingRowProps {
  readonly booking: Booking;
  readonly now: Date;
  readonly onOpen: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Every other booking: the photo, the name, when and how many — and the table
 * and its room when the server named one — and the status.
 */
export function BookingRow({ booking, now, onOpen, style }: BookingRowProps) {
  const { t } = useTranslation('diner');
  const facts = useBookingFacts(booking, now);
  // The row is one control: what it shows of a request is in its name too.
  const label = booking.incomingTableRequest
    ? `${facts.label}, ${t('booking.tableRequest.title')}`
    : facts.label;
  return (
    <Card onPress={onOpen} accessibilityLabel={label} padded={false} style={style}>
      <View style={styles.row}>
        <PhotoImage source={facts.photo} style={styles.thumb} />
        <View style={styles.rowBody}>
          <Text display numberOfLines={1} style={styles.rowName}>
            {facts.where}
          </Text>
          <Text numberOfLines={1} style={styles.rowLine}>
            {facts.hasRoom
              ? `${facts.day} · ${facts.time} · ${facts.guests} · ${facts.table}`
              : `${facts.day} · ${facts.time} · ${facts.guests}`}
          </Text>
          <BookingBadge booking={booking} tone="solid" />
          <NoShowBlockReason booking={booking} />
          {/* The countdown while it waits. Once declined the badge says so;
              why is the detail's to say, not a paragraph in the list. */}
          {awaitsVenueAnswer(booking) ? (
            <VenueAnswerNote booking={booking} style={styles.rowAnswer} />
          ) : null}
          <PreOrderSummaryLine booking={booking} now={now} />
          {/* Somebody is asking for this table: answered on the booking itself. */}
          {booking.incomingTableRequest ? (
            <Text numberOfLines={1} style={styles.rowRequest}>
              {t('booking.tableRequest.title')}
            </Text>
          ) : null}
        </View>
        <Ionicons name={actionIcon.chevron} size={iconSize.sm} color={colors.textMuted} />
      </View>
    </Card>
  );
}

/** The booking being cancelled, as the cancel sheet shows it. */
export function BookingSheetSummary({
  booking,
  now,
}: {
  readonly booking: Booking;
  readonly now: Date;
}) {
  const facts = useBookingFacts(booking, now);
  return (
    <>
      <PhotoImage source={facts.photo} style={styles.summaryThumb} />
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.summaryName}>
          {facts.where}
        </Text>
        <Text numberOfLines={2} style={styles.rowLine}>
          {`${facts.day} ${facts.time} · ${facts.guests} · ${facts.table}`}
        </Text>
      </View>
    </>
  );
}

/** The hero's shape, while the list loads. */
export function BookingHeroSkeleton({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  return (
    <Card padded={false} radiusToken="hero" style={[styles.hero, style]}>
      <Skeleton height={HERO_PHOTO_HEIGHT} borderRadius={0} />
      <View style={styles.facts}>
        {[0, 1, 2].map((cell) => (
          <View key={cell} style={styles.fact}>
            <Skeleton width="60%" height={12} />
            <Skeleton width="45%" height={16} />
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        {[0, 1, 2].map((cell) => (
          <Skeleton key={cell} height={44} borderRadius={radius.pill} style={styles.actionCell} />
        ))}
      </View>
    </Card>
  );
}

/** A row's shape, while the list loads. */
export function BookingRowSkeleton({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  return (
    <Card padded={false} style={style}>
      <View style={styles.row}>
        <Skeleton width={BOOKING_THUMB} height={BOOKING_THUMB} borderRadius={radius.tile} />
        <View style={[styles.rowBody, styles.skeletonBody]}>
          <Skeleton width="55%" height={16} />
          <Skeleton width="70%" height={12} />
          <Skeleton width={72} height={18} borderRadius={radius.pill} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { ...shadows.float },
  pressed: { opacity: 0.85 },
  heroPhoto: {
    height: HERO_PHOTO_HEIGHT,
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
  },
  countdown: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    height: 26,
    paddingHorizontal: space.md - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  countdownText: {
    ...typography.caption,
    ...tabularNumbers,
    fontWeight: fontWeight.bold,
    color: colors.onPrimary,
  },
  heroStatus: { position: 'absolute', top: space.md, right: space.md },
  heroName: {
    position: 'absolute',
    left: space.md + 2,
    right: space.md + 2,
    bottom: space.md - 2,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: displayWeight.semibold,
    color: colors.text,
  },
  facts: { flexDirection: 'row', gap: space.md - 2, padding: space.md + 2 },
  answer: { marginHorizontal: space.md + 2, marginTop: -space.xs, marginBottom: space.md },
  request: { marginHorizontal: space.md + 2, marginBottom: space.md },
  rowRequest: { ...typography.caption, color: colors.warningInk },
  blockReason: { ...typography.caption, color: colors.textMuted },
  rowAnswer: { alignSelf: 'flex-start', marginTop: space.xs },
  fact: { flex: 1, gap: 2 },
  factLabel: { ...typography.caption, color: colors.textMuted },
  factValue: {
    ...typography.body,
    ...tabularNumbers,
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  rule: { height: 1.5, marginHorizontal: space.md + 2, overflow: 'hidden' },
  // A box twice the rule's height, clipped to its top edge: iOS draws a
  // dashed border only on all four sides at once.
  ruleDashes: {
    height: 3,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 1,
    borderColor: colors.borderStrong,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.md + 2,
    paddingTop: space.md,
    paddingBottom: space.md + 2,
  },
  footer: { paddingHorizontal: space.md + 2, paddingTop: space.md, paddingBottom: space.md + 2 },
  actionCell: { flex: 1 },
  action: {
    height: 44,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.sm,
    backgroundColor: colors.surfaceMuted,
  },
  actionPressed: { backgroundColor: colors.primarySoft },
  actionDestructive: { backgroundColor: colors.errorSoft },
  actionDestructivePressed: { opacity: 0.8 },
  actionLabel: { fontSize: 13, lineHeight: 16, fontWeight: fontWeight.medium, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md - 2 },
  thumb: { width: BOOKING_THUMB, height: BOOKING_THUMB, borderRadius: radius.tile },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  skeletonBody: { gap: space.xs + 2 },
  rowName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: displayWeight.semibold,
    color: colors.text,
  },
  rowLine: { ...typography.caption, ...tabularNumbers, color: colors.textMuted },
  summaryThumb: { width: SUMMARY_THUMB, height: SUMMARY_THUMB, borderRadius: radius.chip },
  summaryName: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
});
