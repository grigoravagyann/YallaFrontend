import {
  setTabPermission,
  togglePullsAlong,
  type TabParticipant,
  type TabPermissionKey,
  type TabPermissions,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { Text } from '../../../src/components/Text';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import { ParticipantRow, onTab, waitingToJoin } from '../../../src/components/Participants';
import {
  useApproveJoin,
  useRejectJoin,
  useRemoveParticipant,
  useSetParticipantPermissions,
  useSetTabDefaultPermissions,
  useTab,
} from '../../../src/data/queries';
import { newCommandId } from '../../../src/lib/commandId';

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
 */
export default function PeopleScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const { data: tab, isLoading } = useTab(tabId, { pollMs: POLL_MS });
  const approve = useApproveJoin();
  const reject = useRejectJoin();
  const removeParticipant = useRemoveParticipant();
  const setPermissions = useSetParticipantPermissions();
  const setDefaults = useSetTabDefaultPermissions();

  const [error, setError] = useState<string | null>(null);
  /** Which toggle just dragged another one, so the reason is shown once. */
  const [explain, setExplain] = useState<{ who: string; key: TabPermissionKey } | null>(null);
  const [removing, setRemoving] = useState<TabParticipant | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      try {
        await action();
        return true;
      } catch {
        // Nothing is patched locally, so a failure leaves the list exactly as the
        // server last described it. Say so and let them try again.
        setError(t('people.failed'));
        return false;
      }
      // `t` is stable for a given language; including it keeps the lint honest.
    },
    [t],
  );

  const togglePermission = useCallback(
    (participant: TabParticipant, key: TabPermissionKey, value: boolean) => {
      if (!tabId) return;
      const pulled = togglePullsAlong(participant.permissions, key, value);
      setExplain(pulled ? { who: participant.id, key } : null);

      const next = setTabPermission(participant.permissions, key, value);
      void run(() =>
        setPermissions.mutateAsync({
          tabId,
          participantId: participant.id,
          permissions: next,
          commandId: newCommandId(),
        }),
      );
    },
    [tabId, run, setPermissions],
  );

  const toggleDefault = useCallback(
    (current: TabPermissions, key: TabPermissionKey, value: boolean) => {
      if (!tabId) return;
      setExplain(togglePullsAlong(current, key, value) ? { who: 'defaults', key } : null);
      void run(() =>
        setDefaults.mutateAsync({
          tabId,
          permissions: setTabPermission(current, key, value),
          commandId: newCommandId(),
        }),
      );
    },
    [tabId, run, setDefaults],
  );

  const confirmRemove = useCallback(async () => {
    if (!tabId || !removing) return;
    setRemoveError(null);
    try {
      await removeParticipant.mutateAsync({
        tabId,
        participantId: removing.id,
        commandId: newCommandId(),
      });
      setRemoving(null);
    } catch {
      setRemoveError(t('people.failed'));
    }
  }, [tabId, removing, removeParticipant, t]);

  if (isLoading || !tab) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <View style={styles.centered}>
          <ActivityIndicator color={color.primary} />
          <Text style={styles.muted}>{t('tab.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Scope comes from the tab the server described, never from having reached
  // this route. A guest who lands here by any means sees a plain refusal.
  if (tab.yourRole !== 'host' || tab.yourStatus !== 'active') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t('people.hostOnly')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>{t('floorPlan.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const pending = waitingToJoin(tab.participants);
  const active = onTab(tab.participants).filter((p) => !p.isYou);
  const busy = approve.isPending || reject.isPending || setPermissions.isPending;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t('people.title')}</Text>

        {/* Stated up front, before any toggle: hiding the total never hides
            someone's own order. This is the sentence that stops a guest asking
            a waiter what they owe. */}
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t('people.alwaysOwnItems')}</Text>
          <Text style={styles.noticeWhy}>{t('people.whyHide')}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {pending.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('people.pendingSection')}</Text>
            {pending.map((participant) => (
              <ParticipantRow key={participant.id} participant={participant}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      approve.mutateAsync({
                        tabId: tab.id,
                        participantId: participant.id,
                        commandId: newCommandId(),
                      }),
                    )
                  }
                  style={({ pressed }) => [styles.approve, pressed && styles.pressed]}
                >
                  <Text style={styles.approveText}>{t('people.approve')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() =>
                    void run(() =>
                      reject.mutateAsync({
                        tabId: tab.id,
                        participantId: participant.id,
                        commandId: newCommandId(),
                      }),
                    )
                  }
                  style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.rejectText}>{t('people.reject')}</Text>
                </Pressable>
              </ParticipantRow>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('people.activeSection')}</Text>

          {active.length === 0 ? (
            <Text style={styles.muted}>{t('people.empty')}</Text>
          ) : (
            active.map((participant) => (
              <View key={participant.id} style={styles.personBlock}>
                <ParticipantRow participant={participant}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setRemoving(participant)}
                    style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.rejectText}>{t('people.remove')}</Text>
                  </Pressable>
                </ParticipantRow>

                <PermissionToggles
                  permissions={participant.permissions}
                  explainKey={explain?.who === participant.id ? explain.key : null}
                  onToggle={(key, value) => togglePermission(participant, key, value)}
                />
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('people.defaultsTitle')}</Text>
          <Text style={styles.muted}>{t('people.defaultsBody')}</Text>
          <PermissionToggles
            permissions={tab.defaultPermissions}
            explainKey={explain?.who === 'defaults' ? explain.key : null}
            onToggle={(key, value) => toggleDefault(tab.defaultPermissions, key, value)}
          />
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={removing !== null}
        title={t('people.removeTitle', { name: removing?.displayName ?? t('tab.guest') })}
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

/** The three switches, and the one line that explains a switch moving itself. */
function PermissionToggles({
  permissions,
  explainKey,
  onToggle,
}: {
  permissions: TabPermissions;
  explainKey: TabPermissionKey | null;
  onToggle: (key: TabPermissionKey, value: boolean) => void;
}) {
  const { t } = useTranslation('diner');

  const rows: readonly TabPermissionKey[] = ['canOrder', 'canSeeTableTotal', 'canPay'];

  return (
    <View style={styles.toggles}>
      {rows.map((key) => (
        <View key={key} style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t(`people.${key}`)}</Text>
          <Switch
            value={permissions[key]}
            onValueChange={(value) => onToggle(key, value)}
            trackColor={{ true: color.greenTint, false: color.greenTint }}
            thumbColor={permissions[key] ? color.primaryPressed : color.border}
            accessibilityLabel={t(`people.${key}`)}
          />
        </View>
      ))}

      {explainKey === 'canPay' ? (
        <Text style={styles.explain}>{t('people.payNeedsTotal')}</Text>
      ) : null}
      {explainKey === 'canSeeTableTotal' ? (
        <Text style={styles.explain}>{t('people.totalOffTurnsOffPay')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.paper },
  body: { padding: space.lg, paddingBottom: space.xxxl, gap: space.md },
  title: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  notice: {
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: color.greenTint,
    gap: space.xs,
  },
  noticeText: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.foreground },
  noticeWhy: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  card: {
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.foreground },
  personBlock: {
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  toggles: { gap: space.xs, paddingLeft: space.xxl },
  toggleRow: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  toggleLabel: { flex: 1, fontSize: fontSize.sm, color: color.foreground },
  explain: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    color: color.info,
    paddingBottom: space.xs,
  },
  approve: {
    minHeight: touchTarget.minimum - 8,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    backgroundColor: color.primary,
  },
  approveText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.primaryForeground,
  },
  rejectBtn: {
    minHeight: touchTarget.minimum - 8,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border,
  },
  rejectText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: color.foreground },
  secondary: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.border,
  },
  secondaryText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.foreground },
  error: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.danger },
  muted: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.mutedForeground },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  pressed: { opacity: 0.75 },
});
