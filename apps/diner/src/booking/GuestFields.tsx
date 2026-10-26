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

/** The note that goes to the venue with the booking. */
export function BookingNoteField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const { t } = useTranslation('diner');
  return (
    <View style={styles.field}>
      <SectionHeader
        label={t('booking.note.title')}
        icon={actionIcon.note}
        hint={t('book.optional')}
      />
      <TextInput
        style={[styles.input, styles.requests]}
        value={value}
        onChangeText={onChange}
        placeholder={t('booking.note.placeholder')}
        placeholderTextColor={colors.textSubtle}
        multiline
        maxLength={MAX_BOOKING_NOTE}
        textAlignVertical="top"
        accessibilityLabel={t('booking.note.title')}
      />
      {/* Honest about where the words go: to the venue, with the booking. */}
      <Text style={styles.hint}>{t('booking.note.hint')}</Text>
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
