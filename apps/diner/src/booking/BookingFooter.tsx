import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { BookCta, CtaFooter } from '../components/place/BookCta';
import { colors, fontWeight, space, typography } from '../theme';

export interface BookingFooterProps {
  readonly bottomInset: number;
  /** The app cannot book here: no button, and why. */
  readonly bookingsOff: boolean;
  /** The button's words. */
  readonly label: string;
  /** "Table 4 · Tomorrow 19:00 · 2 guests", when a time is chosen. */
  readonly summary: string | undefined;
  readonly accessibilityLabel: string;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly onPress: () => void;
}

/** Book (or Save changes) at the foot of the screen — or why the app cannot book here. */
export function BookingFooter({
  bottomInset,
  bookingsOff,
  label,
  summary,
  accessibilityLabel,
  disabled,
  busy,
  onPress,
}: BookingFooterProps) {
  const { t } = useTranslation('diner');
  return (
    <CtaFooter bottomInset={bottomInset}>
      {bookingsOff ? (
        // Where the app cannot book, the button is not offered at all; the
        // same words the place page shows say why.
        <View style={styles.bookingsOff} accessibilityRole="summary">
          <Text style={styles.bookingsOffTitle}>{t('place.bookingsOff.title')}</Text>
          <Text style={styles.bookingsOffBody}>{t('place.bookingsOff.body')}</Text>
        </View>
      ) : (
        <BookCta
          label={label}
          {...(summary ? { caption: summary } : {})}
          // The action first (what e2e and a screen reader key on), then
          // the summary the caption shows, so it is heard as well as seen.
          accessibilityLabel={accessibilityLabel}
          disabled={disabled}
          busy={busy}
          onPress={onPress}
        />
      )}
    </CtaFooter>
  );
}

const styles = StyleSheet.create({
  bookingsOff: { gap: space.xs, paddingVertical: space.xs },
  bookingsOffTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  bookingsOffBody: { ...typography.body, color: colors.textMuted },
});
