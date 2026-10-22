import { ForbiddenError, type BillScope, type DinerTabView } from '@yalla/api';
import { formatDram, type Locale } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTabShares } from '../../data/orderQueries';
import { useCallWaiter } from '../../data/queries';
import { newCommandId } from '../../lib/commandId';
import { haptics } from '../../lib/haptics';
import { tabAccessCopy } from '../../tab/access';
import {
  billRequestEnded,
  useBillRequests,
  useRequestedBill,
  type RequestedBill,
} from '../../tab/billRequest';
import {
  DEFAULT_TIP_PERCENT,
  TIP_PERCENTS,
  billRequestFailure,
  othersHaveShares,
  payPreview,
  payScopes,
  pickScope,
  type BillRequestFailure,
  type PayLine,
  type TipPercent,
} from '../../tab/payBill';
import {
  actionIcon,
  colors,
  displayWeight,
  fontWeight,
  radius,
  space,
  tabularNumbers,
  typography,
} from '../../theme';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { CountUp } from '../motion/CountUp';
import { Rise } from '../motion/Rise';
import { SheetModal } from '../motion/SheetModal';
import { SlidingChoice, type SlidingOption } from '../motion/SlidingChoice';
import { SuccessMark } from '../motion/SuccessMark';
import { Text } from '../Text';

export interface PaySheetProps {
  readonly tabId: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  /**
   * The tab as last read. Its status and event position travel with the
   * request, so the "bill requested" state knows what ends it.
   */
  readonly tab: Pick<DinerTabView, 'status' | 'maxSequence' | 'serviceChargePercent'> | undefined;
  /** Open the full split. Left out where the sheet is opened from that screen. */
  readonly onShowShares?: (() => void) | undefined;
}

/**
 * Paying, as far as the app takes it: choose what you pay and the tip, and a
 * waiter brings the bill to the table.
 *
 * The app takes no money — the waiter does, at the table — and the sheet says
 * so. What it does is make the number clear before anybody asks for it: the
 * whole bill or this person's share, from the same split the settle screen
 * shows, and a tip on top. "Pay X" asks the floor for the bill with that scope
 * and tip; the server works out the amounts, and the success state shows its
 * figures, not the phone's.
 */
