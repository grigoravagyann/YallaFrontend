import {
  isTabAccessEnded,
  SETTLEMENT_MODES,
  type ParticipantShare,
  type SettlementMode,
} from '@yalla/api';
import { formatDram, type Locale } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
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
import { Text } from '../../../src/components/Text';
import { CallWaiterSheet } from '../../../src/components/CallWaiterSheet';
import { useDinerTab, useSetSettlementMode, useTabShares } from '../../../src/data/orderQueries';
import { newCommandId } from '../../../src/lib/commandId';
import { settlementModeFailureKey, withHost } from '../../../src/tab/settle';

/**
 * Settling up, as far as it goes today.
 *
 * **There is no payment rail and no "Pay" button.** Cash is how a bill closes,
 * and cash closes on the waiter's tablet. Written as a deliberate flow rather
 * than an apology: most of the pilot will run this way regardless, and a table
 * working out who hands over what needs the numbers far more than it needs a
 * card form.
 *
 * So the settle path is: see what you owe — and what has already been paid —
 * then ask for the waiter.
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t('settle.title')}</Text>

        {/* The host picks how the bill splits, in the words a person would use
            rather than the enum names. Nothing is shown selected until the tab
            has been read: a default drawn while loading named a mode this tab
            may not use. */}
        {!view ? (
          <View style={styles.card}>
            <ActivityIndicator color={color.primaryInk} />
          </View>
        ) : isHost ? (
          <View style={styles.card}>
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
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('settle.shares.title')}</Text>
          <Text style={styles.muted}>{t('settle.shares.body')}</Text>

          {isLoading ? (
            <ActivityIndicator color={color.primaryInk} />
          ) : isError || !shares ? (
            <Text style={styles.muted}>
              {isTabAccessEnded(error) ? t('tab.accessEnded.body') : t('settle.error')}
            </Text>
          ) : shares.kind !== 'table' ? (
            // The host has hidden the table total: no aggregate and nobody
            // else's share is in the body. This person's own share still is,
            // and on the screen for "what do I owe" it is the thing to show.
            <View style={styles.shares}>
              {shares.yourShare ? <ShareRow share={shares.yourShare} locale={locale} /> : null}
              <Text style={styles.muted}>{t('settle.shares.hidden')}</Text>
            </View>
          ) : (
            <View style={styles.shares}>
              {shares.shares.map((share) => (
                <ShareRow key={share.participantId} share={share} locale={locale} />
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
                    <Text style={styles.remainingLabel}>{t('bill.remaining')}</Text>
                    <Text style={styles.remainingValue}>
                      {formatDram(shares.totals.remainingDram, locale)}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          )}
        </View>

        {/* Not a fallback. Cash is a first-class way to pay here, and the app's
            job is to make the numbers clear and then get somebody to the table. */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('settle.pay.title')}</Text>
          <Text style={styles.payBody}>{t('settle.pay.body')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setWaiterOpen(true)}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>{t('settle.pay.askForBill')}</Text>
          </Pressable>
        </View>

        {isHost ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/tab/[tabId]/people', params: { tabId } })}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>{t('settle.people')}</Text>
          </Pressable>
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
function ShareRow({ share, locale }: { share: ParticipantShare; locale: Locale }) {
  const { t } = useTranslation('diner');
  return (
    <View style={styles.shareRow}>
      <View style={styles.shareWho}>
        <Text style={styles.shareName}>
          {share.displayName || t('settle.unnamed')}
          {share.isHost ? ` · ${t('settle.host')}` : ''}
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
  safeArea: { flex: 1, backgroundColor: color.paper },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.xxxl },
  title: { fontSize: fontSize.xl, lineHeight: lineHeight.xl, fontWeight: fontWeight.bold },
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.surface,
  },
  cardTitle: { fontSize: fontSize.lg, lineHeight: lineHeight.lg, fontWeight: fontWeight.bold },
  muted: { color: color.mutedForeground, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  error: { color: color.danger, fontSize: fontSize.sm, lineHeight: lineHeight.sm },

  option: {
    gap: 2,
    padding: space.md,
    borderRadius: radius.soft,
    borderWidth: 2,
    borderColor: color.borderStrong,
  },
  optionOn: { borderColor: color.primaryInk, backgroundColor: color.greenTint },
  optionLocked: { opacity: 0.6 },
  optionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  optionTitleOn: { color: color.primaryInk },
  optionBody: { color: color.mutedForeground, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  optionBodyOn: { color: color.foreground },

  shares: { gap: space.md, paddingTop: space.sm },
  shareRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  shareWho: { flex: 1, gap: 2 },
  shareName: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  shareBreakdown: {
    color: color.subtleForeground,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
  },
  sharePaid: { color: color.success, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  shareAmount: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  shareTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  shareTotalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  shareTotalLabel: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  shareTotalValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  remainingLabel: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  remainingValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },

  payBody: { color: color.foreground, fontSize: fontSize.md, lineHeight: lineHeight.md },
  primary: {
    minHeight: touchTarget.large,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    marginTop: space.sm,
  },
  primaryText: {
    color: color.primaryForeground,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  secondary: {
    minHeight: touchTarget.regular,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: color.primaryInk,
  },
  secondaryText: { color: color.primaryInk, fontWeight: fontWeight.bold },
});
