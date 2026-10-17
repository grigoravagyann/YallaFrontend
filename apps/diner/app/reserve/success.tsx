import { Ionicons } from '@expo/vector-icons';
import { isOfflinePaused } from '@yalla/api/react';
import { formatDayAndTime, formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Animated, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { EmptyState } from '../../src/components/EmptyState';
import { IconButton } from '../../src/components/IconButton';
import { Rise } from '../../src/components/motion/Rise';
import { SuccessMark } from '../../src/components/motion/SuccessMark';
import { usePressScale } from '../../src/components/motion/usePressScale';
import { PhotoImage } from '../../src/components/PhotoImage';
import { bookingShareLine, tableWithRoom } from '../../src/components/bookings/bookingText';
import { directionsUrl } from '../../src/components/place/PlaceActions';
import { QueryErrorState } from '../../src/components/QueryErrorState';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { useBooking } from '../../src/data/queries';
import { usePlace } from '../../src/places/hooks';
import { ReminderOptIn } from '../../src/push/ReminderOptIn';
import {
  actionIcon,
  colors,
  displayWeight,
  fontWeight,
  iconSize,
  layout,
  radius,
  shadows,
  space,
  tabularNumbers,
  typography,
  type IoniconName,
} from '../../src/theme';

/**
 * The booking, made.
 *
 * The mark and the title say which it is — booked, or a request the venue has
 * still to confirm — and the card under them is what the diner needs at the
 * door: where, when, how many, which table, and the code staff ask for. No
 * haptic here: it fired on the confirm press that brought the diner here.
 */
export default function SuccessScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const bookingQuery = useBooking(bookingId);
  const { data: booking, isLoading, isError, error, refetch } = bookingQuery;
  // The place's photo, address and location, when this phone can read them.
  const { data: place } = usePlace(booking?.branchId);
  const [copied, setCopied] = useState(false);

  /*
   * Every state said, never a spinner that waits for ever.
   *
   * The booking arrives in the cache with the confirmation, so this is normally
   * instant. Opened any other way — a restored screen, a stale id — it reads
   * the diner's own bookings, and a booking that is not among them is "not
   * found", not an endless load.
   */
  if (!booking) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        {isOfflinePaused(bookingQuery) ? (
          <QueryErrorState offline onRetry={() => void refetch()} style={styles.centered} />
        ) : isLoading ? (
          <View style={styles.loading}>
            <Skeleton width="60%" height={34} />
            <Skeleton height={148} borderRadius={radius.card} />
            <Skeleton width="80%" height={14} />
          </View>
        ) : isError ? (
          <QueryErrorState error={error} onRetry={() => void refetch()} style={styles.centered} />
        ) : (
          <EmptyState
            icon={actionIcon.error}
            title={t('booking.notFound.title')}
            body={t('booking.notFound.body')}
            action={{
              label: t('success.viewBookings'),
              onPress: () => router.replace('/(tabs)/bookings'),
            }}
            style={styles.centered}
          />
        )}
      </Screen>
    );
  }

  const pending = booking.status === 'pendingApproval';
  // The note as the venue received it (K9), not a copy kept on this phone.
  const note = booking.note;
  const slot = formatDayAndTime(booking.slotUtc, booking.timeZoneId, locale);
  const day =
    slot.day === 'today'
      ? t('booking.today')
      : slot.day === 'tomorrow'
        ? t('booking.tomorrow')
        : slot.date;
  // The venue when this phone has read it; the branch always.
  const where = booking.venueName ?? booking.branchName;
  const address = place?.address.trim() || booking.branchName;
  const coords = place?.coords ?? null;

  const share = () => {
    const line = bookingShareLine(
      booking,
      where,
      `${formatDate(booking.slotUtc, booking.timeZoneId, locale)} · ${formatTime(
        booking.slotUtc,
        booking.timeZoneId,
        locale,
      )}`,
    );
    void Share.share({ message: t(line.key, line.params) }).catch(() => undefined);
  };

  const copy = () => {
    void Clipboard.setStringAsync(booking.code)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* No back: the booking is made, and returning to the confirm screen
          would invite a second attempt. The cross goes home. */}
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <IconButton
            icon={actionIcon.close}
            onPress={() => router.replace('/')}
            accessibilityLabel={t('common:action.close')}
          />
        </View>

        {/* Pending must never look confirmed: the blue clock, not the green check. */}
        <SuccessMark tone={pending ? 'pending' : 'success'} style={styles.mark} />
        <Rise delay={120}>
          <Text display style={styles.title} accessibilityRole="header">
            {pending ? t('success.pendingTitle') : t('success.confirmedTitle')}
          </Text>
        </Rise>
        <Rise delay={180}>
          <Text style={styles.subtitle}>
            {pending ? t('success.pendingBody') : t('success.expecting')}
          </Text>
        </Rise>

        <Rise delay={240} style={styles.stretch}>
          <View style={styles.card}>
            <PhotoImage source={place?.photos[0]} gradient={0.85} style={styles.photo}>
              <Text display numberOfLines={1} style={styles.venue}>
                {where}
              </Text>
            </PhotoImage>

            <View style={styles.grid}>
              <Fact label={t('success.when')} value={`${day}, ${slot.time}`} />
              <Fact
                label={t('booking.partySize')}
                value={t('booking.guests', { count: booking.partySize })}
              />
              {/* "4 · Hall": the room, when the server named one. */}
              <Fact label={t('success.table')} value={tableWithRoom(booking)} />
              <Fact label={t('success.address')} value={address} />
            </View>

            {note ? (
              <View style={styles.noteBlock}>
                <Text style={styles.factLabel}>{t('booking.note.title')}</Text>
                <Text style={styles.note}>{note}</Text>
              </View>
            ) : null}

            <Dashed />

            {/*
              Large and legible: staff ask for this at the door and it gets read
              aloud over the phone, so it is the one thing on this card that has
              to survive a noisy room.
            */}
            <View style={styles.codeRow}>
              <View style={styles.codeText}>
                <Text style={styles.factLabel}>{t('success.codeLabel')}</Text>
                <Text style={styles.code} accessibilityLabel={booking.code.split('').join(' ')}>
                  {booking.code}
                </Text>
              </View>
              <Button
                label={copied ? t('success.copied') : t('success.copy')}
                icon={copied ? 'checkmark' : 'copy-outline'}
                variant="outline"
                size="small"
                fullWidth={false}
                onPress={copy}
              />
            </View>
          </View>
        </Rise>

        <Rise delay={300} style={[styles.stretch, styles.tiles]}>
          {coords ? (
            <Tile
              icon={actionIcon.directions}
              label={t('place.action.directions')}
              onPress={() =>
                void Linking.openURL(directionsUrl(coords, where)).catch(() => undefined)
              }
            />
          ) : null}
          <Tile icon={actionIcon.share} label={t('success.share')} onPress={share} />
        </Rise>

        {/* What the code is actually for once they are standing there. */}
        <Rise delay={340}>
          <Text style={styles.hint}>{t('success.atTableHint')}</Text>
        </Rise>

        {/*
          The one place the notification permission is asked for.
          A booking has just been made and the question answers itself; asked on
          launch it is a prompt nobody understands and therefore declines.
        */}
        <View style={styles.stretch}>
          <ReminderOptIn startUtc={booking.slotUtc} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>
        <Button
          label={t('success.viewBookings')}
          size="large"
          onPress={() => router.replace('/(tabs)/bookings')}
        />
        <Button label={t('booking.done')} variant="text" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.factValue}>
        {value}
      </Text>
    </View>
  );
}

