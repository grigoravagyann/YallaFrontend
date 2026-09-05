import { useLocale, useTranslation } from '@yalla/i18n';
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
import { CallWaiterSheet } from '../../../src/components/CallWaiterSheet';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import {
  ParticipantsList,
  onTab,
  useParticipantSummary,
} from '../../../src/components/Participants';
import { LiveBill } from '../../../src/components/LiveBill';
import { useLeaveTab, useTab } from '../../../src/data/queries';
import { newCommandId } from '../../../src/lib/commandId';
import { useActiveTab } from '../../../src/stores/tab';

/** Slow enough not to be a battery problem, quick enough to feel current. */
const POLL_MS = 8_000;

/**
 * The tab — the main screen for anyone sitting at the table.
 *
 * Ordering arrives next, so what exists here is the frame and the people: who
 * is on the tab, who is waiting, how to invite the rest of the party, and how
 * to get a waiter's attention. Everything about money is deliberately absent
 * rather than stubbed with zeroes.
 */
export default function TabScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const [waiterOpen, setWaiterOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Polling stands in for the socket that arrives later. Someone else may
  // approve a joiner, or the table may be closed by staff, while this screen is
  // open — and a stale participants list is the thing this screen exists to
  // avoid showing.
  const { data: tab, isLoading, isError, refetch, isFetching } = useTab(tabId, { pollMs: POLL_MS });
  const leaveTab = useLeaveTab();
  const clearActive = useActiveTab((s) => s.clear);

  const summary = useParticipantSummary(tab?.participants ?? [], locale);
  const people = onTab(tab?.participants ?? []).length;
  const isHost = tab?.yourRole === 'host' && tab.yourStatus === 'active';

  // Someone else removed you, or the host never approved you: the tab screen is
  // no longer the truth and the pending screen says what actually happened.
  useEffect(() => {
    if (!tab || !tabId) return;
    if (
      tab.yourStatus === 'pending' ||
      tab.yourStatus === 'rejected' ||
      tab.yourStatus === 'removed'
    ) {
      router.replace({ pathname: '/tab/[tabId]/pending', params: { tabId } });
    }
  }, [tab, tabId, router]);

  const confirmLeave = useCallback(async () => {
    if (!tabId) return;
    setLeaveError(null);
    try {
      await leaveTab.mutateAsync({ tabId, commandId: newCommandId() });
      clearActive();
      setLeaveOpen(false);
      router.replace('/(tabs)/scan');
    } catch {
      // The sheet stays open. Leaving is retryable and the screen must not
      // claim you are off a tab the server still has you on.
      setLeaveError(t('tab.leaveFailed'));
    }
  }, [tabId, leaveTab, clearActive, router, t]);

  if (isLoading) {
    return (
      <Shell title="">
        <View style={styles.centered}>
          <ActivityIndicator color={color.primary} />
          <Text style={styles.muted}>{t('tab.loading')}</Text>
        </View>
      </Shell>
    );
  }

  if (isError || !tab) {
    return (
      <Shell title="">
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('tab.notFoundTitle')}</Text>
          <Text style={styles.muted}>{t('tab.notFoundBody')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(tabs)/scan')}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryText}>{t('scan.scanAgain')}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  if (tab.status === 'closed') {
    return (
      <Shell title="">
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('tab.closedTitle')}</Text>
          <Text style={styles.muted}>{t('tab.closedBody')}</Text>
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
        </View>
      </Shell>
    );
  }

  return (
    <Shell title="">
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <Text style={styles.table}>{t('tab.title', { label: tab.tableLabel })}</Text>
          <Text style={styles.where}>
            {t('tab.where', { venue: tab.venueName, branch: tab.branchName })}
          </Text>
          <Text style={styles.count}>{t('tab.peopleCount', { count: people })}</Text>
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
        </View>

        {/* A stale list that looks live is the failure mode here, so say when
            the last refresh did not land rather than showing nothing. */}
        {isError ? <Text style={styles.offline}>{t('tab.offline')}</Text> : null}

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{t('tab.people')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refetch()}
              style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
            >
              <Text style={styles.textActionLabel}>
                {isFetching ? t('pending.checking') : t('tab.refresh')}
              </Text>
            </Pressable>
          </View>

          <ParticipantsList tab={tab} />

          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/tab/[tabId]/invite', params: { tabId: tab.id } })
            }
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryText}>{t('tab.invite')}</Text>
          </Pressable>

          {isHost ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/tab/[tabId]/people', params: { tabId: tab.id } })
              }
              style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>{t('tab.manage')}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* The bill as it grows. Live through the tab's event sequence, so a
            waiter adding a spoken order on the tablet appears here without
            anybody refreshing anything. */}
        <LiveBill
          tabId={tab.id}
          participantId={tab.yourParticipantId}
          active={tab.yourStatus === 'active'}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/tab/[tabId]/menu', params: { tabId: tab.id } })}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>{t('tab.order')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/tab/[tabId]/settle', params: { tabId: tab.id } })
          }
          style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
        >
          <Text style={styles.secondaryText}>{t('tab.settle')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => setLeaveOpen(true)}
          style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
        >
          <Text style={styles.leaveText}>{t('tab.leave')}</Text>
        </Pressable>
      </ScrollView>

      {/* One tap from the floor, always visible, never behind a menu. */}
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setWaiterOpen(true)}
          style={({ pressed }) => [styles.waiter, pressed && styles.pressed]}
        >
          <Text style={styles.waiterText}>{t('waiter.call')}</Text>
        </Pressable>
      </View>

      <CallWaiterSheet tabId={tab.id} visible={waiterOpen} onClose={() => setWaiterOpen(false)} />

      <ConfirmSheet
        visible={leaveOpen}
        title={t('tab.leaveTitle')}
        body={isHost ? t('tab.leaveHostBody') : t('tab.leaveBody')}
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
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title }} />
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  body: { padding: space.lg, paddingBottom: space.xxxl, gap: space.md },
  header: { gap: space.xs },
  table: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  where: { fontSize: fontSize.sm, color: color.mutedForeground },
  count: {
    marginTop: space.xs,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.foreground,
  },
  summary: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  offline: {
    padding: space.sm,
    borderRadius: radius.card,
    backgroundColor: color.greenTint,
    fontSize: fontSize.sm,
    color: color.mutedForeground,
  },
  card: {
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
  placeholder: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.mutedForeground,
    fontStyle: 'italic',
  },
  textAction: { minHeight: touchTarget.minimum - 12, justifyContent: 'center' },
  textActionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.primaryPressed,
  },
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
  leave: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color.danger },
  footer: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.border,
    backgroundColor: color.surface,
  },
  waiter: {
    minHeight: touchTarget.minimum + 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.primaryPressed,
    backgroundColor: color.greenTint,
  },
  waiterText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.primaryPressed },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.xl,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
  muted: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.mutedForeground,
    textAlign: 'center',
  },
  pressed: { opacity: 0.75 },
});
