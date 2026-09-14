import { isTabAccessEnded } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import { Text } from '../../../src/components/Text';
import { useDinerTab } from '../../../src/data/orderQueries';
import { useLeaveTab } from '../../../src/data/queries';
import { useActiveTab } from '../../../src/stores/tab';
import { colors, space, typography } from '../../../src/theme';

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
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>{t('tab.loading')}</Text>
          </View>
        ) : ended ? (
          <>
            <Text display style={styles.title}>
              {t('pending.endedTitle')}
            </Text>
            <Text style={styles.bodyText}>{t('pending.endedBody')}</Text>
            <Button
              label={t('scan.scanAgain')}
              onPress={() => {
                clearActive();
                router.replace('/(tabs)/scan');
              }}
              style={styles.cardAction}
            />
          </>
        ) : (
          <>
            <View style={styles.spinnerRow}>
              <ActivityIndicator color={colors.primary} />
              <Text display style={[styles.title, styles.titleInRow]}>
                {t('pending.title')}
              </Text>
            </View>

            <Text style={styles.lead}>
              {hostName ? t('pending.body', { name: hostName }) : t('pending.bodyNoName')}
            </Text>

            {/* Where you actually are, so a wrong sticker is caught here rather
                than after the food arrives at someone else's table. */}
            {tab ? (
              <Card style={styles.card}>
                <Text style={styles.where}>
                  {t('tab.where', { venue: tab.venueName, branch: tab.branchName })}
                </Text>
                <Text style={styles.table}>{t('tab.title', { label: tab.tableLabel })}</Text>
                <Text style={styles.muted}>{t('pending.rightTable')}</Text>
              </Card>
            ) : null}

            <Card style={styles.card}>
              <Text style={styles.muted}>{t('pending.menuNote')}</Text>
              <Button
                label={t('pending.openMenu')}
                disabled={!tab}
                onPress={() =>
                  tab &&
                  router.push({ pathname: '/tab/[tabId]/menu', params: { tabId: tab.tabId } })
                }
                style={styles.cardAction}
              />
            </Card>

            <Button
              label={isFetching ? t('pending.checking') : t('pending.refresh')}
              variant="secondary"
              busy={isFetching}
              onPress={() => void refetch()}
            />

            <Button
              label={t('pending.leave')}
              variant="destructive"
              onPress={() => setLeaveOpen(true)}
            />
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
  safeArea: { flex: 1, backgroundColor: colors.background },
  body: { padding: space.xl, gap: space.md },
  bodyText: { ...typography.bodyLg, color: colors.textMuted },
  spinnerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { ...typography.heading, color: colors.text },
  titleInRow: { flex: 1 },
  lead: { ...typography.bodyLg, color: colors.textMuted },
  card: { gap: space.xs },
  where: { ...typography.body, color: colors.textMuted },
  table: { ...typography.h3, color: colors.text },
  muted: { ...typography.body, color: colors.textMuted },
  cardAction: { marginTop: space.sm },
  centered: { alignItems: 'center', gap: space.sm, paddingTop: space.xxl },
});
