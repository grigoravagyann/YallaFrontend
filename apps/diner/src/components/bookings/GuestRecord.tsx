import { Ionicons } from '@expo/vector-icons';
import type { GuestRecord } from '@yalla/api';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { deviceTimeZone } from '../../deviceTimeZone';
import { blockedLine, recordCopy } from '../../lib/guestRecord';
import { colors, fontWeight, iconSize, radius, space, typography } from '../../theme';
import { Card } from '../Card';
import { Text } from '../Text';

/**
 * The guest record on the phone (2026-10-20): the guest's own counts, the
 * week's pause on booking after three no-shows in three days, and the one
 * line that says what venues see. Never by colour alone: each says itself in
 * words, beside a glyph.
 */

/**
 * "Your record · last 12 months — You came 11 out of 12 bookings · 1 missed
 * booking", and what venues see of it. A new guest reads as neutral; no
 * record from the server, nothing at all.
 */
export function GuestRecordCard({
  record,
  style,
}: {
  readonly record: GuestRecord | null | undefined;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const copy = recordCopy(record);
  if (!copy) return null;
  return (
    <Card style={[styles.record, style]}>
      <View style={styles.recordHead}>
        <Ionicons name="stats-chart-outline" size={iconSize.sm} color={colors.textMuted} />
        <Text style={styles.recordTitle} accessibilityRole="header">
          {t('bookings.record.title')}
        </Text>
      </View>
      <Text style={styles.recordMain}>{t(copy.main.key, copy.main.params)}</Text>
      {copy.extras.map((line) => (
        <Text key={line.key} style={styles.recordExtra}>
          {t(line.key, line.params)}
        </Text>
      ))}
      <Text style={styles.privacy}>{t('privacy.guestRecord')}</Text>
    </Card>
  );
}

/**
 * At the top of the bookings tab while booking is paused: until when, day
 * and time on the phone's clock, and why — the bookings that had not started
 * were cancelled with it.
 */
export function BookingBlockedBanner({
  untilUtc,
  style,
}: {
  readonly untilUtc: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const zone = deviceTimeZone();
  return (
    <View style={[styles.banner, style]} accessibilityRole="alert">
      <Ionicons name="ban-outline" size={iconSize.md} color={colors.errorInk} />
      <View style={styles.bannerBody}>
        <Text style={styles.bannerTitle}>
          {t('bookings.blocked.title', {
            date: formatDate(untilUtc, zone, locale),
            time: formatTime(untilUtc, zone, locale),
          })}
        </Text>
        <Text style={styles.bannerText}>{t('bookings.blocked.body')}</Text>
      </View>
    </View>
  );
}

/**
 * Where a booking starts — the place's Book, the booking screen, the confirm
 * screen — while booking is paused: the very sentence the server's refusal
 * says, on the phone's clock like the bookings tab's banner. The pause is
 * the guest's, at every venue, so no branch's clock is its own.
 */
export function BookingBlockedNote({
  untilUtc,
  style,
}: {
  readonly untilUtc: string;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const line = blockedLine(untilUtc, deviceTimeZone(), locale);
  return (
    <View style={[styles.note, style]}>
      <Ionicons name="ban-outline" size={iconSize.sm} color={colors.errorInk} />
      <Text style={styles.noteText} accessibilityRole="alert">
        {t(line.key, line.params)}
      </Text>
    </View>
  );
}

/** The one line on what venues see of the guest, near Book and Confirm. */
export function GuestRecordPrivacyLine({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation('diner');
  return (
    <View style={[styles.note, style]}>
      <Ionicons name="eye-outline" size={iconSize.sm} color={colors.textMuted} />
      <Text style={styles.privacyLine}>{t('privacy.guestRecord')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  record: { gap: space.xs },
  recordHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recordTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  recordMain: { ...typography.bodyLg, color: colors.text },
  recordExtra: { ...typography.body, color: colors.textMuted },
  privacy: { ...typography.caption, color: colors.textMuted, marginTop: space.xs },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.errorSoft,
  },
  bannerBody: { flex: 1, gap: space.xs },
  bannerTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  bannerText: { ...typography.body, color: colors.text },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  noteText: { ...typography.body, color: colors.errorInk, flex: 1 },
  privacyLine: { ...typography.caption, color: colors.textMuted, flex: 1 },
});
