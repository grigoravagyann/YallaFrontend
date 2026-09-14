import {
  isTabAccessEnded,
  SETTLEMENT_MODES,
  type ParticipantShare,
  type SettlementMode,
} from '@yalla/api';
import { formatDram, type Locale } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
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
import { Card } from '../../../src/components/Card';
import { Text } from '../../../src/components/Text';
import { useDinerTab, useSetSettlementMode, useTabShares } from '../../../src/data/orderQueries';
import { newCommandId } from '../../../src/lib/commandId';
import { settleLead } from '../../../src/lib/settleLead';
import { settlementModeFailureKey, withHost } from '../../../src/tab/settle';
import { colors, fontWeight, radius, space, tabularNumbers, typography } from '../../../src/theme';

/**
 * Settling up, as far as it goes today.
 *
 * **There is no payment rail and no "Pay" button.** Cash is how a bill closes,
 * and cash closes on the waiter's tablet. Written as a deliberate flow rather
 * than an apology: most of the pilot will run this way regardless, and a table
 * working out who hands over what needs the numbers far more than it needs a
 * card form.
 *
 * So the screen leads with the one number a table at the end of a meal wants —
 * what is still to pay — then how it splits, then who owes what, then the one
 * press that brings the bill over.
 */
export default function SettleScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const { data: view } = useDinerTab(tabId);
  const { data: rawShares, isLoading, isError, error } = useTabShares(tabId);
  const setMode = useSetSettlementMode();

  const [waiterOpen, setWaiterOpen] = useState(false);

  // The role from the tab the server described. `/shares` cannot say who
  // hosts, so the host is marked from the tab's own `hostParticipantId`.
  const isHost = view?.me.role === 'host' && view.me.status === 'approved';
  const shares = rawShares && view ? withHost(rawShares, view.hostParticipantId) : rawShares;

  // The table's totals are on the body only when the host lets everyone see
  // them; otherwise the number that leads is this person's own share.
  const lead = settleLead(shares);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text display style={styles.title}>
          {t('settle.title')}
        </Text>

        {/* Not while the last read failed: React Query keeps the previous
            answer through an error, and a 40px number over "could not load"
            reads as current. The card below says what happened instead. */}
        {lead && !isError ? (
          <View
            style={styles.lead}
            accessible
            accessibilityRole="header"
            accessibilityLabel={`${t(lead.labelKey)}: ${formatDram(lead.amount, locale)}`}
          >
            <Text style={styles.leadLabel}>{t(lead.labelKey)}</Text>
            <Text style={styles.leadAmount}>{formatDram(lead.amount, locale)}</Text>
            {lead.total !== null && lead.paid !== null ? (
              <Text style={styles.leadOf}>
                {lead.paid > 0
                  ? t('settle.remainingOf', {
                      total: formatDram(lead.total, locale),
                      paid: formatDram(lead.paid, locale),
                    })
                  : t('settle.nothingPaidYet')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* The host picks how the bill splits, in the words a person would use
            rather than the enum names. Nothing is shown selected until the tab
            has been read: a default drawn while loading named a mode this tab
            may not use. */}
        {!view ? (
          <Card style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </Card>
        ) : isHost ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('settle.mode.title')}</Text>
            {SETTLEMENT_MODES.map((option: SettlementMode) => {
              const selected = option === view.settlementMode;
              const locked = view.settlementModeLocked;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: locked }}
                  disabled={locked || setMode.isPending}
                  onPress={() =>
                    setMode.mutate({
                      tabId: view.tabId,
                      mode: option,
                      clientCommandId: newCommandId(),
                    })
                  }
                  style={[
                    styles.option,
                    selected && styles.optionOn,
                    locked && styles.optionLocked,
                  ]}
                >
                  <Text style={[styles.optionTitle, selected && styles.optionTitleOn]}>
                    {t(`settle.mode.${option}.title`)}
                  </Text>
                  <Text style={[styles.optionBody, selected && styles.optionBodyOn]}>
                    {t(`settle.mode.${option}.body`)}
                  </Text>
                </Pressable>
              );
            })}
            {view.settlementModeLocked ? (
              <Text style={styles.muted}>{t('settle.mode.locked')}</Text>
            ) : null}
            {/* A refused change is said. It used to vanish: no handler, nothing
                rendered, and the host tapped again and again. */}
            {setMode.error ? (
              <Text style={styles.error}>{t(settlementModeFailureKey(setMode.error))}</Text>
            ) : null}
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('settle.shares.title')}</Text>
          <Text style={styles.muted}>{t('settle.shares.body')}</Text>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : isError || !shares ? (
            <Text style={styles.muted}>
              {isTabAccessEnded(error) ? t('tab.accessEnded.body') : t('settle.error')}
            </Text>
          ) : shares.kind !== 'table' ? (
            // The host has hidden the table total: no aggregate and nobody
            // else's share is in the body. This person's own share still is,
            // and on the screen for "what do I owe" it is the thing to show.
            <View style={styles.shares}>
              {shares.yourShare ? (
                <ShareRow share={shares.yourShare} locale={locale} first isYou />
              ) : null}
              <Text style={styles.muted}>{t('settle.shares.hidden')}</Text>
            </View>
          ) : (
            <View style={styles.shares}>
              {shares.shares.map((share, i) => (
                <ShareRow
                  key={share.participantId}
                  share={share}
                  locale={locale}
                  first={i === 0}
                  isYou={share.participantId === view?.me.participantId}
                />
              ))}
              <View style={styles.shareTotal}>
                <Text style={styles.shareTotalLabel}>{t('settle.shares.total')}</Text>
                <Text style={styles.shareTotalValue}>
                  {formatDram(shares.totals.totalDram, locale)}
                </Text>
              </View>
              {/* Once money has changed hands the table needs what is left,
                  not the whole bill stated again as owed. */}
              {shares.totals.paidDram > 0 ? (
                <>
                  <View style={styles.shareTotalRow}>
                    <Text style={styles.shareTotalLabel}>{t('bill.paid')}</Text>
                    <Text style={styles.shareTotalLabel}>
                      {formatDram(shares.totals.paidDram, locale)}
                    </Text>
                  </View>
                  <View style={styles.shareTotalRow}>
                    <Text style={styles.remaining}>{t('bill.remaining')}</Text>
                    <Text style={styles.remaining}>
                      {formatDram(shares.totals.remainingDram, locale)}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          )}
        </Card>

        {/* Not a fallback. Cash is a first-class way to pay here, and the app's
            job is to make the numbers clear and then get somebody to the table. */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t('settle.pay.title')}</Text>
          <Text style={styles.payBody}>{t('settle.pay.body')}</Text>
          <Button
            label={t('settle.pay.askForBill')}
            size="large"
            onPress={() => setWaiterOpen(true)}
            style={styles.askForBill}
          />
        </Card>

        {isHost ? (
          <Button
            label={t('settle.people')}
            variant="outline"
            onPress={() => router.push({ pathname: '/tab/[tabId]/people', params: { tabId } })}
          />
        ) : null}
      </ScrollView>

      <CallWaiterSheet
        tabId={tabId}
        visible={waiterOpen}
        onClose={() => setWaiterOpen(false)}
        initialReason="bill"
        tableLabel={view?.tableLabel}
      />
    </SafeAreaView>
  );
}

