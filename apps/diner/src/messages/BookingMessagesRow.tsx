import { Ionicons } from '@expo/vector-icons';
import { YEREVAN, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { actionIcon, colors, fontWeight, iconSize, layout, radius, space } from '../theme';
import { isOwnText, type MessageRow } from './copy';

/**
 * The message row at the foot of a booking's card on the Bookings tab (the
 * Main board, 2026-10-23), opening the booking's thread:
 *
 * - unread: tinted, the cherry bubble glyph, "New message · 18:31", the last
 *   line and the count;
 * - read: the bubble glyph and the last line;
 * - nothing written yet: "Write to the venue · no messages";
 * - closed: "Messages · the conversation is closed".
 */
export function BookingMessagesRow({
  row,
  place,
  timeZoneId,
  onPress,
}: {
  readonly row: MessageRow;
  /** The venue's name, for the row's spoken label. */
  readonly place: string;
  /** The branch's zone: "18:31" on its clock. */
  readonly timeZoneId: string | null | undefined;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const zone = timeZoneId ?? YEREVAN;
  const time = (utc: string | null) => (utc ? formatTime(utc, zone, locale) : null);
  const say = (line: Extract<MessageRow, { kind: 'unread' }>['line']) =>
    line === null
      ? null
      : isOwnText(line)
        ? line.text
        : line.params
          ? t(line.key, line.params)
          : t(line.key);

  if (row.kind === 'unread') {
    const at = time(row.atUtc);
    const line = say(row.line);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[t('messages.row.unreadLabel', { place, count: row.unread }), line]
          .filter(Boolean)
          .join(', ')}
        onPress={onPress}
        style={({ pressed }) => [styles.row, styles.last, styles.unread, pressed && styles.pressed]}
      >
        <View style={styles.glyph} aria-hidden accessibilityElementsHidden>
          <Ionicons name={actionIcon.message} size={iconSize.sm} color={colors.onPrimary} />
        </View>
        <View style={styles.text}>
          <Text numberOfLines={1} style={styles.headline}>
            {at ? t('messages.row.newAt', { time: at }) : t('messages.row.new')}
          </Text>
          {line ? (
            <Text numberOfLines={1} style={styles.line}>
              {line}
            </Text>
          ) : null}
        </View>
        <View style={styles.count} aria-hidden accessibilityElementsHidden>
          <Text style={styles.countText}>{row.unread > 99 ? '99+' : String(row.unread)}</Text>
        </View>
      </Pressable>
    );
  }

  const [label, aside] =
    row.kind === 'write'
      ? [t('messages.row.write'), t('messages.row.none')]
      : row.kind === 'closed'
        ? [t('messages.row.closed'), null]
        : [say(row.line) ?? t('messages.row.open'), time(row.atUtc)];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[t('messages.row.label', { place }), label, aside]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, styles.last, pressed && styles.pressed]}
    >
      <Ionicons
        name={actionIcon.message}
        size={iconSize.sm}
        color={row.kind === 'closed' ? colors.textMuted : colors.logoInk}
      />
      <Text numberOfLines={1} style={[styles.plain, row.kind === 'closed' && styles.muted]}>
        {label}
      </Text>
      {aside ? <Text style={styles.aside}>{aside}</Text> : null}
    </Pressable>
  );
}

const GLYPH = 36;
const COUNT = 22;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    minHeight: layout.touchTarget + 4,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.md - 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  unread: { backgroundColor: colors.unreadTint },
  pressed: { backgroundColor: colors.primarySoft },
  glyph: {
    width: GLYPH,
    height: GLYPH,
    borderRadius: GLYPH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  headline: { fontSize: 13, lineHeight: 17, fontWeight: fontWeight.bold, color: colors.text },
  line: { fontSize: 14, lineHeight: 19, color: colors.text },
  count: {
    minWidth: COUNT,
    height: COUNT,
    paddingHorizontal: 6,
    borderRadius: COUNT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  countText: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.bold, color: colors.onPrimary },
  plain: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 19, color: colors.text },
  muted: { color: colors.textMuted, fontSize: 13 },
  aside: { fontSize: 13, lineHeight: 17, color: colors.textMuted },
  // The row's corners are the card's: it sits at its foot.
  last: { borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card },
});
