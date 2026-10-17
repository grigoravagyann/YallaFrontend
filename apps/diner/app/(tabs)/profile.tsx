import { useLocale, useTranslation } from '@yalla/i18n';
import { Ionicons } from '@expo/vector-icons';
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
import { Rise } from '../../src/components/motion/Rise';
import { PhotoImage } from '../../src/components/PhotoImage';
import { maskPhone } from '../../src/components/profile/maskPhone';
import { ProfileRow } from '../../src/components/profile/ProfileRow';
import { Screen, useNavClearance } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { useDinerProfile } from '../../src/data/accountQueries';
import { useNotificationCount } from '../../src/hooks/useNotificationCount';
import { initialsOf } from '../../src/lib/initials';
import { useSession } from '../../src/stores/session';
import {
  actionIcon,
  colors,
  displayWeight,
  layout,
  navIcons,
  radius,
  shadows,
  space,
  typography,
} from '../../src/theme';

const AVATAR = 64;

/**
 * Profile — who the diner is to the app, and the list of everything that is
 * theirs. No dashboard, no stats.
 *
 * Signed in, it is the account as `/me` describes it: the photo (or
 * initials), name and number — its middle hidden — and whether that number is
 * proven, with a way to prove it when it is not. A guest sees the same list,
 * with a way in.
 *
 * Every row opens something. A row with nowhere to go is not drawn.
 */
export default function ProfileScreen() {
  const { t } = useTranslation(['diner', 'common']);
  const { locale } = useLocale();
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
  const phone = signedIn ? (profile?.phoneE164 ?? phoneE164) : null;
  // The number, half hidden; an account with none is named by its email or handle.
  const contact = signedIn
    ? phone
      ? maskPhone(phone)
      : (profile?.email ?? email ?? (profile?.username ? `@${profile.username}` : null))
    : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom }]}>
        <Text display style={styles.title} accessibilityRole="header">
          {t('profile.title')}
        </Text>

        {deleted && !signedIn ? (
          <Card>
            <Text style={styles.contact} accessibilityRole="alert">
              {t('profile.deleteAccount.done')}
            </Text>
          </Card>
        ) : null}

        <Rise>
          <View style={styles.identity}>
            <View style={styles.avatarGlow}>
              {photoUrl ? (
                <PhotoImage source={photoUrl} style={styles.avatar} />
              ) : (
                <View
                  style={styles.avatar}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                >
                  <Text display style={styles.initials}>
                    {initialsOf(name)}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.identityBody}>
              <Text display numberOfLines={1} style={styles.name}>
                {name ?? t('profile.guest')}
              </Text>
              {contact ? (
                <Text numberOfLines={1} style={styles.contact}>
                  {contact}
                </Text>
              ) : null}
              {signedIn && profile?.phoneVerified ? (
                <View style={styles.verified}>
                  <Ionicons name="checkmark" size={12} color={colors.successInk} />
                  <Text style={styles.verifiedText}>{t('profile.verified')}</Text>
                </View>
              ) : null}
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
            {signedIn ? (
              <IconButton
                icon="pencil-outline"
                onPress={() => router.push('/profile/edit')}
                accessibilityLabel={t('profile.editProfile')}
                variant="ghost"
                size="md"
              />
            ) : null}
          </View>
        </Rise>

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

        {signedIn ? null : (
          <View style={styles.guestActions}>
            <Button label={t('profile.logIn')} onPress={() => router.push('/auth/login')} />
            <Button
              label={t('profile.createAccount')}
              variant="outline"
              onPress={() => router.push('/auth/signup')}
            />
          </View>
        )}

        <Rise delay={80}>
          <Card padded={false} radiusToken="hero" style={styles.rows}>
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
            {/* Settings is the language, for now — so the row says which. */}
            <ProfileRow
              icon={actionIcon.website}
              label={t('profile.settings')}
              value={t(`language.${locale}`, { ns: 'common' })}
              onPress={() => router.push('/settings')}
              divider={false}
            />
          </Card>
        </Rise>

        {signedIn ? (
          <Rise delay={140}>
            <Button
              label={t('profile.logOut')}
              variant="destructive"
              disabled={signingOut}
              onPress={() => void logOut()}
              style={styles.logOut}
            />
          </Rise>
        ) : null}

        {signedIn && profile ? (
          <Card padded={false} radiusToken="hero" style={styles.rows}>
            <ProfileRow
              icon="trash-outline"
              label={t('profile.deleteAccount.row')}
              tone="danger"
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
    gap: space.lg + 2,
  },
  title: {
    ...typography.heading,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: displayWeight.semibold,
    color: colors.text,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md + 2,
    padding: space.md + 2,
    borderRadius: radius.hero,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  // The warm halo sits on a wrapper: the photo clips its own corners, and a
  // clipped view loses its shadow on iOS.
  avatarGlow: { borderRadius: radius.pill, ...shadows.brand },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.pill,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { ...typography.heading, color: colors.primary },
  identityBody: { flex: 1, minWidth: 0, gap: 3 },
  name: { ...typography.h3, fontWeight: displayWeight.semibold, color: colors.text },
  contact: { ...typography.caption, fontSize: 12.5, color: colors.textMuted },
  verified: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  verifiedText: { ...typography.caption, color: colors.successInk },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  unverified: { ...typography.caption, color: colors.warningInk },
  verifyButton: { paddingHorizontal: space.xs },
  guestActions: { gap: space.sm },
  prompt: { gap: space.sm },
  rows: { overflow: 'hidden' },
  // A red-edged glass pill: leaving is allowed, not encouraged.
  logOut: {
    minHeight: layout.controlHeight,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.errorStrong,
    backgroundColor: colors.errorSoft,
  },
});
