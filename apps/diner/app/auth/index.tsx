import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@yalla/i18n';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FROM_WELCOME, type AuthRouteParams } from '../../src/components/auth/PhoneAuthFlow';
import { Button } from '../../src/components/Button';
import { IconButton } from '../../src/components/IconButton';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { actionIcon, colors, iconSize, layout, radius, space, typography } from '../../src/theme';

/**
 * Welcome — the fork between logging in and creating an account.
 *
 * Reached from the profile and the bookings tab, never from inside a booking
 * (that goes straight to log in with the table in hand), so no booking is
 * carried through here — only `from`, so the flow that follows knows to
 * leave this screen too when it finishes. "Continue as guest" is simply going
 * back: the app stays browsable without an account.
 */
export default function WelcomeScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const carried: AuthRouteParams = { from: FROM_WELCOME };

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <IconButton
          icon={actionIcon.back}
          accessibilityLabel={t('floorPlan.back')}
          variant="ghost"
          onPress={leave}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.hero}>
          <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no">
            <Ionicons
              name={actionIcon.brandMark}
              size={iconSize.xl + space.sm}
              color={colors.primary}
            />
          </View>
          <Text display style={styles.title} accessibilityRole="header">
            {t('auth.welcome.title')}
          </Text>
          <Text style={styles.blurb}>{t('auth.welcome.body')}</Text>
        </View>

        <View style={styles.actions}>
          <Button
            label={t('auth.logIn')}
            size="large"
            onPress={() => router.push({ pathname: '/auth/login', params: carried })}
          />
          <Button
            label={t('auth.createAccount')}
            variant="outline"
            size="large"
            onPress={() => router.push({ pathname: '/auth/signup', params: carried })}
          />
          <Button label={t('auth.continueAsGuest')} variant="text" onPress={leave} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  body: {
    flex: 1,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xl,
    justifyContent: 'space-between',
  },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.md },
  mark: {
    width: layout.welcomeMark,
    height: layout.welcomeMark,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  blurb: {
    ...typography.bodyLg,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: layout.readableWidth,
  },
  actions: { gap: space.md },
});
