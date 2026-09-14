import { isOfflinePaused } from '@yalla/api/react';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { EmptyState } from '../../src/components/EmptyState';
import { QueryErrorState } from '../../src/components/QueryErrorState';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Skeleton } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { useBooking } from '../../src/data/queries';
import { ReminderOptIn } from '../../src/push/ReminderOptIn';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  tabularNumbers,
  typography,
  type IoniconName,
} from '../../src/theme';

export default function SuccessScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const bookingQuery = useBooking(bookingId);
  const { data: booking, isLoading, isError, error, refetch } = bookingQuery;

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
          <View style={styles.body}>
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
  const when = `${formatDate(booking.slotUtc, booking.timeZoneId, locale)} · ${formatTime(
    booking.slotUtc,
    booking.timeZoneId,
    locale,
  )}`;
  // The venue when this phone has read it; the branch always.
  const where = booking.venueName ?? booking.branchName;

  const share = () => {
    void Share.share({
      message: t('success.shareMessage', {
        table: booking.tableLabel,
        venue: where,
        branch: booking.branchName,
        time: when,
        code: booking.code,
      }),
    }).catch(() => undefined);
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      {/* No back: the booking is made, and returning to the confirm screen
          would invite a second attempt. */}
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View style={[styles.mark, pending && styles.markPending]}>
            <Ionicons
              name={pending ? actionIcon.time : 'checkmark'}
              size={iconSize.xl}
              color={colors.onPrimary}
            />
          </View>
          <Text display style={styles.title} accessibilityRole="header">
            {pending ? t('success.pendingTitle') : t('success.confirmedTitle')}
          </Text>
          {pending ? <Text style={styles.pendingBody}>{t('success.pendingBody')}</Text> : null}
        </View>

        {/*
          The one place the notification permission is asked for.
          A booking has just been made and the question answers itself; asked on
          launch it is a prompt nobody understands and therefore declines.
        */}
        <ReminderOptIn />

        {/*
          Large and legible: staff ask for this at the door and it gets read
          aloud over the phone, so it is the one thing on this screen that has
          to survive a noisy room. Pending must never look confirmed — a dashed
          blue edge instead of the solid green.
        */}
        <Card style={[styles.codeCard, pending && styles.codeCardPending]}>
          <Text style={styles.codeLabel}>{t('success.codeLabel')}</Text>
          <Text style={styles.code} accessibilityLabel={booking.code.split('').join(' ')}>
            {booking.code}
          </Text>
          <Text style={styles.codeHint}>{t('success.codeHint')}</Text>
        </Card>

        {/* What the code is actually for once they are standing there. */}
        <Text style={styles.atTable}>{t('success.atTableHint')}</Text>

        <Card>
          <View style={styles.whereRow}>
            <Text numberOfLines={2} style={styles.venue}>
              {where}
            </Text>
            <Badge variant={pending ? 'preparing' : 'confirmed'} tone="soft" size="sm" />
          </View>
          {booking.venueName ? <Text style={styles.detail}>{booking.branchName}</Text> : null}
          <View style={styles.facts}>
            <Fact icon={actionIcon.table} text={t('tables.table', { label: booking.tableLabel })} />
            <Fact icon={actionIcon.calendar} text={when} />
            <Fact
              icon={actionIcon.people}
              text={t('booking.guests', { count: booking.partySize })}
            />
          </View>
          {note ? (
            <View style={styles.noteBlock}>
              <SectionHeader label={t('booking.note.title')} icon={actionIcon.note} />
              <Text style={styles.note}>{note}</Text>
            </View>
          ) : null}
        </Card>

        <Button
          label={t('success.share')}
          variant="secondary"
          icon={actionIcon.share}
          onPress={share}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button
          label={t('success.viewBookings')}
          size="large"
          onPress={() => router.replace('/(tabs)/bookings')}
        />
      </View>
    </Screen>
  );
}

function Fact({ icon, text }: { readonly icon: IoniconName; readonly text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={iconSize.sm} color={colors.primary} />
      <Text numberOfLines={1} style={styles.factText}>
        {text}
      </Text>
    </View>
  );
}

const MARK = 56;

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center' },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xl,
    paddingBottom: space.xl,
    gap: layout.cardGap,
  },
  titleRow: { alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  markPending: { backgroundColor: colors.info },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  pendingBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  codeCard: {
    alignItems: 'center',
    gap: space.xs,
    borderWidth: 2,
    borderColor: colors.success,
  },
  codeCardPending: { borderColor: colors.info, borderStyle: 'dashed' },
  codeLabel: { ...typography.caption, color: colors.textMuted },
  code: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: fontWeight.bold,
    letterSpacing: 6,
    color: colors.text,
    ...tabularNumbers,
  },
  codeHint: { ...typography.caption, color: colors.textMuted },
  atTable: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  venue: { ...typography.h3, color: colors.text, flex: 1 },
  detail: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  facts: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  factText: { ...typography.body, ...tabularNumbers, color: colors.text, flexShrink: 1 },
  noteBlock: {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  note: { ...typography.body, color: colors.text },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