/** One person's share: what it is made of, and what they have already paid. */
function ShareRow({
  share,
  locale,
  first,
  isYou = false,
}: {
  share: ParticipantShare;
  locale: Locale;
  first: boolean;
  /** This phone's own share: an unnamed one reads "You", not "Someone at the table". */
  isYou?: boolean;
}) {
  const { t } = useTranslation('diner');
  // The name the person gave on the way in or on the tab; the table reads the
  // rows by who is sitting there, not by a participant id.
  const name = share.displayName.trim() || (isYou ? t('tab.youName') : t('settle.unnamed'));
  return (
    <View style={[styles.shareRow, !first && styles.shareRowRuled]}>
      <View style={styles.shareWho}>
        <Text style={styles.shareName}>
          {name}
          {share.isHost ? `, ${t('settle.host')}` : ''}
        </Text>
        {/* Shared items and the service charge are already in the number;
            saying so is what stops the table adding it up again by hand and
            getting a different answer. */}
        <Text style={styles.shareBreakdown}>
          {t('settle.shares.breakdown', {
            own: formatDram(share.ownItemsDram, locale),
            shared: formatDram(share.sharedItemsDram, locale),
            service: formatDram(share.serviceChargeDram, locale),
          })}
        </Text>
        {share.absorbedFromRemovedDram > 0 ? (
          <Text style={styles.shareBreakdown}>
            {t('settle.shares.absorbed', {
              amount: formatDram(share.absorbedFromRemovedDram, locale),
            })}
          </Text>
        ) : null}
        {/* Reported beside the share, never netted off it — as the server does. */}
        {share.paidDram > 0 ? (
          <Text style={styles.sharePaid}>
            {t('settle.shares.paid', { amount: formatDram(share.paidDram, locale) })}
          </Text>
        ) : null}
      </View>
      <Text style={styles.shareAmount}>{formatDram(share.shareDram, locale)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxxl },
  title: { ...typography.title, color: colors.text },
  // The hero number: the one figure read from further away than anything
  // else on the screen.
  lead: { gap: 2, paddingBottom: space.xs },
  leadLabel: { ...typography.body, color: colors.textMuted },
  leadAmount: { ...typography.metric, color: colors.text, ...tabularNumbers },
  leadOf: { ...typography.body, color: colors.textMuted, ...tabularNumbers },
  card: { gap: space.sm },
  cardTitle: { ...typography.h3, color: colors.text },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.errorInk },

  option: {
    gap: 2,
    padding: space.md,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionLocked: { opacity: 0.6 },
  optionTitle: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text },
  optionTitleOn: { color: colors.primary },
  optionBody: { ...typography.body, color: colors.textMuted },
  optionBodyOn: { color: colors.text },

  shares: { paddingTop: space.xs },
  shareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.md,
  },
  shareRowRuled: { borderTopWidth: 1, borderTopColor: colors.border },
  shareWho: { flex: 1, gap: 2 },
  shareName: { ...typography.bodyLg, fontWeight: fontWeight.medium, color: colors.text },
  shareBreakdown: { ...typography.caption, color: colors.textMuted, ...tabularNumbers },
  sharePaid: { ...typography.caption, color: colors.successInk, ...tabularNumbers },
  shareAmount: { ...typography.h3, color: colors.text, ...tabularNumbers },
  shareTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
  },
  shareTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space.xs },
  shareTotalLabel: {
    ...typography.bodyLg,
    fontWeight: fontWeight.medium,
    color: colors.text,
    ...tabularNumbers,
  },
  shareTotalValue: {
    ...typography.bodyLg,
    fontWeight: fontWeight.bold,
    color: colors.text,
    ...tabularNumbers,
  },
  remaining: { ...typography.h3, color: colors.text, ...tabularNumbers },

  payBody: { ...typography.bodyLg, color: colors.text },
  askForBill: { marginTop: space.xs },
});