export function PaySheet({ tabId, visible, onClose, tab, onShowShares }: PaySheetProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const shares = useTabShares(tabId);
  const call = useCallWaiter();
  const requestedBill = useBillRequests((state) => state.requested);
  const stored = useRequestedBill(tabId);
  // Not once the tab has moved past it, even before the tab screen clears it.
  const requested = stored && !(tab && billRequestEnded(stored, tab.status)) ? stored : null;

  const [chosen, setChosen] = useState<BillScope | null>(null);
  const [tip, setTip] = useState<TipPercent>(DEFAULT_TIP_PERCENT);
  const [failure, setFailure] = useState<BillRequestFailure | null>(null);

  // A fresh choice every time it opens; cleared on the way in, so what was
  // shown stays put while the sheet slides away.
  const [shown, setShown] = useState(visible);
  if (visible !== shown) {
    setShown(visible);
    if (visible) {
      setChosen(null);
      setTip(DEFAULT_TIP_PERCENT);
      setFailure(null);
    }
  }

  // The split as it stands now, not as it stood when the tab screen opened.
  const { refetch } = shares;
  useEffect(() => {
    if (visible) void refetch();
  }, [visible, refetch]);

  const scopes = payScopes(shares.data);
  const scope = pickScope(scopes, chosen);
  const preview = scope ? payPreview(shares.data, scope, tip) : null;

  const send = async () => {
    if (!scope || !preview || !tab) return;
    setFailure(null);
    try {
      const answer = await call.mutateAsync({
        tabId,
        reason: 'bill',
        commandId: newCommandId(),
        bill: { scope, tipPercent: tip },
      });
      haptics.success();
      requestedBill({
        tabId,
        requestId: answer.id,
        bill: answer.bill,
        requestedAtUtc: answer.requestedAtUtc,
        statusAtRequest: tab.status,
        afterSequence: tab.maxSequence,
      });
    } catch (caught) {
      const why = billRequestFailure(caught);
      setFailure(why);
      // Nothing left on that scope, or the whole bill no longer this person's
      // to ask for (the host hid the total): the split moved under the sheet.
      if (why.key === 'tab.pay.nothingLeft' || caught instanceof ForbiddenError) void refetch();
    }
  };

  /** A row's words: the rate beside the service charge, the percent beside the tip. */
  const lineLabel = (line: PayLine): string => {
    const rate = tab?.serviceChargePercent ?? 0;
    switch (line.kind) {
      case 'subtotal':
        return t('bill.subtotal');
      case 'service':
        return rate > 0 ? t('bill.serviceChargeRate', { percent: rate }) : t('bill.serviceCharge');
      case 'myItems':
        return t('bill.yourItems');
      case 'myShared':
        return t('tab.pay.myShared');
      case 'absorbed':
        return t('tab.pay.absorbed');
      case 'discount':
        return t('bill.adjustment.discount');
      case 'paid':
        return t('bill.paid');
      case 'tip':
        return t('tab.pay.tipLine', { percent: tip });
    }
  };

  const scopeOptions: readonly SlidingOption<BillScope>[] = scopes.map((value) => ({
    value,
    label: t(`tab.pay.scope.${value}`),
  }));
  const tipOptions: readonly SlidingOption<`${TipPercent}`>[] = TIP_PERCENTS.map((percent) => ({
    value: `${percent}`,
    label: t('tab.pay.tipOption', { percent }),
    ...(percent === 0 ? { accessibilityLabel: t('tab.pay.noTip') } : {}),
  }));

  return (
    <SheetModal
      visible={visible}
      onRequestClose={onClose}
      closeLabel={t('waiter.close')}
      accessibilityLabel={t('tab.pay.title')}
    >
      <View style={styles.head}>
        <Text display style={styles.title} accessibilityRole="header">
          {t('tab.pay.title')}
        </Text>
        <IconButton
          icon={actionIcon.close}
          accessibilityLabel={t('waiter.close')}
          onPress={onClose}
        />
      </View>

      {requested ? (
        <SentView request={requested} locale={locale} onDone={onClose} />
      ) : shares.isLoading && !shares.data ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !shares.data ? (
        <Text style={styles.error} accessibilityRole="alert">
          {t(tabAccessCopy(shares.error)?.body ?? 'settle.error')}
        </Text>
      ) : !scope || !preview ? (
        <Text style={styles.muted}>{t('tab.pay.nothingLeft')}</Text>
      ) : (
        <>
          {scopeOptions.length > 1 ? (
            <View style={styles.modes}>
              <SlidingChoice
                options={scopeOptions}
                value={scope}
                onChange={(next) => {
                  setChosen(next);
                  setFailure(null);
                  haptics.select();
                }}
                columns={2}
                gap={space.xs}
                inTrack
                accessibilityLabel={t('tab.pay.what')}
              />
            </View>
          ) : (
            <Text style={styles.scopeOnly}>{t(`tab.pay.scope.${scope}`)}</Text>
          )}

          <View style={styles.lines}>
            {preview.lines.map((line) => (
              <View key={line.kind} style={styles.line}>
                <Text style={styles.lineLabel}>{lineLabel(line)}</Text>
                <Text style={styles.lineValue}>
                  {line.kind === 'paid' || line.kind === 'discount'
                    ? `−${formatDram(line.amountDram, locale)}`
                    : formatDram(line.amountDram, locale)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.tipBlock}>
            <Text style={styles.tipHead}>{t('tab.pay.tip')}</Text>
            <SlidingChoice
              options={tipOptions}
              value={`${tip}`}
              onChange={(next) => {
                setTip(Number(next) as TipPercent);
                haptics.select();
              }}
              columns={TIP_PERCENTS.length}
              gap={space.xs + 2}
              accessibilityLabel={t('tab.pay.tip')}
            />
          </View>

          <View style={styles.rule} />

          <View style={styles.totalRow} accessibilityLiveRegion="polite">
            <Text style={styles.totalLabel}>{t('tab.pay.youPay')}</Text>
            <CountUp
              display
              value={preview.totalDram}
              format={(amount) => formatDram(amount, locale)}
              style={styles.totalValue}
            />
          </View>
          {scope === 'mine' && othersHaveShares(shares.data) ? (
            <Text style={styles.note}>{t('tab.pay.othersNote')}</Text>
          ) : null}

          {failure ? (
            <Text
              style={
                failure.key === 'waiter.rateLimited' || failure.key === 'waiter.rateLimitedNoWindow'
                  ? styles.notice
                  : styles.error
              }
              accessibilityRole="alert"
            >
              {'count' in failure ? t(failure.key, { count: failure.count }) : t(failure.key)}
            </Text>
          ) : null}

          <Button
            label={t('tab.pay.cta', { amount: formatDram(preview.totalDram, locale) })}
            size="large"
            busy={call.isPending}
            disabled={call.isPending || !tab}
            onPress={() => void send()}
          />
          <Text style={styles.how}>{t('tab.pay.how')}</Text>
        </>
      )}

      {onShowShares ? (
        <Button label={t('settle.shares.title')} variant="text" onPress={onShowShares} />
      ) : null}
    </SheetModal>
  );
}

/**
 * The floor has it: a check, what the waiter is bringing in the server's own
 * figures, and that the money changes hands at the table.
 */
function SentView({
  request,
  locale,
  onDone,
}: {
  readonly request: RequestedBill;
  readonly locale: Locale;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation('diner');
  const bill = request.bill;
  const detail = bill
    ? [
        t(`tab.pay.scope.${bill.scope}`),
        bill.tipDram > 0
          ? t('tab.pay.sent.breakdown', {
              amount: formatDram(bill.amountDram, locale),
              tip: formatDram(bill.tipDram, locale),
            })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <View style={styles.sent}>
      <SuccessMark size={SENT_MARK} />
      <Rise delay={120}>
        <Text display style={styles.sentTitle} accessibilityRole="alert">
          {t('tab.pay.sent.title')}
        </Text>
      </Rise>
      {bill ? (
        <Rise delay={180} style={styles.sentFigures}>
          <Text display style={styles.sentAmount}>
            {formatDram(bill.amountDram + bill.tipDram, locale)}
          </Text>
          {detail ? <Text style={styles.sentDetail}>{detail}</Text> : null}
        </Rise>
      ) : null}
      <Rise delay={220}>
        <Text style={styles.sentBody}>{t('tab.pay.sent.body')}</Text>
      </Rise>
      <Button label={t('booking.done')} size="large" onPress={onDone} style={styles.sentDone} />
    </View>
  );
}

const SENT_MARK = 64;

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 19, lineHeight: 26, color: colors.text, flexShrink: 1 },
  loading: { paddingVertical: space.xl, alignItems: 'center' },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.errorInk },
  notice: { ...typography.body, fontWeight: fontWeight.medium, color: colors.successInk },

  // One glass track under both choices, the brown thumb sliding along it.
  modes: {
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeOnly: { ...typography.body, fontWeight: fontWeight.medium, color: colors.textMuted },

  lines: { gap: space.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  lineLabel: { ...typography.body, color: colors.textMuted, flexShrink: 1 },
  lineValue: { ...typography.body, color: colors.text, ...tabularNumbers },

  tipBlock: { gap: space.sm },
  tipHead: { ...typography.body, fontWeight: fontWeight.medium, color: colors.text },

  rule: { height: 1, backgroundColor: colors.borderStrong },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  totalLabel: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  totalValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: displayWeight.semibold,
    color: colors.primary,
    ...tabularNumbers,
  },
  note: { ...typography.caption, color: colors.textMuted, marginTop: -space.xs - 2 },
  how: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

  sent: { alignItems: 'center', gap: space.sm, paddingTop: space.xs },
  sentTitle: { fontSize: 20, lineHeight: 28, color: colors.text, textAlign: 'center' },
  sentFigures: { alignItems: 'center', gap: 2 },
  sentAmount: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: displayWeight.semibold,
    color: colors.primary,
    ...tabularNumbers,
  },
  sentDetail: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    ...tabularNumbers,
  },
  sentBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  sentDone: { alignSelf: 'stretch', marginTop: space.sm },
});
