import { minutesBetween } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../../src/components/Text';
import QRCode from 'react-native-qrcode-svg';
import { useTab, useTabInvite } from '../../../src/data/queries';
import { useNow } from '../../../src/hooks/useNow';

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

  const { data: tab } = useTab(tabId);
  const { data: invite, isLoading, isError, refetch, isFetching } = useTabInvite(tabId, nonce);

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
        <Text style={styles.title}>{t('invite.title')}</Text>
        <Text style={styles.lead}>{t('invite.body')}</Text>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={color.primary} />
            <Text style={styles.muted}>{t('invite.loading')}</Text>
          </View>
        ) : isError || !invite ? (
          <View style={styles.centered}>
            <Text style={styles.error}>{t('invite.error')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refetch()}
              style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>{t('net.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.qrCard}>
              <View style={styles.qrFrame}>
                <QRCode
                  value={invite.url}
                  size={QR_SIZE}
                  backgroundColor={color.surface}
                  color={color.foreground}
                />
              </View>
              <Text style={styles.url} numberOfLines={2}>
                {invite.url}
              </Text>
            </View>

            {/* Expiry stated plainly, not implied by a link that quietly stops
                working in someone's chat an hour later. */}
            <Text style={expired ? styles.expired : styles.expiry}>
              {expired ? t('invite.expired') : t('invite.expiresIn', { count: minutesLeft })}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => void share()}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>{t('invite.share')}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => void copy()}
              style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>{t('invite.copy')}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isFetching }}
              onPress={() => {
                setNotice(null);
                setNonce((n) => n + 1);
              }}
              style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
            >
              <Text style={styles.linkText}>
                {isFetching ? t('invite.loading') : t('invite.refresh')}
              </Text>
            </Pressable>

            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  body: { padding: space.xl, paddingBottom: space.xxxl, gap: space.sm, alignItems: 'stretch' },
  title: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  lead: { fontSize: fontSize.md, lineHeight: lineHeight.md, color: color.mutedForeground },
  qrCard: {
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    alignItems: 'center',
    gap: space.md,
  },
  qrFrame: { padding: space.md, backgroundColor: color.surface, borderRadius: radius.card },
  url: { fontSize: fontSize.xs, color: color.mutedForeground, textAlign: 'center' },
  expiry: { marginTop: space.sm, fontSize: fontSize.sm, color: color.mutedForeground },
  expired: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    color: color.warning,
    fontWeight: fontWeight.medium,
  },
  primary: {
    marginTop: space.sm,
    minHeight: touchTarget.minimum + 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  primaryPressed: { backgroundColor: color.primaryPressed },
  primaryText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.primaryForeground,
  },
  secondary: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  secondaryPressed: { backgroundColor: color.greenTint },
  secondaryText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.foreground },
  linkRow: { minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.primaryPressed },
  notice: { fontSize: fontSize.sm, color: color.success, textAlign: 'center' },
  error: { fontSize: fontSize.sm, color: color.danger, textAlign: 'center' },
  centered: { alignItems: 'center', gap: space.md, paddingTop: space.xxl },
  muted: { fontSize: fontSize.sm, color: color.mutedForeground },
  pressed: { opacity: 0.75 },
});
