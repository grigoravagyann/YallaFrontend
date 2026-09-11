import { HostCannotLeaveError, isTabAccessEnded } from '@yalla/api';
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
import { ParticipantsList, useParticipantSummary } from '../../../src/components/Participants';
import { LiveBill } from '../../../src/components/LiveBill';
import { useDinerTab } from '../../../src/data/orderQueries';
import { useLeaveTab } from '../../../src/data/queries';
import { useActiveTab } from '../../../src/stores/tab';
import { canInvite } from '../../../src/tab/invite';
import { orderingBlock, orderingBlockKey } from '../../../src/tab/ordering';
import { onTab, roster } from '../../../src/tab/roster';

/** Slow enough not to be a battery problem, quick enough to feel current. */
const POLL_MS = 8_000;

/**
 * The tab — the main screen for anyone sitting at the table.
 *
 * Everything here is read from the diner's own tab read (`GET /api/tabs/{id}`
 * with this phone's participant token): who is on the tab, the bill, and
 * whether this person can order right now. It used to read the roster from the
 * mock, so against the server the screen showed a tab the backend never had.
 */
export default function TabScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const [waiterOpen, setWaiterOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Polling alongside the event stream: the roster is not in the events, and
  // someone else may approve a joiner or staff may close the table while this
  // screen is open.
  const {
    data: view,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useDinerTab(tabId, { pollMs: POLL_MS });
  const leaveTab = useLeaveTab();
  const clearActive = useActiveTab((s) => s.clear);

  const people = view ? roster(view) : [];
  const summary = useParticipantSummary(people, locale);
  const count = onTab(people).length;
  const isHost = view?.me.role === 'host' && view.me.status === 'approved';

  // Still waiting for the host: the pending screen says so, and polls faster.
  useEffect(() => {
    if (view?.me.status === 'pendingApproval' && tabId) {
      router.replace({ pathname: '/tab/[tabId]/pending', params: { tabId } });
    }
  }, [view?.me.status, tabId, router]);

  const scanAgain = useCallback(() => {
    clearActive();
    router.replace('/(tabs)/scan');
  }, [clearActive, router]);

  const confirmLeave = useCallback(async () => {
    if (!tabId) return;
    setLeaveError(null);
    try {
      await leaveTab.mutateAsync({ tabId });
      clearActive();
      setLeaveOpen(false);
      router.replace('/(tabs)/scan');
    } catch (caught) {
      // The sheet stays open. The screen must not claim you are off a tab the
      // server still has you on — and a host with nobody to hand it to is told
      // who can close it instead.
      setLeaveError(
        caught instanceof HostCannotLeaveError ? t('tab.hostCannotLeave') : t('tab.leaveFailed'),
      );
    }
  }, [tabId, leaveTab, clearActive, router, t]);

  if (isLoading) {
    return (
      <Shell>
        <View style={styles.centered}>
          <ActivityIndicator color={color.primaryInk} />
          <Text style={styles.muted}>{t('tab.loading')}</Text>
        </View>
      </Shell>
    );
  }

  // Taken off, turned away, or the tab closed under this phone. The server
  // answers all three with the same bare 401/403, so this does not guess which.
  if (isTabAccessEnded(error) || view?.me.status === 'removed') {
    return (
      <Shell>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('tab.accessEnded.title')}</Text>
          <Text style={styles.muted}>{t('tab.accessEnded.body')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={scanAgain}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryText}>{t('scan.scanAgain')}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  if (!view) {
    return (
      <Shell>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {isError ? t('tab.loadError') : t('tab.notFoundTitle')}
          </Text>
          {isError ? null : <Text style={styles.muted}>{t('tab.notFoundBody')}</Text>}
          <Pressable
            accessibilityRole="button"
            onPress={isError ? () => void refetch() : scanAgain}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryText}>{isError ? t('net.retry') : t('scan.scanAgain')}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  if (view.status === 'closed' || view.status === 'abandoned') {
    return (
      <Shell>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('tab.closedTitle')}</Text>
          <Text style={styles.muted}>{t('tab.closedBody')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={scanAgain}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryText}>{t('scan.scanAgain')}</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  const block = orderingBlock(view);

  return (
    <Shell>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <Text style={styles.table}>{t('tab.title', { label: view.tableLabel })}</Text>
          <Text style={styles.where}>
            {t('tab.where', { venue: view.venueName, branch: view.branchName })}
          </Text>
          <Text style={styles.count}>{t('tab.peopleCount', { count })}</Text>
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
        </View>

        {/* A stale list that looks live is the failure mode here, so say when
            the last refresh did not land rather than showing nothing. */}
        {isError ? <Text style={styles.offline}>{t('tab.offline')}</Text> : null}

        {view.status === 'closing' ? (
          <Text style={styles.closing}>{t('tab.closingBanner')}</Text>
        ) : null}

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

          <ParticipantsList view={view} />

          {/* Host-only, because the server's invitation route is: offered to a
              guest, it was a button whose every tap ended in a refusal. */}
          {canInvite(view) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/tab/[tabId]/invite', params: { tabId: view.tabId } })
              }
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>{t('tab.invite')}</Text>
            </Pressable>
          ) : null}

          {isHost ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/tab/[tabId]/people', params: { tabId: view.tabId } })
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
          tabId={view.tabId}
          timeZoneId={view.timeZoneId}
          active={view.me.status === 'approved'}
        />

        {/* The menu is readable by everyone at the table. Ordering is not, and
            when this person cannot order the reason is said here rather than
            discovered as a refusal after building a tray. */}
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/tab/[tabId]/menu', params: { tabId: view.tabId } })
          }
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>{block ? t('tab.menu') : t('tab.order')}</Text>
        </Pressable>
        {block ? <Text style={styles.blocked}>{t(orderingBlockKey(block))}</Text> : null}

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/tab/[tabId]/settle', params: { tabId: view.tabId } })
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

      <CallWaiterSheet
        tabId={view.tabId}
        visible={waiterOpen}
        onClose={() => setWaiterOpen(false)}
        tableLabel={view.tableLabel}
      />

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
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
  closing: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.warning,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.foreground,
  },
  blocked: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.mutedForeground,
    textAlign: 'center',
  },
  card: {
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
  textAction: { minHeight: touchTarget.minimum - 12, justifyContent: 'center' },
  textActionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.primaryInk,
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
    borderColor: color.primaryInk,
    backgroundColor: color.greenTint,
  },
  waiterText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.primaryInk },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.xl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
    textAlign: 'center',
  },
  muted: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.mutedForeground,
    textAlign: 'center',
  },
  pressed: { opacity: 0.75 },
});
