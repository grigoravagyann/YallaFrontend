import { MenuItemUnavailableError } from '@yalla/api';
import { formatDram, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../../../src/components/Text';
import { orderKeys, useDinerTab, usePlaceOrder } from '../../../src/data/orderQueries';
import { newCommandId } from '../../../src/lib/commandId';
import { useTray } from '../../../src/order/TrayProvider';
import {
  commandFor,
  trayItemCount,
  trayLocked,
  traySubtotalDram,
  trayToOrderLines,
} from '../../../src/order/tray';
import {
  orderFailureKind,
  orderingBlock,
  orderingBlockKey,
  type OrderFailure,
  type OrderingBlock,
} from '../../../src/tab/ordering';

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
 * - `uncertain` — a timeout, a 5xx, or a connection that dropped while online.
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

  async function send(): Promise<void> {
    if (!view || count === 0 || placeOrder.isPending) return;
    const refused = orderingBlock(view);
    if (refused) {
      setFailure({ kind: 'blocked', block: refused });
      return;
    }
    setFailure(null);

    // The same id for the same contents, so a resend cannot place it twice.
    const { commandId, fingerprint } = commandFor(tray, newCommandId);
    dispatch({ type: 'sending', commandId, fingerprint });

    try {
      const result = await placeOrder.mutateAsync({
        tabId: view.tabId,
        clientCommandId: commandId,
        lines: trayToOrderLines(tray, view.me.participantId),
      });
      // The confirmation carries the server's own order id and estimate, and it
      // is what the bar on the menu reads. Set only from a `PlaceOrderResult` —
      // never optimistically, and never assembled from the tray.
      dispatch({
        type: 'sent',
        order: {
          orderId: result.orderId,
          estimatedReadyAtUtc: result.estimatedReadyAtUtc,
          atMs: Date.now(),
        },
      });
      setSent({ estimatedReadyAtUtc: result.estimatedReadyAtUtc, wasReplay: result.wasReplay });
    } catch (error) {
      // **The tray is not cleared on any of these paths.** Nothing was placed,
      // or nobody can tell yet; either way the items are still what this
      // person wants.
      const kind = orderFailureKind(error, onlineManager.isOnline());
      dispatch({ type: 'sendFailed', uncertain: kind === 'uncertain' });

      if (error instanceof MenuItemUnavailableError) {
        // The menu is cached hard; the dish that just sold out must say so.
        void queryClient.invalidateQueries({ queryKey: orderKeys.menuDetail(view.branchId) });
        setFailure({ kind: 'soldOut', itemName: error.itemName });
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
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: true, title: '' }} />
        <View style={styles.centered}>
          <Text style={styles.sentTitle}>{t('tray.sent.title')}</Text>
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
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace({ pathname: '/tab/[tabId]', params: { tabId } })}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>{t('tray.sent.toTab')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t('tray.title')}</Text>

        {block ? <Text style={styles.blocked}>{t(orderingBlockKey(block))}</Text> : null}
        {locked ? <Text style={styles.blocked}>{t('tray.lockedHint')}</Text> : null}

        {count === 0 ? (
          <Text style={styles.muted}>{t('tray.empty')}</Text>
        ) : (
          tray.lines.map((line) => (
            <View key={line.key} style={styles.line}>
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
                    style={styles.stepButton}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.quantity}>{line.quantity}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('tray.more')}
                    disabled={frozen}
                    onPress={() => dispatch({ type: 'increment', key: line.key })}
                    style={styles.stepButton}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: line.isShared, disabled: frozen }}
                  disabled={frozen}
                  onPress={() => dispatch({ type: 'toggleShared', key: line.key })}
                  style={[styles.tag, line.isShared && styles.tagOn]}
                >
                  <Text style={[styles.tagText, line.isShared && styles.tagTextOn]}>
                    {t('tray.shared')}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={frozen}
                  onPress={() => setNoteFor(noteFor === line.key ? null : line.key)}
                  style={[styles.tag, Boolean(line.note) && styles.tagOn]}
                >
                  <Text style={[styles.tagText, Boolean(line.note) && styles.tagTextOn]}>
                    {t('tray.note')}
                  </Text>
                </Pressable>
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
                  placeholderTextColor={color.subtleForeground}
                  onChangeText={(note) => dispatch({ type: 'setNote', key: line.key, note })}
                  onBlur={() => setNoteFor(null)}
                />
              ) : line.note ? (
                <Text style={styles.note}>{line.note}</Text>
              ) : null}
            </View>
          ))
        )}

        {count > 0 ? (
          <View style={styles.totalRow}>
            {/* Labelled as the tray's own arithmetic, and never shown beside the
                tab's totals. These items have not been ordered: there is no
                service charge on them and no share to read from the server. */}
            <Text style={styles.totalLabel}>{t('tray.subtotal')}</Text>
            <Text style={styles.totalValue}>{formatDram(subtotal, locale)}</Text>
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
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace({ pathname: '/tab/[tabId]', params: { tabId } })}
                style={styles.failureAction}
              >
                <Text style={styles.failureActionText}>{t('tray.failed.toBill')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {count > 0 ? (
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: placeOrder.isPending || block !== null || !view }}
            disabled={placeOrder.isPending || block !== null || !view}
            onPress={() => void send()}
            style={[
              styles.primary,
              (placeOrder.isPending || block !== null || !view) && styles.primaryBusy,
            ]}
          >
            <Text style={styles.primaryText}>
              {placeOrder.isPending
                ? t('tray.sending')
                : locked
                  ? t('tray.failed.checkAgain')
                  : t('tray.send', { count })}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
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
  safeArea: { flex: 1, backgroundColor: color.paper },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    padding: space.xl,
  },
  title: { fontSize: fontSize.xl, lineHeight: lineHeight.xl, fontWeight: fontWeight.bold },
  muted: { color: color.mutedForeground, fontSize: fontSize.md, lineHeight: lineHeight.md },
  blocked: {
    padding: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderStrong,
    color: color.foreground,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },

  line: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.surface,
  },
  lineHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  lineName: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  lineTotal: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  controlsLocked: { opacity: 0.5 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepButton: {
    width: touchTarget.regular,
    height: touchTarget.regular,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.primaryInk,
  },
  stepText: { color: color.primaryInk, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  quantity: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  tag: {
    minHeight: touchTarget.small,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.borderStrong,
  },
  tagOn: { backgroundColor: color.primary, borderColor: color.primaryInk },
  tagText: { color: color.foreground, fontSize: fontSize.sm },
  tagTextOn: { color: color.primaryForeground, fontWeight: fontWeight.bold },
  hint: { color: color.mutedForeground, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  note: { color: color.mutedForeground, fontSize: fontSize.sm, fontStyle: 'italic' },
  noteInput: {
    minHeight: touchTarget.regular,
    paddingHorizontal: space.md,
    borderRadius: radius.soft,
    borderWidth: 1,
    borderColor: color.border,
    color: color.foreground,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
  },
  totalLabel: { color: color.mutedForeground, fontSize: fontSize.md },
  totalValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },

  failure: {
    gap: space.xs,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: color.danger,
  },
  failureUnsure: { borderColor: color.warning },
  failureText: { color: color.danger, fontWeight: fontWeight.bold, lineHeight: lineHeight.md },
  unsureText: { color: color.foreground, fontWeight: fontWeight.bold, lineHeight: lineHeight.md },
  failureHint: { color: color.mutedForeground, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  failureAction: {
    marginTop: space.sm,
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  failureActionText: { color: color.primaryForeground, fontWeight: fontWeight.bold },

  footer: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
    backgroundColor: color.surface,
  },
  primary: {
    minHeight: touchTarget.large,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  primaryBusy: { opacity: 0.6 },
  primaryText: {
    color: color.primaryForeground,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  sentTitle: {
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  sentBody: {
    color: color.mutedForeground,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    textAlign: 'center',
  },
});
