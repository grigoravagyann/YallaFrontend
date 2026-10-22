import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fontWeight, radius } from '../../theme';
import { Text } from '../Text';

/** Each language in its own script, short enough for a corner of the welcome. */
const SHORT: Readonly<Record<Locale, string>> = { hy: 'Հայ', ru: 'Рус', en: 'Eng' };

/**
 * The language, chosen before anything else: a small three-way switch for the
 * welcome's corner, so a person who cannot read the current language can still
 * find their own. The same choice as Settings, applied at once and remembered.
 */
export function LanguageSwitch() {
  const { t } = useTranslation('common');
  const { locale, setLocale } = useLocale();
  const [switching, setSwitching] = useState<Locale | null>(null);

  const choose = async (next: Locale) => {
    if (next === locale || switching) return;
    setSwitching(next);
    try {
      await setLocale(next);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <View accessibilityRole="radiogroup" style={styles.track}>
      {LOCALES.map((code) => {
        const selected = code === locale;
        return (
          <Pressable
            key={code}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, busy: switching === code }}
            aria-checked={selected}
            accessibilityLabel={t(`language.${code}`)}
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() => void choose(code)}
            style={[styles.option, selected && styles.selected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{SHORT[code]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    backgroundColor: colors.surface,
  },
  option: {
    minWidth: 32,
    height: 28,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.brand },
  label: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.medium, color: colors.text },
  labelSelected: { color: colors.onPrimary, fontWeight: fontWeight.bold },
});
