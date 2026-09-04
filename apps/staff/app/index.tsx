import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { offlineQueue } from '../src/offlineQueue';
import { useEffect, useState } from 'react';

/**
 * Staff placeholder screen.
 *
 * Encodes the three constraints the real screens inherit: touch targets sized
 * for a standing waiter at arm's length, text large enough to read without
 * leaning in, and high contrast for a bright counter.
 */
export default function StaffHomeScreen() {
  const { t } = useTranslation(['staff', 'common']);
  const { locale, setLocale } = useLocale();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    void offlineQueue.size().then(setPendingCount);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{t('shell.title')}</Text>
            <Text style={styles.subtitle}>{t('shell.subtitle')}</Text>
          </View>

          <View style={styles.syncBadge}>
            <Text style={styles.syncText}>
              {pendingCount > 0 ? t('queue.pending') : t('queue.synced')}
            </Text>
          </View>
        </View>

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
    padding: space.xxl,
    gap: space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: fontSize.display,
    lineHeight: lineHeight.display,
    fontWeight: fontWeight.bold,
    color: color.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    color: color.textSecondary,
  },
  syncBadge: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceMuted,
  },
  syncText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: color.textPrimary,
  },
  body: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    color: color.textSecondary,
  },
  languageRow: {
    marginTop: 'auto',
    gap: space.md,
  },
  languageLabel: {
    fontSize: fontSize.md,
    color: color.textSecondary,
  },
  languageButtons: {
    flexDirection: 'row',
    gap: space.md,
  },
  languageButton: {
    // Staff targets are larger than the 44pt platform minimum: this is used
    // standing, at arm's length, often while carrying something.
    minHeight: touchTarget.staff,
    minWidth: 160,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  languageButtonActive: {
    borderColor: color.accentStrong,
    backgroundColor: color.accentMuted,
  },
  languageText: {
    fontSize: fontSize.lg,
    color: color.textPrimary,
  },
  languageTextActive: {
    color: color.accentStrong,
    fontWeight: fontWeight.bold,
  },
});
