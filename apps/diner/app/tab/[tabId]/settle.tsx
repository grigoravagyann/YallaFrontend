import { isEndpointNotWired, SETTLEMENT_MODES, type SettlementMode } from '@yalla/api';
import { formatDram } from '@yalla/format';
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
import { useTab } from '../../../src/data/queries';
import { newCommandId } from '../../../src/lib/commandId';

/**
 * Settling up, as far as it goes today.
 *
 * **There is no payment rail and no "Pay" button.** Cash is how a bill closes,
 * and cash closes on the waiter's tablet. Written as a deliberate flow rather
 * than an apology: most of the pilot will run this way regardless, and a table
 * working out who hands over what needs the numbers far more than it needs a
 * card form.
 *
 * So the settle path is: see what you owe, then ask for the waiter.
 */
export default function SettleScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const { tabId } = useLocalSearchParams<{ tabId: string }>();

  const { data: tab } = useTab(tabId);
  const { data: view } = useDinerTab(tabId);
  const { data: shares, isLoading, isError, error } = useTabShares(tabId);
  const setMode = useSetSettlementMode();

  const [waiterOpen, setWaiterOpen] = useState(false);

  const isHost = tab?.yourRole === 'host' && tab.yourStatus === 'active';
  const locked = view?.settlementModeLocked ?? false;
  const mode = view?.settlementMode ?? 'everyonePaysOwnItems';

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t('settle.title')}</Text>

        {/* The host picks how the bill splits, in the words a person would use
            rather than the enum names. Changeable until the first payment
            lands — after that, re-apportioning what somebody already paid is
            not something a tap should be able to do. */}
        {isHost ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('settle.mode.title')}</Text>
            {SETTLEMENT_MODES.map((option: SettlementMode) => {
              const selected = option === mode;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: locked }}
                  disabled={locked || setMode.isPending}
                  onPress={() =>
                    setMode.mutate({ tabId, mode: option, clientCommandId: newCommandId() })
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
            {locked ? <Text style={styles.muted}>{t('settle.mode.locked')}</Text> : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('settle.shares.title')}</Text>
          <Text style={styles.muted}>{t('settle.shares.body')}</Text>

          {isLoading ? (
            <ActivityIndicator color={color.primary} />
          ) : isError || !shares ? (
            <Text style={styles.muted}>
              {isEndpointNotWired(error) ? t('settle.notWired') : t('settle.error')}
            </Text>
          ) : shares.kind !== 'table' ? (
            // The host has hidden the table total, so the server sent no
            // aggregate at all — the members are absent from the body, not
            // zeroed. Narrowing is the only way to reach them, which is what
            // stops a hidden total being drawn as a settled bill.
            <Text style={styles.muted}>{t('settle.shares.hidden')}</Text>
          ) : (
            <View style={styles.shares}>
              {shares.shares.map((share) => (
                <View key={share.participantId} style={styles.shareRow}>
                  <View style={styles.shareWho}>
                    <Text style={styles.shareName}>
                      {share.displayName ?? t('settle.unnamed')}
                      {share.isHost ? ` · ${t('settle.host')}` : ''}
                    </Text>
                    {/* Shared items and the service charge are already in the
                        number; saying so is what stops the table adding it up
                        again by hand and getting a different answer. */}
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
                  </View>
                  <Text style={styles.shareAmount}>{formatDram(share.shareDram, locale)}</Text>
                </View>
              ))}
              <View style={styles.shareTotal}>
                <Text style={styles.shareTotalLabel}>{t('settle.shares.total')}</Text>
                <Text style={styles.shareTotalValue}>
                  {formatDram(shares.totals.totalDram, locale)}
                </Text>
              </View>
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
        tableLabel={tab?.tableLabel}
      />
    </SafeAreaView>
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

  option: {
    gap: 2,
    padding: space.md,
    borderRadius: radius.soft,
    borderWidth: 2,
    borderColor: color.borderStrong,
  },
  optionOn: { borderColor: color.primary, backgroundColor: color.greenTint },
  optionLocked: { opacity: 0.6 },
  optionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
  optionTitleOn: { color: color.primary },
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
  shareAmount: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  shareTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  shareTotalLabel: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  shareTotalValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold },

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
    borderColor: color.primary,
  },
  secondaryText: { color: color.primary, fontWeight: fontWeight.bold },
});
