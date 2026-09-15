import { useTranslation } from '@yalla/i18n';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Card } from '../src/components/Card';
import { IconButton } from '../src/components/IconButton';
import { ProfileRow } from '../src/components/profile/ProfileRow';
import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { appVersionFrom, legalLinks } from '../src/data/appInfo';
import { actionIcon, colors, fontWeight, layout, space, typography } from '../src/theme';

function open(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

/**
 * About: which build this is, where the policies live when there are any, and
 * the open-source note.
 *
 * The version and build come from `expo-constants`, so a bug report can name
 * the build it came from. "Terms" and "Privacy" are listed only for the URLs
 * configured in `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL`.
 */
export default function AboutScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { version, build } = appVersionFrom(Constants, Platform.OS);
  const links = legalLinks();
  const appName = Constants.expoConfig?.name ?? 'Yalla';

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
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
          {t('about.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.identity}>
          <Text display style={styles.appName}>
            {appName}
          </Text>
          {version ? (
            <Text style={styles.version}>
              {build
                ? t('about.version', { version, build })
                : t('about.versionNoBuild', { version })}
            </Text>
          ) : null}
        </View>

        {links.terms || links.privacy ? (
          <Card padded={false}>
            {links.terms ? (
              <ProfileRow
                icon="document-text-outline"
                label={t('about.terms')}
                onPress={() => open(links.terms!)}
                divider={Boolean(links.privacy)}
              />
            ) : null}
            {links.privacy ? (
              <ProfileRow
                icon="shield-checkmark-outline"
                label={t('about.privacy')}
                onPress={() => open(links.privacy!)}
                divider={false}
              />
            ) : null}
          </Card>
        ) : null}

        <Card style={styles.licences}>
          <Text style={styles.licencesTitle} accessibilityRole="header">
            {t('about.licences')}
          </Text>
          <Text style={styles.licencesBody}>{t('about.licencesBody')}</Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  title: { ...typography.heading, color: colors.text, flex: 1, textAlign: 'center' },
  headerSpacer: { width: layout.touchTarget },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  identity: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  appName: { ...typography.title, color: colors.text },
  version: { ...typography.body, color: colors.textMuted },
  licences: { gap: space.sm },
  licencesTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  licencesBody: { ...typography.body, color: colors.textMuted },
});
