import { MAX_BOOKING_NOTE } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View } from 'react-native';
import { SectionHeader } from '../components/SectionHeader';
import { Text, TextInput } from '../components/Text';
import { GUEST_NAME_MAX_LENGTH } from '../lib/confirm';
import { actionIcon, colors, layout, radius, space, typography } from '../theme';

/** The name, asked once when the session does not remember one. */
export function GuestNameField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useTranslation('diner');
  return (
    <View style={styles.field}>
      <SectionHeader label={t('confirm.nameLabel')} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={t('confirm.namePlaceholder')}
        placeholderTextColor={colors.textSubtle}
        maxLength={GUEST_NAME_MAX_LENGTH}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        accessibilityLabel={t('confirm.nameLabel')}
      />
    </View>
  );
}

/**
 * The note that goes to the venue with the booking. By time only it is the
 * diner's wish for the table — by the window, the smoking room — which the
 * venue reads when it chooses one on arrival.
 */
export function BookingNoteField({
  value,
  onChange,
  byTime = false,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly byTime?: boolean;
}) {
  const { t } = useTranslation('diner');
  const title = t(byTime ? 'book.byTime.wishTitle' : 'booking.note.title');
  return (
    <View style={styles.field}>
      <SectionHeader label={title} icon={actionIcon.note} hint={t('book.optional')} />
      <TextInput
        style={[styles.input, styles.requests]}
        value={value}
        onChangeText={onChange}
        placeholder={t(byTime ? 'book.byTime.wishPlaceholder' : 'booking.note.placeholder')}
        placeholderTextColor={colors.textSubtle}
        multiline
        maxLength={MAX_BOOKING_NOTE}
        textAlignVertical="top"
        accessibilityLabel={title}
      />
      {/* Honest about where the words go: to the venue, with the booking. */}
      <Text style={styles.hint}>{t(byTime ? 'book.byTime.wishHint' : 'booking.note.hint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.sm },
  input: {
    minHeight: layout.controlHeight,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    ...typography.body,
  },
  requests: { minHeight: 96 },
  hint: { ...typography.caption, color: colors.textMuted },
});
