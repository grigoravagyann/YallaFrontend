import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { color, fontSize, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export interface PlaceholderScreenProps {
  /** Key in the `diner` namespace, e.g. `explore.title`. */
  readonly titleKey: string;
}

/**
 * Stand-in for every diner screen until the real ones are built.
 *
 * Carries the language switcher so the three-language setup is exercisable from
 * the first build rather than being taken on trust.
 */
export function PlaceholderScreen({ titleKey }: PlaceholderScreenProps) {
  const { t } = useTranslation(['diner', 'common']);
  const { locale, setLocale } = useLocale();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>{t(titleKey)}</Text>
        <Text style={styles.body}>{t('common:placeholder.comingSoon')}</Text>

        <View style={styles.languageRow}>
          <Text style={styles.languageLabel}>{t('common:language.label')}</Text>
          <View style={styles.languageButtons}>
            {LOCALES.map((code: Locale) => {
              const active = code === locale;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t(`common:language.${code}`)}
                  onPress={() => {
                    void setLocale(code);
                  }}
                  style={[styles.languageButton, active && styles.languageButtonActive]}
                >
                  <Text style={[styles.languageText, active && styles.languageTextActive]}>
                    {t(`common:language.${code}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: color.background,
  },
  container: {
    flex: 1,
    padding: space.xl,
    gap: space.md,
  },
  title: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: '700',
    color: color.textPrimary,
  },
  body: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: color.textSecondary,
  },
  languageRow: {
    marginTop: space.xl,
    gap: space.sm,
  },
  languageLabel: {
    fontSize: fontSize.sm,
    color: color.textSecondary,
  },
  languageButtons: {
    flexDirection: 'row',
    gap: space.sm,
  },
  languageButton: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  languageButtonActive: {
    borderColor: color.accentStrong,
    backgroundColor: color.accentMuted,
  },
  languageText: {
    fontSize: fontSize.md,
    color: color.textPrimary,
  },
  languageTextActive: {
    color: color.accentStrong,
    fontWeight: '600',
  },
});
