import { branchDayKey, formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import type { Place, PlaceRoom } from '../../places/model';
import { colors, radius, space, typography } from '../../theme';
import { PhotoImage } from '../PhotoImage';
import { Text } from '../Text';

const PHOTO = 56;
const DAY_MS = 86_400_000;

/*
 * The place screens' own cache entries — `placeKeys.detail` and
 * `placeKeys.rooms` in `places/hooks` — read where they lie rather than through
 * those hooks: the hooks bring the places repository with them, and with it the
 * device's location and the app's gateway, which a sign-in screen has no use
 * for. A key that ever drifts from these costs the photo and the table label,
 * nothing more: the card falls back to what it still knows, or is left out.
 */
const placeDetailKey = (branchId: string) => ['places', 'detail', branchId] as const;
const placeRoomsKey = (branchId: string) => ['places', 'rooms', branchId] as const;

export interface BookingSummaryProps {
  /** The booking being made, as `bookingParams` carries it through sign-in. */
  readonly booking: Readonly<Record<string, string>>;
}

/**
 * The table the diner was booking when they were asked to sign in: the place's
 * photo and name, the day, the time, the party and the table.
 *
 * Only what this phone already read on the way here — the place and its rooms,
 * as the booking screen left them — so it costs no request and invents nothing.
 * Opened any other way (a deep link, a cold start), there is nothing to show
 * and the card is not drawn.
 */
export function BookingSummary({ booking }: BookingSummaryProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const { branchId, tableId, slotUtc, partySize } = booking;
  // A booking by time only has no table, and says so.
  const byTime = booking['byTime'] === '1';
  if (!branchId || (!tableId && !byTime)) return null;

  const place =
    queryClient
      .getQueriesData<Place | null>({ queryKey: placeDetailKey(branchId) })
      .map(([, data]) => data)
      .find((data): data is Place => Boolean(data)) ?? null;
  if (!place) return null;

  const rooms = queryClient.getQueryData<readonly PlaceRoom[]>(placeRoomsKey(branchId)) ?? [];
  const tableLabel =
    [...rooms, ...place.rooms]
      .flatMap((room) => room.photos)
      .flatMap((photo) => photo.tables)
      .find((table) => table.tableId === tableId)?.label ?? null;

  const slot = slotUtc ? new Date(slotUtc) : null;
  const zone = place.timeZoneId;
  let when: string | null = null;
  if (slot && !Number.isNaN(slot.getTime())) {
    const day = relativeDay(slot, zone);
    const dayText =
      day === 'today'
        ? t('booking.today')
        : day === 'tomorrow'
          ? t('booking.tomorrow')
          : formatDate(slot, zone, locale);
    when = `${dayText} ${formatTime(slot, zone, locale)}`;
  }
  const size = Number(partySize);
  const party = Number.isInteger(size) && size > 0 ? t('booking.guests', { count: size }) : null;
  const table = tableLabel ? t('tables.table', { label: tableLabel }) : null;
  const line = [when, party, table].filter(Boolean).join(' · ');

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={line ? `${place.name}, ${line}` : place.name}
    >
      <PhotoImage source={place.photos[0]} style={styles.photo} />
      <View style={styles.text}>
        <Text display style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>
        {line ? (
          <Text style={styles.line} numberOfLines={2}>
            {line}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Today, tomorrow or another day — in the branch's own days, never the phone's. */
function relativeDay(slot: Date, zone: string): 'today' | 'tomorrow' | 'other' {
  const now = new Date();
  const day = branchDayKey(slot, zone);
  if (day === branchDayKey(now, zone)) return 'today';
  if (day === branchDayKey(new Date(now.getTime() + DAY_MS), zone)) return 'tomorrow';
  return 'other';
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm + 2,
    borderRadius: radius.card + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  photo: { width: PHOTO, height: PHOTO, borderRadius: radius.tile },
  text: { flex: 1, minWidth: 0, gap: space.xs - 1 },
  name: { ...typography.bodyLg, color: colors.text },
  line: { ...typography.caption, color: colors.textMuted },
});
