import { useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  FROM_START,
  FROM_WELCOME,
  type AuthRouteParams,
} from '../../src/components/auth/PhoneAuthFlow';
import { LanguageSwitch } from '../../src/components/auth/LanguageSwitch';
import { Button } from '../../src/components/Button';
import { IconButton } from '../../src/components/IconButton';
import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import LOGO from '../../assets/images/welcome-logo.png';
import PHOTO from '../../assets/images/welcome-photo.jpg';
import { actionIcon, colors, layout, space, typography } from '../../src/theme';

/** The Time to Eat logo (mark and wordmark), trimmed to its ink: 1082 × 727. */
const LOGO_RATIO = 1082 / 727;
const LOGO_HEIGHT = 68;
/** The café photo: 776 × 555, with the corners the cards use. */
const PHOTO_RATIO = 776 / 555;
const PHOTO_RADIUS = 20;
/** At most this share of the screen's height, so the buttons stay in view. */
const PHOTO_MAX_SHARE = 0.34;

/**
 * Welcome — the fork between logging in and creating an account.
 *
 * Reached from the profile and the bookings tab, never from inside a booking
 * (that goes straight to log in with the table in hand), so no booking is
 * carried through here — only `from`, so the flow that follows knows to
 * leave this screen too when it finishes. "Continue as guest" is simply going
 * back: the app stays browsable without an account.
 *
 * It is also the app's first screen for a diner who is not signed in
 * (`from=start`, see the tabs layout): there an account comes first — no way
 * back and no guest door; signing in or up leads on to the app itself.
 */
export default function WelcomeScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const atStart = from === FROM_START;
  // Sized from the window, not a percentage: inside a scroll view on iOS a
  // `100%` image took its own pixel size and ran off the screen. Capped so the
  // whole welcome fits on one screen without scrolling.
  const window = useWindowDimensions();
  const photoWidth = window.width - 2 * layout.screenPadding;
  const photoHeight = Math.min(photoWidth / PHOTO_RATIO, window.height * PHOTO_MAX_SHARE);
  const carried: AuthRouteParams = { from: atStart ? FROM_START : FROM_WELCOME };

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        {/* The app's first screen has no way back and no guest door: an account comes first. */}
        {atStart ? null : (
          <IconButton
            icon={actionIcon.back}
            accessibilityLabel={t('floorPlan.back')}
            variant="surface"
            onPress={leave}
            style={styles.back}
          />
        )}
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="Time to Eat"
        />
        {/* The language comes before everything else, in the corner where people look for it. */}
        <View style={styles.language}>
          <LanguageSwitch />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Image
          source={PHOTO}
          style={[styles.photo, { width: photoWidth, height: photoHeight }]}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View style={styles.copy}>
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
          {atStart ? null : (
            <Button label={t('auth.continueAsGuest')} variant="text" onPress={leave} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    minHeight: LOGO_HEIGHT + space.sm,
  },
  back: { position: 'absolute', left: layout.screenPadding, top: space.sm },
  language: { position: 'absolute', right: layout.screenPadding, top: space.sm + 2 },
  logo: { height: LOGO_HEIGHT, aspectRatio: LOGO_RATIO },
  body: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xxxl,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  photo: { borderRadius: PHOTO_RADIUS },
  copy: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  title: { ...typography.title, color: colors.text, textAlign: 'center' },
  blurb: {
    ...typography.bodyLg,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: layout.readableWidth,
  },
  actions: { gap: space.md, marginTop: 'auto' },
});
