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
  Text,
  View,
} from 'react-native';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import { useLeaveTab, useTab } from '../../../src/data/queries';
import { newCommandId } from '../../../src/lib/commandId';
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

  const { data: tab, isLoading, isFetching, refetch } = useTab(tabId, { pollMs: POLL_MS });
  const leaveTab = useLeaveTab();
  const clearActive = useActiveTab((s) => s.clear);

  // Approved: go straight through. `replace`, so hardware back from the tab
  // does not land the diner back on a waiting screen for a tab they are on.
  useEffect(() => {
    if (tab?.yourStatus === 'active' && tabId) {
      router.replace({ pathname: '/tab/[tabId]', params: { tabId } });
    }
  }, [tab?.yourStatus, tabId, router]);

  const confirmLeave = useCallback(async () => {
    if (!tabId) return;
    setLeaveError(null);
    try {
      await leaveTab.mutateAsync({ tabId, commandId: newCommandId() });
      clearActive();
      setLeaveOpen(false);
      router.replace('/(tabs)/scan');
    } catch {
      setLeaveError(t('tab.leaveFailed'));
    }
  }, [tabId, leaveTab, clearActive, router, t]);

  const hostName = tab?.participants.find((p) => p.role === 'host')?.displayName ?? null;
  const rejected = tab?.yourStatus === 'rejected';
  const removed = tab?.yourStatus === 'removed';

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={color.accent} />
            <Text style={styles.muted}>{t('tab.loading')}</Text>
          </View>
        ) : rejected || removed ? (
          <>
            <Text style={styles.title}>
              {rejected ? t('pending.rejectedTitle') : t('pending.removedTitle')}
            </Text>
            <Text style={styles.bodyText}>
              {rejected ? t('pending.rejectedBody') : t('pending.removedBody')}
            </Text>
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
              <ActivityIndicator color={color.accent} />
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
                  tab && router.push({ pathname: '/tab/[tabId]/menu', params: { tabId: tab.id } })
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
  safeArea: { flex: 1, backgroundColor: color.background },
  body: { padding: space.xl, gap: space.md },
  bodyText: { fontSize: fontSize.md, lineHeight: lineHeight.md, color: color.textSecondary },
  spinnerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: {
    flex: 1,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: fontWeight.bold,
    color: color.textPrimary,
  },
  lead: { fontSize: fontSize.md, lineHeight: lineHeight.md, color: color.textSecondary },
  card: {
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    gap: space.xs,
  },
  where: { fontSize: fontSize.sm, color: color.textSecondary },
  table: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: color.textPrimary },
  muted: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.textSecondary },
  primary: {
    marginTop: space.sm,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.accent,
  },
  primaryPressed: { backgroundColor: color.accentStrong },
  primaryText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: color.textInverse },
  secondary: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  secondaryPressed: { backgroundColor: color.surfaceMuted },
  secondaryText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.textPrimary },
  leave: { minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center' },
  leaveText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color.danger },
  centered: { alignItems: 'center', gap: space.sm, paddingTop: space.xxl },
  pressed: { opacity: 0.75 },
});
