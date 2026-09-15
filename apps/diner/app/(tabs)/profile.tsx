import { useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { DeleteAccountSheet } from '../../src/auth/DeleteAccountSheet';
import { authSession } from '../../src/auth/session';
import { signOut } from '../../src/auth/signOut';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { IconButton } from '../../src/components/IconButton';
import { PhotoImage } from '../../src/components/PhotoImage';
import { ProfileRow } from '../../src/components/profile/ProfileRow';
import { Screen, useNavClearance } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { useDinerProfile } from '../../src/data/accountQueries';
import { useNotificationCount } from '../../src/hooks/useNotificationCount';
import { initialsOf } from '../../src/lib/initials';
import { useSession } from '../../src/stores/session';
import { actionIcon, colors, layout, navIcons, radius, space, typography } from '../../src/theme';

const AVATAR = 64;

/**
 * Profile — who the diner is to the app, and the list of everything that is
 * theirs. No dashboard, no stats.
 *
 * Signed in, it is the account as `/me` describes it: the photo (or
 * initials), name, @username, email and phone, with a way to confirm a number
 * that has not been. A guest sees the same list, with a way in.
 *
 * Every row opens something. A row with nowhere to go is not drawn.
 */
export default function ProfileScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const queryClient = useQueryClient();
  const paddingBottom = useNavClearance();
  const signedIn = useSession((s) => s.signedIn);
  const guestName = useSession((s) => s.guestName);
  const phoneE164 = useSession((s) => s.phoneE164);
  const email = useSession((s) => s.email);
  const profile = useSession((s) => s.profile);
  const unread = useNotificationCount();
  useDinerProfile();

  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const openSettings = () => router.push('/settings');

  const logOut = async () => {
    setSigningOut(true);
    try {
      await signOut(queryClient, authSession);
    } finally {
      setSigningOut(false);
    }
  };

  // The server has already ended every session this account had. Signed out
  // here at once — before any query can hear the revoked session and report
  // it as something that happened *to* the diner.
  const onDeleted = () => {
    setDeleting(false);
    setDeleted(true);
    useSession.getState().clear();
    void signOut(queryClient, authSession);
  };

  const name = signedIn ? (profile?.displayName ?? guestName) : null;
  const photoUrl = signedIn ? profile?.photo?.thumbnailUrl : undefined;
  const lines = signedIn
    ? [
        profile?.username ? `@${profile.username}` : null,
        profile?.email ?? email,
        profile?.phoneE164 ?? phoneE164,
      ].filter((line): line is string => Boolean(line))
    : [];

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

        {deleted && !signedIn ? (
          <Card>
            <Text style={styles.contact} accessibilityRole="alert">
              {t('profile.deleteAccount.done')}
            </Text>
          </Card>
        ) : null}

        <View style={styles.identity}>
          {photoUrl ? (
            <PhotoImage source={photoUrl} style={styles.avatar} />
          ) : (
            <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
              <Text display style={styles.initials}>
                {initialsOf(name)}
              </Text>
            </View>
          )}
          <View style={styles.identityBody}>
            <Text numberOfLines={1} style={styles.name}>
              {name ?? t('profile.guest')}
            </Text>
            {lines.map((line) => (
              <Text key={line} numberOfLines={1} style={styles.contact}>
                {line}
              </Text>
            ))}
            {signedIn && profile && !profile.phoneVerified ? (
              <View style={styles.verifyRow}>
                <Text style={styles.unverified}>{t('profile.notVerified')} ·</Text>
                <Button
                  label={t('profile.verify')}
                  variant="text"
                  fullWidth={false}
                  onPress={() => router.push('/auth/code')}
                  style={styles.verifyButton}
                />
              </View>
            ) : null}
          </View>
        </View>

        {/* A password cleared by an anonymous code verification: the account
            still logs in by code, so this offers rather than pushes. */}
        {signedIn && profile?.username && !profile.hasPassword ? (
          <Card style={styles.prompt}>
            <Text style={styles.contact}>{t('profile.setPasswordPrompt')}</Text>
            <Button
              label={t('profile.setPasswordAction')}
              variant="outline"
              fullWidth={false}
              onPress={() => router.push('/profile/edit')}
            />
          </Card>
        ) : null}

        {signedIn ? (
          <Button
            label={t('profile.editProfile')}
            variant="secondary"
            icon={actionIcon.note}
            onPress={() => router.push('/profile/edit')}
          />
        ) : (
          <View style={styles.guestActions}>
            <Button label={t('profile.logIn')} onPress={() => router.push('/auth/login')} />
            <Button
              label={t('profile.createAccount')}
              variant="outline"
              onPress={() => router.push('/auth/signup')}
            />
          </View>
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
            onPress={() => router.push('/notifications')}
          />
          <ProfileRow
            icon="help-circle-outline"
            label={t('profile.help')}
            onPress={() => router.push('/help')}
          />
          <ProfileRow
            icon="information-circle-outline"
            label={t('profile.about')}
            onPress={() => router.push('/about')}
          />
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

        {signedIn && profile ? (
          <Card padded={false}>
            <ProfileRow
              icon="trash-outline"
              label={t('profile.deleteAccount.row')}
              onPress={() => setDeleting(true)}
              divider={false}
            />
          </Card>
        ) : null}
      </ScrollView>

      {profile ? (
        <DeleteAccountSheet
          visible={deleting && signedIn}
          profile={profile}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      ) : null}
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
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  unverified: { ...typography.body, color: colors.warningInk },
  verifyButton: { paddingHorizontal: space.xs },
  guestActions: { gap: space.sm },
  prompt: { gap: space.sm },
});
