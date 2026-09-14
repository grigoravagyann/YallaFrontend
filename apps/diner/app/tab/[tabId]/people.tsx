import {
  isTabAccessEnded,
  setTabPermission,
  togglePullsAlong,
  type TabPermissionKey,
  type TabPermissions,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import { ParticipantRow } from '../../../src/components/Participants';
import { Text } from '../../../src/components/Text';
import { useDinerTab } from '../../../src/data/orderQueries';
import {
  useApproveJoin,
  useKnownPermissions,
  useRejectJoin,
  useRemoveParticipant,
  useSetParticipantPermissions,
} from '../../../src/data/queries';
import { newCommandId } from '../../../src/lib/commandId';
import {
  onTab,
  permissionDraft,
  roster,
  waitingToJoin,
  type RosterPerson,
} from '../../../src/tab/roster';
import { colors, layout, radius, space, typography } from '../../../src/theme';

const POLL_MS = 5_000;

/**
 * Host controls.
 *
 * Two rules the server enforces and this screen must therefore never break:
 *
 * 1. **Can pay implies can see the total.** There is no state here where pay is
 *    on and the total is off — flipping either one drags the other, and a line
 *    of copy says why so nobody thinks the switch is broken.
 * 2. **Everyone always sees their own items.** Said on the screen, not just in
 *    a comment, because a guest who believes they are hidden from their own
 *    bill will simply ask a waiter and the feature has cost the venue time.
 *
 * There is no "new people get" control. It was served by the mock alone: the
 * server has per-person permissions and nothing else, and a switch that only
 * ever changed a local fake told the host something untrue.
 */
export default function PeopleScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const { data: view, isLoading, error: readError } = useDinerTab(tabId, { pollMs: POLL_MS });
  const { data: known } = useKnownPermissions(tabId);
  const approve = useApproveJoin();
  const reject = useRejectJoin();
  const removeParticipant = useRemoveParticipant();
  const setPermissions = useSetParticipantPermissions();

  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RosterPerson | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const failureText = useCallback(
    (caught: unknown) =>
      isTabAccessEnded(caught) ? t('tab.accessEnded.body') : t('people.failed'),
    [t],
  );

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      try {
        await action();
        return true;
      } catch (caught) {
        // Nothing is patched locally, so a failure leaves the list exactly as the
        // server last described it. Say so and let them try again.
        setError(failureText(caught));
        return false;
      }
    },
    [failureText],
  );

  const savePermissions = useCallback(
    (person: RosterPerson, permissions: TabPermissions) =>
      tabId
        ? run(() =>
            setPermissions.mutateAsync({
              tabId,
              participantId: person.participantId,
              permissions,
              commandId: newCommandId(),
            }),
          )
        : Promise.resolve(false),
    [tabId, run, setPermissions],
  );

  const confirmRemove = useCallback(async () => {
    if (!tabId || !removing) return;
    setRemoveError(null);
    try {
      await removeParticipant.mutateAsync({
        tabId,
        participantId: removing.participantId,
        commandId: newCommandId(),
      });
      setRemoving(null);
    } catch (caught) {
      setRemoveError(failureText(caught));
    }
  }, [tabId, removing, removeParticipant, failureText]);

  if (isLoading || (!view && !readError)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>{t('tab.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Scope comes from the tab the server described, never from having reached
  // this route. A guest who lands here by any means sees a plain refusal.
  if (!view || view.me.role !== 'host' || view.me.status !== 'approved') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>
            {isTabAccessEnded(readError) ? t('tab.accessEnded.body') : t('people.hostOnly')}
          </Text>
          <Button
            label={t('floorPlan.back')}
            variant="secondary"
            fullWidth={false}
            onPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const people = roster(view);
  const pending = waitingToJoin(people);
  const active = onTab(people).filter((person) => !person.isYou);
  const busy = approve.isPending || reject.isPending || setPermissions.isPending;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text display style={styles.title}>
          {t('people.title')}
        </Text>

        {/* Stated up front, before any toggle: hiding the total never hides
            someone's own order. This is the sentence that stops a guest asking
            a waiter what they owe. */}
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t('people.alwaysOwnItems')}</Text>
          <Text style={styles.noticeWhy}>{t('people.whyHide')}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {pending.length > 0 ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('people.pendingSection')}</Text>
            {pending.map((person) => (
              <ParticipantRow key={person.participantId} person={person}>
                <Button
                  label={t('people.approve')}
                  fullWidth={false}
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      approve.mutateAsync({
                        tabId: view.tabId,
                        participantId: person.participantId,
                        commandId: newCommandId(),
                      }),
                    )
                  }
                  size="small"
                />
                <Button
                  label={t('people.reject')}
                  variant="secondary"
                  fullWidth={false}
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      reject.mutateAsync({
                        tabId: view.tabId,
                        participantId: person.participantId,
                        commandId: newCommandId(),
                      }),
                    )
                  }
                  size="small"
                />
              </ParticipantRow>
            ))}
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('people.activeSection')}</Text>

          {active.length === 0 ? (
            <Text style={styles.muted}>{t('people.empty')}</Text>
          ) : (
            active.map((person) => (
              <View key={person.participantId} style={styles.personBlock}>
                <ParticipantRow person={person}>
                  <Button
                    label={t('people.remove')}
                    variant="secondary"
                    fullWidth={false}
                    onPress={() => setRemoving(person)}
                    size="small"
                  />
                </ParticipantRow>

                <PersonPermissions
                  // A new key when what the server said changes, so a draft
                  // for someone unknown is replaced by the real flags.
                  key={`${person.participantId}:${JSON.stringify(known[person.participantId] ?? null)}`}
                  known={known[person.participantId]}
                  hideTotalFromGuests={view.hideTotalFromGuests}
                  busy={setPermissions.isPending}
                  onSave={(permissions) => savePermissions(person, permissions)}
                />
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      <ConfirmSheet
        visible={removing !== null}
        title={t('people.removeTitle', { name: removing?.displayName || t('tab.guest') })}
        body={t('people.removeBody')}
        confirmLabel={t('people.removeConfirm')}
        cancelLabel={t('people.removeKeep')}
        busy={removeParticipant.isPending}
        error={removeError}
        destructive
        onConfirm={() => void confirmRemove()}
        onCancel={() => {
          setRemoving(null);
          setRemoveError(null);
        }}
      />
    </SafeAreaView>
  );
}

/**
 * One person's three switches.
 *
 * The tab read carries nobody's flags, so this phone knows them only from the
 * answer to a host action. Known: each switch sends at once, as before.
 * Unknown: the switches start from the table default, say so, and nothing is
 * sent until the host saves all three — never one flag stacked on two guesses.
 */
function PersonPermissions({
  known,
  hideTotalFromGuests,
  busy,
  onSave,
}: {
  known: TabPermissions | undefined;
  hideTotalFromGuests: boolean;
  busy: boolean;
  onSave: (permissions: TabPermissions) => Promise<boolean>;
}) {
  const { t } = useTranslation('diner');
  const start = permissionDraft(known, hideTotalFromGuests);
  const [draft, setDraft] = useState<TabPermissions>(start.permissions);
  /** Which toggle just dragged another one, so the reason is shown once. */
  const [explain, setExplain] = useState<TabPermissionKey | null>(null);

  const toggle = (key: TabPermissionKey, value: boolean) => {
    setExplain(togglePullsAlong(draft, key, value) ? key : null);
    const next = setTabPermission(draft, key, value);
    setDraft(next);
    if (start.known) void onSave(next);
  };

  return (
    <View style={styles.toggles}>
      {start.known ? null : <Text style={styles.explain}>{t('people.permissionsUnknown')}</Text>}

      {(['canOrder', 'canSeeTableTotal', 'canPay'] as const).map((key) => (
        <View key={key} style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t(`people.${key}`)}</Text>
          <Switch
            value={draft[key]}
            disabled={busy}
            onValueChange={(value) => toggle(key, value)}
            // On is the brown thumb on a firmer track; off is a white thumb
            // on the muted one. Position and colour both say which.
            trackColor={{ true: colors.borderStrong, false: colors.surfaceMuted }}
            ios_backgroundColor={colors.surfaceMuted}
            thumbColor={draft[key] ? colors.primary : colors.surface}
            accessibilityLabel={t(`people.${key}`)}
          />
        </View>
      ))}

      {explain === 'canPay' ? (
        <Text style={styles.explain}>{t('people.payNeedsTotal')}</Text>
      ) : null}
      {explain === 'canSeeTableTotal' ? (
        <Text style={styles.explain}>{t('people.totalOffTurnsOffPay')}</Text>
      ) : null}

      {start.known ? null : (
        <Button
          label={t('people.savePermissions')}
          fullWidth={false}
          disabled={busy}
          onPress={() => void onSave(draft)}
          size="small"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  body: { padding: space.lg, paddingBottom: space.xxxl, gap: space.md },
  title: { ...typography.title, color: colors.text },
  notice: {
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceMuted,
    gap: space.xs,
  },
  noticeText: { ...typography.body, color: colors.text },
  noticeWhy: { ...typography.body, color: colors.textMuted },
  card: { gap: space.sm },
  cardTitle: { ...typography.h3, color: colors.text },
  personBlock: {
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggles: { gap: space.xs, paddingLeft: space.xxl },
  toggleRow: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  toggleLabel: { flex: 1, ...typography.body, color: colors.text },
  explain: { ...typography.caption, color: colors.infoInk, paddingBottom: space.xs },
  error: { ...typography.body, color: colors.errorInk },
  muted: { ...typography.body, color: colors.textMuted },
  emptyTitle: { ...typography.h3, color: colors.text, textAlign: 'center' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
});
