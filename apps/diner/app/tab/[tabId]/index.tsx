import { HostCannotLeaveError, isTabAccessEnded } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
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
import { Button } from '../../../src/components/Button';
import { CallWaiterSheet } from '../../../src/components/CallWaiterSheet';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import { LiveBill } from '../../../src/components/LiveBill';
import { AvatarRow, useParticipantSummary } from '../../../src/components/Participants';
import { TabNamePrompt } from '../../../src/components/TabNamePrompt';
import { Text } from '../../../src/components/Text';
import { useDinerTab } from '../../../src/data/orderQueries';
import { useLeaveTab } from '../../../src/data/queries';
import { useActiveTab } from '../../../src/stores/tab';
import { canInvite } from '../../../src/tab/invite';
import { orderingBlock, orderingBlockKey } from '../../../src/tab/ordering';
import { onTab, roster } from '../../../src/tab/roster';
import { colors, fontWeight, layout, radius, space, typography } from '../../../src/theme';

/** Slow enough not to be a battery problem, quick enough to feel current. */
const POLL_MS = 8_000;

/**
 * The tab — the main screen for anyone sitting at the table.
 *
 * The bill leads, because it is the thing that changes while you sit here.
 * The people on the tab are a row of initials under the table name rather
 * than a list: who is here is a glance, and the full roster with host
 * controls lives one tap away. Ordering is the one brown press; calling a
 * waiter never leaves the bottom edge.
 *
 * Everything here is read from the diner's own tab read (`GET /api/tabs/{id}`
 * with this phone's participant token): who is on the tab, the bill, and
 * whether this person can order right now.
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
          <ActivityIndicator color={colors.primary} />
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
          <Button label={t('scan.scanAgain')} onPress={scanAgain} />
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
          <Button
            label={isError ? t('net.retry') : t('scan.scanAgain')}
            onPress={isError ? () => void refetch() : scanAgain}
          />
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
          <Button label={t('scan.scanAgain')} onPress={scanAgain} />
        </View>
      </Shell>
    );
  }

  const block = orderingBlock(view);
  const goTo = (screen: 'invite' | 'people' | 'menu' | 'settle') =>
    router.push({ pathname: `/tab/[tabId]/${screen}`, params: { tabId: view.tabId } });

  return (
    <Shell>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <Text style={styles.where}>
            {t('tab.where', { venue: view.venueName, branch: view.branchName })}
          </Text>
          <Text display style={styles.table}>
            {t('tab.title', { label: view.tableLabel })}
          </Text>

          {/* Who is here, as initials and one sentence. Tapping it opens the
              full roster: the host's controls and the people asking to join. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[t('tab.peopleCount', { count }), summary]
              .filter(Boolean)
              .join('. ')}
            onPress={() => goTo('people')}
            style={({ pressed }) => [styles.people, pressed && styles.pressed]}
          >
            <AvatarRow people={people} />
            <View style={styles.peopleText}>
              <Text style={styles.count}>{t('tab.peopleCount', { count })}</Text>
              {summary ? (
                <Text style={styles.summary} numberOfLines={2}>
                  {summary}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </View>

        {/* Somebody the tab only knows as "Guest 2" is offered a name, once. */}
        <TabNamePrompt tabId={view.tabId} currentName={view.me.displayName} />

        {/* A stale list that looks live is the failure mode here, so say when
            the last refresh did not land rather than showing nothing. */}
        {isError ? <Text style={styles.offline}>{t('tab.offline')}</Text> : null}

        {view.status === 'closing' ? (
          <Text style={styles.closing}>{t('tab.closingBanner')}</Text>
        ) : null}

        {/* The bill as it grows. Live through the tab's event sequence, so a
            waiter adding a spoken order on the tablet appears here without
            anybody refreshing anything. */}
        <LiveBill
          tabId={view.tabId}
          timeZoneId={view.timeZoneId}
          active={view.me.status === 'approved'}
        />

        <View style={styles.actions}>
          {/* The menu is readable by everyone at the table. Ordering is not,
              and when this person cannot order the reason is said here rather
              than discovered as a refusal after building a tray. */}
          <Button label={block ? t('tab.menu') : t('tab.order')} onPress={() => goTo('menu')} />
          {block ? <Text style={styles.blocked}>{t(orderingBlockKey(block))}</Text> : null}

          <Button label={t('tab.settle')} variant="secondary" onPress={() => goTo('settle')} />

          {/* Host-only, because the server's invitation route is: offered to a
              guest, it was a button whose every tap ended in a refusal. */}
          {canInvite(view) ? (
            <Button label={t('tab.invite')} variant="secondary" onPress={() => goTo('invite')} />
          ) : null}
          {isHost ? (
            <Button label={t('tab.manage')} variant="text" onPress={() => goTo('people')} />
          ) : null}

          <Button
            label={isFetching ? t('pending.checking') : t('tab.refresh')}
            variant="text"
            busy={isFetching}
            onPress={() => void refetch()}
          />

          <Button label={t('tab.leave')} variant="destructive" onPress={() => setLeaveOpen(true)} />
        </View>
      </ScrollView>

      {/* One tap from the floor, always visible, never behind a menu. */}
      <View style={styles.footer}>
        <Button
          label={t('waiter.call')}
          variant="outline"
          onPress={() => setWaiterOpen(true)}
          style={styles.waiter}
        />
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
  safeArea: { flex: 1, backgroundColor: colors.background },
  body: { padding: space.lg, paddingBottom: space.huge + space.xl, gap: space.md },
  header: { gap: space.xs },
  where: { ...typography.body, color: colors.textMuted },
  table: { ...typography.title, color: colors.text },
  people: {
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: layout.touchTarget,
  },
  peopleText: { flex: 1 },
  count: { ...typography.bodyLg, fontWeight: fontWeight.medium, color: colors.text },
  summary: { ...typography.body, color: colors.textMuted },
  offline: {
    padding: space.sm,
    borderRadius: radius.small,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    ...typography.body,
    color: colors.textMuted,
  },
  closing: {
    padding: space.md,
    borderRadius: radius.chip,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    ...typography.body,
    color: colors.text,
  },
  actions: { gap: space.sm, marginTop: space.xs },
  blocked: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  footer: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  // Filled, not just outlined: this one stays on screen under everything
  // else, and a hollow pill over the white footer reads as a leftover.
  waiter: { backgroundColor: colors.primarySoft },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.xl,
  },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center' },
  muted: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
