import { MenuItemUnavailableError, isTabAwaitingAdmission } from '@yalla/api';
import { formatDram, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../src/components/Button';
import { Card } from '../../../src/components/Card';
import { Chip } from '../../../src/components/Chip';
import { IconButton } from '../../../src/components/IconButton';
import { Rise, riseDelay } from '../../../src/components/motion/Rise';
import { SuccessMark } from '../../../src/components/motion/SuccessMark';
import { Screen } from '../../../src/components/Screen';
import { Text, TextInput } from '../../../src/components/Text';
import { orderKeys, useDinerTab, usePlaceOrder } from '../../../src/data/orderQueries';
import { newCommandId } from '../../../src/lib/commandId';
import { useTray } from '../../../src/order/TrayProvider';
import { sendTray } from '../../../src/order/send';
import { returnToTab } from '../../../src/tab/navigation';
import {
  trayItemCount,
  trayLocked,
  traySubtotalDram,
  trayToOrderLines,
} from '../../../src/order/tray';
import {
  orderingBlock,
  orderingBlockKey,
  type OrderFailure,
  type OrderingBlock,
} from '../../../src/tab/ordering';
import {
  actionIcon,
  colors,
  displayWeight,
  fontWeight,
  iconSize,
  layout,
  radius,
  shadows,
  space,
  tabularNumbers,
  typography,
} from '../../../src/theme';

/**
 * Why the order did not go — or that nobody can tell.
 *
 * - `soldOut` — `menu-item-unavailable`, 409, with the dish's name. The
 *   **whole** order is refused on purpose: a partial order is a decision made on
 *   somebody's behalf that they discover when the food arrives.
 * - `closing` — `tab-not-accepting-orders`, 409. A waiter marked the tab
 *   closing mid-tray; this one offers the bill.
 * - `blocked` — the server's bare 403, explained by reading the tab again:
 *   still pending, not allowed to order, or the bill asked for.
 * - `uncertain` — a timeout, a 5xx, or a connection that dropped after the
 *   order left a phone that was online.
 *   The order may have reached the kitchen. It used to say "not placed"; now it
 *   says it cannot tell, keeps the tray as sent, and "Check again" resends it
 *   with the same command id, which the server answers with the first order
 *   rather than a second one.
 */
type Failure =
  | { readonly kind: Exclude<OrderFailure, 'soldOut'> }
  | { readonly kind: 'soldOut'; readonly itemName: string }
  | { readonly kind: 'blocked'; readonly block: OrderingBlock };

/**
 * The tray, reviewed and sent.
 *
 * One order for everything in it. Sending is the only thing on this screen that
 * touches the server, and it is deliberately unforgiving about what it claims:
 * the button is disabled while the request is in flight, there is **no
 * optimistic success**, and a failure says what is known about it.
 *
 * The command id lives with the tray (`pendingSend`), not in this screen, and it
 * is bound to the tray's contents: leaving the screen and coming back keeps it,
 * and changing what is in the tray after a definite refusal gets a new one.
 * After an uncertain failure the tray is locked until it is checked, so a retry
 * can never replay one order id with different items.
 */
export default function TrayScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();
  const insets = useSafeAreaInsets();

  const queryClient = useQueryClient();
  const { data: view, refetch: refetchTab } = useDinerTab(tabId);
  const { state: tray, dispatch } = useTray();
  const placeOrder = usePlaceOrder();

  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [sent, setSent] = useState<{
    readonly estimatedReadyAtUtc: string | null;
    readonly wasReplay: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const count = trayItemCount(tray);
  const subtotal = traySubtotalDram(tray);
  const locked = trayLocked(tray);
  // Nothing changes while a send is in flight or unresolved, so what is sent
  // again is exactly what the command id was issued for.
  const frozen = locked || placeOrder.isPending;
  const block = view ? orderingBlock(view) : null;
  const cannotSend = placeOrder.isPending || block !== null || !view;

  async function send(): Promise<void> {
    if (!view || count === 0 || placeOrder.isPending) return;
    const refused = orderingBlock(view);
    if (refused) {
      setFailure({ kind: 'blocked', block: refused });
      return;
    }
    setFailure(null);

    const orderTabId = view.tabId;
    const lines = trayToOrderLines(tray, view.me.participantId);
    const outcome = await sendTray({
      tray,
      newCommandId,
      dispatch,
      isOnline: () => onlineManager.isOnline(),
      place: (clientCommandId) =>
        placeOrder.mutateAsync({ tabId: orderTabId, clientCommandId, lines }),
      nowMs: () => Date.now(),
    });

    if (outcome.ok) {
      // The confirmation carries the server's own order id and estimate, and it
      // is what the bar on the menu reads. Set only from a `PlaceOrderResult` —
      // never optimistically, and never assembled from the tray.
      setSent({
        estimatedReadyAtUtc: outcome.result.estimatedReadyAtUtc,
        wasReplay: outcome.result.wasReplay,
      });
      return;
    }

    // **The tray is not cleared on any of these paths.** Nothing was placed,
    // or nobody can tell yet; either way the items are still what this
    // person wants.
    const { error, kind } = outcome;

    if (error instanceof MenuItemUnavailableError) {
      // The menu is cached hard; the dish that just sold out must say so.
      void queryClient.invalidateQueries({ queryKey: orderKeys.menuDetail(view.branchId) });
      setFailure({ kind: 'soldOut', itemName: error.itemName });
      return;
    }
    // A waiter has not let the table in yet (a scan with no proved number):
    // not a failure, the waiting the tab screen already says.
    if (isTabAwaitingAdmission(error)) {
      void refetchTab();
      setFailure({ kind: 'blocked', block: 'awaitingAdmission' });
      return;
    }
    if (kind === 'forbidden' || kind === 'closing') {
      // No body on the 403: the tab read says why.
      const next = await refetchTab();
      const why = next.data ? orderingBlock(next.data) : null;
      if (why && kind === 'forbidden') {
        setFailure({ kind: 'blocked', block: why });
        return;
      }
    }
    setFailure({ kind: kind === 'soldOut' ? 'error' : kind });
  }

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (tabId) returnToTab(router, tabId);
  };

  if (sent) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <SuccessMark />
          <Text display style={styles.sentTitle} accessibilityRole="header">
            {t('tray.sent.title')}
          </Text>
          {/* Stated once, at order time. Worth more than a progress bar that
              creeps for twenty minutes and is wrong at the end of it. */}
          <Text style={styles.sentBody}>
            {sent.estimatedReadyAtUtc && view
              ? t('tray.sent.ready', {
                  time: formatTime(sent.estimatedReadyAtUtc, view.timeZoneId, locale),
                })
              : t('tray.sent.noEstimate')}
          </Text>
          {/* The resend after an unclear failure found the first one: say that
              it went once, so nobody asks a waiter to cancel a duplicate. */}
          {sent.wasReplay ? <Text style={styles.sentBody}>{t('tray.sent.replayed')}</Text> : null}
          <Button
            label={t('tray.sent.toTab')}
            size="large"
            onPress={() => returnToTab(router, tabId)}
            style={styles.sentAction}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <IconButton
            icon={actionIcon.back}
            onPress={goBack}
            accessibilityLabel={t('floorPlan.back')}
          />
          <Text display style={styles.title} accessibilityRole="header">
            {t('tray.title')}
          </Text>
        </View>

        {block ? <Text style={styles.blocked}>{t(orderingBlockKey(block))}</Text> : null}
        {locked ? <Text style={styles.blocked}>{t('tray.lockedHint')}</Text> : null}

        {count === 0 ? (
          <Text style={styles.muted}>{t('tray.empty')}</Text>
        ) : (
          tray.lines.map((line, index) => (
            <Rise key={line.key} delay={riseDelay(index)}>
              <Card radiusToken="hero" style={styles.line}>
                <View style={styles.lineHead}>
                  <Text style={styles.lineName}>{line.item.name}</Text>
                  <Text style={styles.lineTotal}>
                    {formatDram(line.item.priceDram * line.quantity, locale)}
                  </Text>
                </View>

                <View style={[styles.controls, frozen && styles.controlsLocked]}>
                  {/* A stepper on the line already added, never a dialog before
                    adding: two coffees is two taps, not a decision. */}
                  <View style={styles.stepper}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('tray.fewer')}
                      disabled={frozen}
                      onPress={() => dispatch({ type: 'decrement', key: line.key })}
                      style={({ pressed }) => [styles.stepButton, pressed && styles.stepPressed]}
                    >
                      <Ionicons name="remove" size={iconSize.md} color={colors.onPrimary} />
                    </Pressable>
                    <Text style={styles.quantity}>{line.quantity}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('tray.more')}
                      disabled={frozen}
                      onPress={() => dispatch({ type: 'increment', key: line.key })}
                      style={({ pressed }) => [styles.stepButton, pressed && styles.stepPressed]}
                    >
                      <Ionicons name="add" size={iconSize.md} color={colors.onPrimary} />
                    </Pressable>
                  </View>

                  <Chip
                    label={t('tray.shared')}
                    size="sm"
                    selected={line.isShared}
                    disabled={frozen}
                    onPress={() => dispatch({ type: 'toggleShared', key: line.key })}
                  />

                  <Chip
                    label={t('tray.note')}
                    size="sm"
                    selected={Boolean(line.note)}
                    disabled={frozen}
                    onPress={() => setNoteFor(noteFor === line.key ? null : line.key)}
                  />
                </View>

                {/* Explained the first time it is used, and "right now" is the
                  load-bearing word: the split is snapshotted when the order is
                  sent, so a friend who arrives later is not on it. */}
                {line.isShared && !tray.sharedExplained ? (
                  <Text style={styles.hint}>{t('tray.sharedExplained')}</Text>
                ) : null}

                {noteFor === line.key && !frozen ? (
                  <TextInput
                    style={styles.noteInput}
                    value={line.note}
                    autoFocus
                    placeholder={t('tray.notePlaceholder')}
                    placeholderTextColor={colors.textSubtle}
                    onChangeText={(note) => dispatch({ type: 'setNote', key: line.key, note })}
                    onBlur={() => setNoteFor(null)}
                  />
                ) : line.note ? (
                  <Text style={styles.note}>{line.note}</Text>
                ) : null}
              </Card>
            </Rise>
          ))
        )}

        {count > 0 ? (
          <View style={styles.totalRow}>
            {/* Labelled as the tray's own arithmetic, and never shown beside the
                tab's totals. These items have not been ordered: there is no
                service charge on them and no share to read from the server. */}
            <Text style={styles.totalLabel}>{t('tray.subtotal')}</Text>
            <Text display style={styles.totalValue}>
              {formatDram(subtotal, locale)}
            </Text>
          </View>
        ) : null}

        {failure ? (
          <View style={[styles.failure, failure.kind === 'uncertain' && styles.failureUnsure]}>
            <Text style={failure.kind === 'uncertain' ? styles.unsureText : styles.failureText}>
              {failure.kind === 'soldOut'
                ? // Named. "Something on your order has sold out" makes a person
                  // re-read six lines to work out which; the server told us.
                  t('tray.failed.soldOut', { item: failure.itemName })
                : t(failureKey(failure))}
            </Text>
            <Text style={styles.failureHint}>{t(failureHintKey(failure))}</Text>
            {failure.kind === 'closing' ? (
              <Button
                label={t('tray.failed.toBill')}
                fullWidth={false}
                onPress={() => returnToTab(router, tabId)}
                style={styles.failureAction}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {count > 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button
            label={
              placeOrder.isPending
                ? t('tray.sending')
                : locked
                  ? t('tray.failed.checkAgain')
                  : t('tray.send', { count })
            }
            size="large"
            disabled={cannotSend}
            busy={placeOrder.isPending}
            onPress={() => void send()}
          />
        </View>
      ) : null}
    </Screen>
  );
}

/** The sentence for a failure other than a sold-out dish, which names the dish. */
function failureKey(failure: Exclude<Failure, { kind: 'soldOut' }>): string {
  switch (failure.kind) {
    case 'blocked':
      return orderingBlockKey(failure.block);
    case 'closing':
      return 'tray.failed.closing';
    case 'ended':
      return 'tab.accessEnded.body';
    case 'forbidden':
      return 'tray.failed.forbidden';
    case 'offline':
      return 'tray.failed.offline';
    case 'uncertain':
      return 'tray.failed.uncertain';
    case 'error':
      return 'tray.failed.error';
  }
}

function failureHintKey(failure: Failure): string {
  switch (failure.kind) {
    case 'soldOut':
      return 'tray.failed.soldOutHint';
    case 'closing':
      return 'tray.failed.closingHint';
    case 'uncertain':
      return 'tray.failed.uncertainHint';
    case 'blocked':
    case 'ended':
    case 'forbidden':
      return 'tray.failed.notSent';
    case 'offline':
    case 'error':
      return 'tray.failed.askWaiter';
  }
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    gap: layout.cardGap,
    paddingBottom: space.xxxl,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  title: { flex: 1, fontSize: 24, lineHeight: 32, color: colors.text },
  muted: { ...typography.body, color: colors.textMuted },
  blocked: {
    padding: space.md,
    borderRadius: radius.tile,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
    color: colors.text,
  },

  line: { gap: space.sm, padding: space.md + 2 },
  lineHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  lineName: { flex: 1, ...typography.body, fontWeight: fontWeight.medium, color: colors.text },
  lineTotal: {
    ...typography.body,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    ...tabularNumbers,
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  controlsLocked: { opacity: 0.5 },
  // The menu's stepper: one brand pill, − n +.
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    ...shadows.brand,
  },
  stepButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  stepPressed: { backgroundColor: colors.brandPressed },
  quantity: {
    minWidth: 20,
    textAlign: 'center',
    ...typography.body,
    fontWeight: fontWeight.bold,
    color: colors.onPrimary,
    ...tabularNumbers,
  },
  hint: { ...typography.caption, color: colors.textMuted },
  note: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' },
  noteInput: {
    minHeight: layout.touchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
    color: colors.text,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: space.md,
    paddingHorizontal: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
  },
  totalLabel: { ...typography.body, color: colors.textMuted },
  totalValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: displayWeight.semibold,
    color: colors.primary,
    ...tabularNumbers,
  },

  // Tinted, not rimmed: red for a definite refusal, amber for "we cannot tell".
  failure: {
    gap: space.xs,
    padding: space.lg,
    borderRadius: radius.hero,
    backgroundColor: colors.errorSoft,
  },
  failureUnsure: { backgroundColor: colors.warningSoft },
  failureText: { ...typography.body, fontWeight: fontWeight.bold, color: colors.errorInk },
  unsureText: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  failureHint: { ...typography.body, color: colors.textMuted },
  failureAction: { marginTop: space.sm },

  footer: { paddingHorizontal: layout.screenPadding, paddingTop: space.md },
  sentTitle: {
    marginTop: space.sm,
    fontSize: 25,
    lineHeight: 32,
    color: colors.text,
    textAlign: 'center',
  },
  sentBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  sentAction: { alignSelf: 'stretch', marginTop: space.md },
});
