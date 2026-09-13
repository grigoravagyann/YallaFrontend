import { Ionicons } from '@expo/vector-icons';
import { LOCALES, useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card } from '../src/components/Card';
import { IconButton } from '../src/components/IconButton';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  typography,
} from '../src/theme';

/**
 * Settings — for now, the language.
 *
 * The app boots in the phone's language; this is where a diner overrides it.
 * The choice applies at once, to every screen, and is remembered on the
 * phone (the same override the boot sequence reads). Each language is named
 * in itself — Հայերեն, Русский, English — so a person who cannot read the
 * current one can still find their own.
 */
export default function SettingsScreen() {
  const { t } = useTranslation(['diner', 'common']);
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const [switching, setSwitching] = useState<Locale | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

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
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <IconButton
          icon={actionIcon.back}
          onPress={goBack}
          accessibilityLabel={t('floorPlan.back')}
          variant="ghost"
        />
        <Text display numberOfLines={1} style={styles.title} accessibilityRole="header">
          {t('settings.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
        <Card padded={false} accessibilityLabel={t('settings.language')}>
          {LOCALES.map((code, index) => {
            const selected = code === locale;
            const pending = switching === code;
            return (
              <Pressable
                key={code}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected, busy: pending }}
                accessibilityLabel={t(`language.${code}`, { ns: 'common' })}
                onPress={() => void choose(code)}
                style={({ pressed }) => [
                  styles.row,
                  index < LOCALES.length - 1 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                  {t(`language.${code}`, { ns: 'common' })}
                </Text>
                <View style={[styles.check, selected && styles.checkSelected]}>
                  {selected ? (
                    <Ionicons name="checkmark" size={iconSize.sm} color={colors.onPrimary} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </Card>
        <Text style={styles.hint}>{t('settings.languageHint')}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  title: { ...typography.heading, flex: 1, textAlign: 'center', color: colors.text },
  headerSpacer: { width: layout.touchTarget },
  body: { padding: space.lg, gap: space.sm },
  sectionLabel: {
    ...typography.body,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: space.xs,
  },
  row: {
    minHeight: layout.touchTarget + space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowLabel: { ...typography.bodyLg, color: colors.text },
  rowLabelSelected: { fontWeight: fontWeight.bold, color: colors.primary },
  check: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: space.xs },
});
