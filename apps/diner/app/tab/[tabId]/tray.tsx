import { isEndpointNotWired, isOffline } from '@yalla/api';
import { formatDram, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../../../src/components/Text';
import { usePlaceOrder } from '../../../src/data/orderQueries';
import { useTab } from '../../../src/data/queries';
import { newCommandId } from '../../../src/lib/commandId';
import { useTray } from '../../../src/order/TrayProvider';
import { trayItemCount, traySubtotalDram, trayToOrderLines } from '../../../src/order/tray';

/**
 * The tray, reviewed and sent.
 *
 * One order for everything in it. Sending is the only thing on this screen that
 * touches the server, and it is deliberately unforgiving about what it claims:
 * the button is disabled while the request is in flight, there is **no
 * optimistic success**, and a failure says the order was not placed. A diner who
 * believes food is coming and finds out in twenty minutes that it never was is
 * far worse off than one told immediately.
 */
export default function TrayScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const { data: tab } = useTab(tabId);
  const { state: tray, dispatch } = useTray();
  const placeOrder = usePlaceOrder();

  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [sent, setSent] = useState<{ readonly estimatedReadyAtUtc: string | null } | null>(null);
  const [failure, setFailure] = useState<'offline' | 'notWired' | 'error' | null>(null);

  /**
   * One id per tap on send, reused if that same send is retried.
   *
   * Regenerating it on retry is how a lost response becomes a second round of
   * drinks; it is cleared only once the server has accepted the order.
   */
  const commandId = useRef<string | null>(null);

  const count = trayItemCount(tray);
  const subtotal = traySubtotalDram(tray);

  async function send(): Promise<void> {
    if (!tab || count === 0 || placeOrder.isPending) return;
    setFailure(null);
    commandId.current ??= newCommandId();

    try {
      const result = await placeOrder.mutateAsync({
        tabId: tab.id,
        clientCommandId: commandId.current,
        lines: trayToOrderLines(tray, tab.yourParticipantId),
      });
      commandId.current = null;
      dispatch({ type: 'clear' });
      setSent({ estimatedReadyAtUtc: result.estimatedReadyAtUtc });
    } catch (error) {
      // Not queued, and said plainly. This is the opposite of the staff app's
      // rule and for a stated reason: a waiter is standing in the room and can
      // reconcile a late order, a diner on a phone cannot.
      setFailure(isOffline(error) ? 'offline' : isEndpointNotWired(error) ? 'notWired' : 'error');
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
            {sent.estimatedReadyAtUtc && tab
              ? t('tray.sent.ready', {
                  time: formatTime(sent.estimatedReadyAtUtc, tab.timeZoneId, locale),
                })
              : t('tray.sent.noEstimate')}
          </Text>
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

              <View style={styles.controls}>
                {/* A stepper on the line already added, never a dialog before
                    adding: two coffees is two taps, not a decision. */}
                <View style={styles.stepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('tray.fewer')}
                    onPress={() => dispatch({ type: 'decrement', key: line.key })}
                    style={styles.stepButton}
                  >
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.quantity}>{line.quantity}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('tray.more')}
                    onPress={() => dispatch({ type: 'increment', key: line.key })}
                    style={styles.stepButton}
                  >
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: line.isShared }}
                  onPress={() => dispatch({ type: 'toggleShared', key: line.key })}
                  style={[styles.tag, line.isShared && styles.tagOn]}
                >
                  <Text style={[styles.tagText, line.isShared && styles.tagTextOn]}>
                    {t('tray.shared')}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
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

              {noteFor === line.key ? (
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
          <View style={styles.failure}>
            <Text style={styles.failureText}>
              {failure === 'offline'
                ? t('tray.failed.offline')
                : failure === 'notWired'
                  ? t('tray.failed.notWired')
                  : t('tray.failed.error')}
            </Text>
            <Text style={styles.failureHint}>{t('tray.failed.askWaiter')}</Text>
          </View>
        ) : null}
      </ScrollView>

      {count > 0 ? (
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: placeOrder.isPending }}
            disabled={placeOrder.isPending}
            onPress={() => void send()}
            style={[styles.primary, placeOrder.isPending && styles.primaryBusy]}
          >
            <Text style={styles.primaryText}>
              {placeOrder.isPending ? t('tray.sending') : t('tray.send', { count })}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
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
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepButton: {
    width: touchTarget.regular,
    height: touchTarget.regular,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.primary,
  },
  stepText: { color: color.primary, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
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
  tagOn: { backgroundColor: color.primary, borderColor: color.primary },
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
  failureText: { color: color.danger, fontWeight: fontWeight.bold, lineHeight: lineHeight.md },
  failureHint: { color: color.mutedForeground, fontSize: fontSize.sm, lineHeight: lineHeight.sm },

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
