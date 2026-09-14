import { minutesBetween } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { Text } from '../../../src/components/Text';
import { useDinerTab } from '../../../src/data/orderQueries';
import { useTabInvite } from '../../../src/data/queries';
import { useNow } from '../../../src/hooks/useNow';
import { inviteFailure } from '../../../src/tab/invite';
import { colors, fontWeight, space, typography } from '../../../src/theme';

/** The QR is read across a table, in a dim room, off a phone held at an angle. */
const QR_SIZE = 220;

/**
 * Invite — one token, two ways to hand it over.
 *
 * The QR and the share link carry exactly the same token, so a friend across
 * the table who scans and a friend on WhatsApp who taps land in the same place.
 * Two tokens would be two things to revoke and two ways for a stale one to
 * survive in a group chat.
 */
export default function InviteScreen() {
  const { t } = useTranslation('diner');
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  // Bumping the nonce is what "new link" means: a different command id, so the
  // backend mints a fresh token rather than replaying the old one.
  const [nonce, setNonce] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: tab } = useDinerTab(tabId);
  const {
    data: invite,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useTabInvite(tabId, nonce);
  // Only the host can make an invitation. That refusal is said as what it is,
  // with no retry, because trying again cannot change who opened the tab.
  const failure = inviteFailure(error);

  // A clock as subscribed state rather than `Date.now()` in render, so the
  // countdown is honest instead of frozen at whenever the screen last painted.
  const now = useNow(30_000);
  const minutesLeft = invite ? minutesBetween(now, new Date(invite.expiresAtUtc)) : 0;
  const expired = invite !== undefined && minutesLeft <= 0;

  const share = useCallback(async () => {
    if (!invite || !tab) return;
    setNotice(null);

    const message = t('invite.shareMessage', {
      venue: tab.venueName,
      table: tab.tableLabel,
      url: invite.url,
    });

    try {
      const result = await Share.share({ message, url: invite.url });
      if (result.action === Share.dismissedAction) return;
    } catch {
      // No share sheet here — the web build, mostly. Copying is the honest
      // fallback, and saying so beats a button that appears to do nothing.
      await Clipboard.setStringAsync(invite.url);
      setNotice(t('invite.shareUnavailable'));
    }
  }, [invite, tab, t]);

  const copy = useCallback(async () => {
    if (!invite) return;
    await Clipboard.setStringAsync(invite.url);
    setNotice(t('invite.copied'));
  }, [invite, t]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text display style={styles.title}>
          {t('invite.title')}
        </Text>
        <Text style={styles.lead}>{t('invite.body')}</Text>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>{t('invite.loading')}</Text>
          </View>
        ) : isError || !invite ? (
          <View style={styles.centered}>
            <Text style={failure.retry ? styles.error : styles.refusal}>{t(failure.key)}</Text>
            {failure.retry ? (
              <Button
                label={t('net.retry')}
                variant="secondary"
                fullWidth={false}
                onPress={() => void refetch()}
                style={styles.retry}
              />
            ) : null}
          </View>
        ) : (
          <>
            <Card style={styles.qrCard}>
              <View style={styles.qrFrame}>
                <QRCode
                  value={invite.url}
                  size={QR_SIZE}
                  backgroundColor={colors.surface}
                  color={colors.text}
                />
              </View>
              <Text style={styles.url} numberOfLines={2}>
                {invite.url}
              </Text>
            </Card>

            {/* Expiry stated plainly, not implied by a link that quietly stops
                working in someone's chat an hour later. */}
            <Text style={expired ? styles.expired : styles.expiry}>
              {expired ? t('invite.expired') : t('invite.expiresIn', { count: minutesLeft })}
            </Text>

            <Button
              label={t('invite.share')}
              size="large"
              onPress={() => void share()}
              style={styles.share}
            />

            <Button label={t('invite.copy')} variant="secondary" onPress={() => void copy()} />

            <Button
              label={isFetching ? t('invite.loading') : t('invite.refresh')}
              variant="text"
              busy={isFetching}
              onPress={() => {
                setNotice(null);
                setNonce((n) => n + 1);
              }}
            />

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  body: { padding: space.xl, paddingBottom: space.xxxl, gap: space.sm, alignItems: 'stretch' },
  title: { ...typography.title, color: colors.text },
  lead: { ...typography.bodyLg, color: colors.textMuted },
  qrCard: { marginTop: space.lg, alignItems: 'center', gap: space.md },
  qrFrame: { padding: space.md, backgroundColor: colors.surface },
  url: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  expiry: { marginTop: space.sm, ...typography.body, color: colors.textMuted },
  expired: {
    marginTop: space.sm,
    ...typography.body,
    fontWeight: fontWeight.medium,
    color: colors.warningInk,
  },
  share: { marginTop: space.sm },
  retry: { alignSelf: 'center' },
  notice: { ...typography.body, color: colors.successInk, textAlign: 'center' },
  error: { ...typography.body, color: colors.errorInk, textAlign: 'center' },
  refusal: { ...typography.bodyLg, color: colors.text, textAlign: 'center' },
  centered: { alignItems: 'center', gap: space.md, paddingTop: space.xxl },
  muted: { ...typography.body, color: colors.textMuted },
});