/** A glass tile: the glyph over a short label. */
function Tile({
  icon,
  label,
  onPress,
}: {
  readonly icon: IoniconName;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const press = usePressScale();
  return (
    <Animated.View style={[styles.tileWrap, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      >
        <Ionicons name={icon} size={iconSize.md} color={colors.text} />
        <Text numberOfLines={1} style={styles.tileLabel}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * A ticket's dashed tear line. A dashed border on one side alone does not draw
 * on iOS, so a dashed box is clipped down to its top edge.
 */
function Dashed() {
  return (
    <View style={styles.dashedClip}>
      <View style={styles.dashed} />
    </View>
  );
}

const PHOTO_HEIGHT = 96;

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center' },
  loading: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xl,
    gap: layout.cardGap,
  },
  body: {
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  topRow: { alignSelf: 'stretch', flexDirection: 'row' },
  stretch: { alignSelf: 'stretch' },
  mark: { marginTop: space.xs + 2 },
  title: {
    marginTop: space.lg + 2,
    fontSize: 25,
    lineHeight: 32,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: space.xs + 2,
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },

  card: {
    marginTop: space.xl - 2,
    borderRadius: radius.hero,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photo: { height: PHOTO_HEIGHT, justifyContent: 'flex-end' },
  venue: {
    position: 'absolute',
    left: space.md + 2,
    right: space.md + 2,
    bottom: space.sm + 2,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: displayWeight.semibold,
    color: colors.onImage,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.md + 2,
    paddingVertical: space.lg,
    paddingHorizontal: space.md + 2,
  },
  fact: { width: '50%', gap: 2, paddingRight: space.sm },
  factLabel: { ...typography.caption, color: colors.textMuted },
  factValue: {
    ...typography.bodyLg,
    lineHeight: 20,
    fontWeight: fontWeight.bold,
    color: colors.text,
    ...tabularNumbers,
  },
  noteBlock: { gap: 2, paddingHorizontal: space.md + 2, paddingBottom: space.lg },
  note: { ...typography.body, color: colors.text },
  dashedClip: { height: 1.5, marginHorizontal: space.md + 2, overflow: 'hidden' },
  dashed: {
    height: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: 1,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingVertical: space.md,
    paddingLeft: space.md + 2,
    paddingRight: space.sm,
  },
  codeText: { flex: 1, minWidth: 0 },
  code: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: fontWeight.bold,
    letterSpacing: 3,
    color: colors.text,
    ...tabularNumbers,
  },

  tiles: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  tileWrap: { flex: 1 },
  tile: {
    height: 60,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  tilePressed: { backgroundColor: colors.surfaceMuted },
  tileLabel: { ...typography.caption, color: colors.text },

  hint: {
    marginTop: space.md + 2,
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },

  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: space.xs,
  },
});
