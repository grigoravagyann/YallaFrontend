import { isTabAccessEnded } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '../../../src/components/Text';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import { useDinerTab } from '../../../src/data/orderQueries';
import { useLeaveTab } from '../../../src/data/queries';
import { useActiveTab } from '../../../src/stores/tab';

/**
 * Fast, because this is a person standing still waiting for something that
 * takes one tap on someone else's phone. A socket replaces this in a later
 * task; the state handling is already shaped for it, since everything on this
 * screen is derived from the tab rather than from the poll.
 */
const POLL_MS = 3_000;

/**
 * Waiting for the host.
 *
 * A pending joiner is at the table and can read the menu with prices — and
 * nothing else. No table total, no other people's items. Prices stay visible so
 * anyone can work out what their own order would cost, which is the entire
 * reason not to gate the menu behind approval.
 */
export default function PendingScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const {
    data: tab,
    isLoading,
    isFetching,
    refetch,
    error,
  } = useDinerTab(tabId, {
    pollMs: POLL_MS,
  });
  const leaveTab = useLeaveTab();
  const clearActive = useActiveTab((s) => s.clear);

  // Approved: go straight through. `replace`, so hardware back from the tab
  // does not land the diner back on a waiting screen for a tab they are on.
  useEffect(() => {
    if (tab?.me.status === 'approved' && tabId) {
      router.replace({ pathname: '/tab/[tabId]', params: { tabId } });
    }
  }, [tab?.me.status, tabId, router]);

  const confirmLeave = useCallback(async () => {
    if (!tabId) return;
    setLeaveError(null);
    try {
      await leaveTab.mutateAsync({ tabId });
      clearActive();
      setLeaveOpen(false);
      router.replace('/(tabs)/scan');
    } catch {
      setLeaveError(t('tab.leaveFailed'));
    }
  }, [tabId, leaveTab, clearActive, router, t]);

  // While pending the roster holds only this person, so the host's name is
  // usually not known here; the copy has a version without it.
  const hostName = tab?.participants.find((p) => p.role === 'host')?.displayName || null;
  // Turned away, taken off, or the tab closed: the server answers a pending
  // joiner's token with the same bare 403 for all of them.
  const ended = isTabAccessEnded(error) || tab?.me.status === 'removed';

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={color.primaryInk} />
            <Text style={styles.muted}>{t('tab.loading')}</Text>
          </View>
        ) : ended ? (
          <>
            <Text style={styles.title}>{t('pending.endedTitle')}</Text>
            <Text style={styles.bodyText}>{t('pending.endedBody')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                clearActive();
                router.replace('/(tabs)/scan');
              }}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>{t('scan.scanAgain')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.spinnerRow}>
              <ActivityIndicator color={color.primaryInk} />
              <Text style={styles.title}>{t('pending.title')}</Text>
            </View>

            <Text style={styles.lead}>
              {hostName ? t('pending.body', { name: hostName }) : t('pending.bodyNoName')}
            </Text>

            {/* Where you actually are, so a wrong sticker is caught here rather
                than after the food arrives at someone else's table. */}
            {tab ? (
              <View style={styles.card}>
                <Text style={styles.where}>
                  {t('tab.where', { venue: tab.venueName, branch: tab.branchName })}
                </Text>
                <Text style={styles.table}>{t('tab.title', { label: tab.tableLabel })}</Text>
                <Text style={styles.muted}>{t('pending.rightTable')}</Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.muted}>{t('pending.menuNote')}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={!tab}
                onPress={() =>
                  tab &&
                  router.push({ pathname: '/tab/[tabId]/menu', params: { tabId: tab.tabId } })
                }
                style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
              >
                <Text style={styles.primaryText}>{t('pending.openMenu')}</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => void refetch()}
              style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>
                {isFetching ? t('pending.checking') : t('pending.refresh')}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setLeaveOpen(true)}
              style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
            >
              <Text style={styles.leaveText}>{t('pending.leave')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <ConfirmSheet
        visible={leaveOpen}
        title={t('tab.leaveTitle')}
        body={t('tab.leaveBody')}
        confirmLabel={t('tab.leaveConfirm')}
        cancelLabel={t('tab.leaveKeep')}
        busy={leaveTab.isPending}
        error={leaveError}
        destructive
        onConfirm={() => void confirmLeave()}
        onCancel={() => {
          setLeaveOpen(false);
          setLeaveError(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  body: { padding: space.xl, gap: space.md },
  bodyText: { fontSize: fontSize.md, lineHeight: lineHeight.md, color: color.mutedForeground },
  spinnerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: {
    flex: 1,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  lead: { fontSize: fontSize.md, lineHeight: lineHeight.md, color: color.mutedForeground },
  card: {
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    gap: space.xs,
  },
  where: { fontSize: fontSize.sm, color: color.mutedForeground },
  table: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
  muted: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  primary: {
    marginTop: space.sm,
    minHeight: touchTarget.minimum,
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
  leave: { minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center' },
  leaveText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color.danger },
  centered: { alignItems: 'center', gap: space.sm, paddingTop: space.xxl },
  pressed: { opacity: 0.75 },
});
