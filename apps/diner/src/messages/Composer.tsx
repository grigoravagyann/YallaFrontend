import { Ionicons } from '@expo/vector-icons';
import { MESSAGE_MAX_LENGTH, messageViolations } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../components/Text';
import { actionIcon, colors, fontWeight, layout, space } from '../theme';

/** From here on the composer says how many characters are left of the 500. */
const COUNT_FROM = MESSAGE_MAX_LENGTH - 100;

/**
 * The thread's composer (2026-10-23): one field — labelled for a screen
 * reader, "Write to the venue…" as its placeholder, at most 500 characters —
 * and the 48 px cherry Send beside it. Send waits for something to send.
 * Plain text only: nothing is formatted or linkified, here or on the tablet.
 */
export function Composer({
  value,
  onChange,
  onSend,
  place,
  busy,
  bottomInset,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onSend: () => void;
  /** The venue's name, for the field's label. */
  readonly place: string;
  readonly busy: boolean;
  /** The safe area under the field, so it sits above the home indicator. */
  readonly bottomInset: number;
}) {
  const { t } = useTranslation('diner');
  const sendable = messageViolations(value).length === 0 && !busy;
  const length = value.length;

  return (
    <View style={[styles.wrap, { paddingBottom: space.md + bottomInset }]}>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChange}
          maxLength={MESSAGE_MAX_LENGTH}
          multiline
          // The web's textarea starts at two rows: one, like the phone's field.
          {...(Platform.OS === 'web' ? { numberOfLines: 1 } : {})}
          accessibilityLabel={t('messages.composer.label', { place })}
          placeholder={t('messages.composer.placeholder')}
          placeholderTextColor={colors.textSubtle}
          style={styles.input}
          textAlignVertical="center"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('messages.composer.send')}
          accessibilityState={{ disabled: !sendable }}
          disabled={!sendable}
          onPress={onSend}
          style={({ pressed }) => [
            styles.send,
            !sendable && styles.sendDisabled,
            pressed && styles.sendPressed,
          ]}
        >
          <Ionicons name={actionIcon.send} size={20} color={colors.onPrimary} />
        </Pressable>
      </View>
      {length >= COUNT_FROM ? (
        <Text
          style={[styles.count, length >= MESSAGE_MAX_LENGTH && styles.countFull]}
          accessibilityLiveRegion="polite"
        >
          {t('messages.composer.count', { count: length, max: MESSAGE_MAX_LENGTH })}
        </Text>
      ) : null}
    </View>
  );
}

const SEND = layout.controlHeight;

const styles = StyleSheet.create({
  wrap: {
    gap: space.xs,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: layout.controlHeight,
    maxHeight: 132,
    paddingHorizontal: space.lg,
    paddingTop: 13,
    paddingBottom: 13,
    borderRadius: layout.controlHeight / 2,
    borderWidth: 1,
    borderColor: colors.logoInk,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  send: {
    width: SEND,
    height: SEND,
    borderRadius: SEND / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  sendDisabled: { opacity: 0.45 },
  sendPressed: { backgroundColor: colors.brandPressed },
  count: { fontSize: 12, lineHeight: 16, color: colors.textMuted, textAlign: 'right' },
  countFull: { color: colors.errorInk, fontWeight: fontWeight.bold },
});
