import { useTranslation } from '@yalla/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { authSession } from '../../src/auth/session';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { IconButton } from '../../src/components/IconButton';
import { ProfileRow } from '../../src/components/profile/ProfileRow';
import { Screen, useNavClearance } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { useNotificationCount } from '../../src/hooks/useNotificationCount';
import { useSession } from '../../src/stores/session';
import { actionIcon, colors, layout, navIcons, radius, space, typography } from '../../src/theme';

const AVATAR = 64;
/** "Lara Avagyan" → "LA"; a single name gives one letter; nothing gives "?". */
function initialsOf(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('');
  return letters || '?';
}

/**
 * Profile — who the diner is to the app, and the list of everything that is
 * theirs. No dashboard, no stats.
 *
 * Signed-in here means a phone number confirmed by SMS; there is no other
 * account. A guest sees the same list with a way to confirm their number.
 */
export default function ProfileScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const paddingBottom = useNavClearance();
  const signedIn = useSession((s) => s.signedIn);
  const guestName = useSession((s) => s.guestName);
  const phoneE164 = useSession((s) => s.phoneE164);
  const unread = useNotificationCount();

  const [signingOut, setSigningOut] = useState(false);
  const openSettings = () => router.push('/settings');

  // The token session forgets the refresh token (and tells the server, when it
  // can reach it); the store then drops `signedIn`. The remembered number and
  // name stay as prefill for the next verification, as the store intends.
  const logOut = async () => {
    setSigningOut(true);
    try {
      await authSession.signOut();
    } finally {
      useSession.getState().clear();
      setSigningOut(false);
    }
  };

  const displayName = guestName ?? t('profile.guest');
  const contact = signedIn ? phoneE164 : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom }]}>
        <View style={styles.titleRow}>
          <Text display style={styles.title} accessibilityRole="header">
            {t('profile.title')}
          </Text>
          <IconButton
            icon={actionIcon.settings}
            onPress={openSettings}
            accessibilityLabel={t('profile.settings')}
            shape="square"
          />
        </View>

        <View style={styles.identity}>
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
            <Text display style={styles.initials}>
              {initialsOf(signedIn ? guestName : null)}
            </Text>
          </View>
          <View style={styles.identityBody}>
            <Text numberOfLines={1} style={styles.name}>
              {signedIn ? displayName : t('profile.guest')}
            </Text>
            {contact ? (
              <Text numberOfLines={1} style={styles.contact}>
                {contact}
              </Text>
            ) : null}
          </View>
        </View>

        {signedIn ? null : (
          <Button
            label={t('profile.signIn')}
            variant="outline"
            onPress={() => router.push('/verify')}
          />
        )}

        <Card padded={false}>
          <ProfileRow
            icon={navIcons.bookings.outline}
            label={t('profile.myBookings')}
            onPress={() => router.push('/(tabs)/bookings')}
          />
          <ProfileRow
            icon={navIcons.orders.outline}
            label={t('profile.myOrders')}
            onPress={() => router.push('/(tabs)/orders')}
          />
          <ProfileRow
            icon={actionIcon.favorite}
            label={t('profile.favorites')}
            onPress={() => router.push('/favorites')}
          />
          <ProfileRow
            icon="notifications-outline"
            label={t('profile.notifications')}
            badgeCount={unread}
          />
          {/* Help and About have no screen yet: drawn as plain rows (no
              chevron, no press) rather than buttons that go nowhere. */}
          <ProfileRow icon="help-circle-outline" label={t('profile.help')} />
          <ProfileRow icon="information-circle-outline" label={t('profile.about')} />
          <ProfileRow
            icon={actionIcon.settings}
            label={t('profile.settings')}
            onPress={openSettings}
            divider={false}
          />
        </Card>

        {signedIn ? (
          <Button
            label={t('profile.logOut')}
            variant="outline"
            icon="log-out-outline"
            disabled={signingOut}
            onPress={() => void logOut()}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.lg,
    gap: space.xl,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.title, color: colors.text },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { ...typography.heading, color: colors.primary },
  identityBody: { flex: 1, gap: 2 },
  name: { ...typography.h3, color: colors.text },
  contact: { ...typography.body, color: colors.textMuted },
});
