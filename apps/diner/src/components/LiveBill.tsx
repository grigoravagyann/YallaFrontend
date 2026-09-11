import { isTabAccessEnded } from '@yalla/api';
import { formatDram, formatRelativeMinutes, minutesBetween } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space } from '@yalla/tokens';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useDinerTab, useTabShares, useTabStream } from '../data/orderQueries';
import { useNow } from '../hooks/useNow';
import {
  paymentRows,
  projectTab,
  type RenderedAdjustment,
  type RenderedLine,
} from '../tab/projection';

/**
 * The bill, as it grows.
 *
 * The screen the product is judged on after the floor plan, and the one where a
 * single careless render does real damage. Four rules run through it:
 *
 * 1. **Nothing disappears without being said.** The server keeps a voided line
 *    on the bill, marked, with the reason staff gave; it is drawn struck
 *    through with "removed by staff: <reason>", never as a live item at `0 ֏`.
 *    A void that just happened is also announced by name, from the snapshot
 *    held before the refetch.
 * 2. **The service charge is its own line from the very first item**, with the
 *    venue's rate beside it — on the hidden-total branch too.
 * 3. **A total that moves has a row that says why.** Comps and discounts are
 *    listed under the lines with the reason the manager typed.
 * 4. **Once money has changed hands, what is left leads.** Paid and remaining
 *    rows, so a table that has handed over cash is not told it owes it all.
 */

export interface LiveBillProps {
  readonly tabId: string;
  /** The branch's zone, from the tab. Never the device's. */
  readonly timeZoneId: string;
  /** False while pending approval, so the stream is not started needlessly. */
  readonly active: boolean;
}

export function LiveBill({ tabId, timeZoneId, active }: LiveBillProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();

  const { data: tab, isLoading, isError, error, dataUpdatedAt, isPaused } = useDinerTab(tabId);
  // Who owes what comes from `/shares`, which is the only endpoint that
  // attributes a share to the caller. The tab read carries the table aggregate
  // and nothing per-person.
  const { data: shares } = useTabShares(tabId);
  // Seeded from the tab read's own `maxSequence`, so the stream reads events
  // from where the tab stands instead of never reading any at all.
  const live = useTabStream(tabId, active, tab?.maxSequence);
  // The clock as something this subscribes to rather than reads during render,
  // so "last updated four minutes ago" actually keeps counting while a stale
  // bill sits on screen.
  const now = useNow(15_000);

  if (isLoading && !tab) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('bill.title')}</Text>
        <Text style={styles.muted}>{t('bill.loading')}</Text>
      </View>
    );
  }

  if (!tab) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('bill.title')}</Text>
        <Text style={styles.muted}>
          {isTabAccessEnded(error)
            ? t('tab.accessEnded.body')
            : isError
              ? t('bill.error')
              : t('bill.empty')}
        </Text>
      </View>
    );
  }

  const rendered = projectTab(tab, timeZoneId);
  const staleMinutes = Math.max(0, minutesBetween(dataUpdatedAt, now));
  const payments = paymentRows(rendered.money);

  // Everyone's lines when the host allows it, otherwise the caller's own. The
  // `null` is what says which case this is; `myLines` is never empty-by-policy.
  const lines = rendered.tableLines ?? rendered.myLines;
  const yourShareDram = shares?.yourShare?.shareDram ?? null;
  const rate = rendered.serviceChargePercent;

  const removals = live.markers.filter((marker) => marker.type === 'lineVoided');
  const additions = live.markers.filter((marker) => marker.type !== 'lineVoided');

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('bill.title')}</Text>
        {/* Honest about whether this is live: "Up to date" only once a page of
            events has actually come back. */}
        <Text style={[styles.status, isPaused && styles.statusStale]}>
          {isPaused
            ? t('bill.stale', { ago: formatRelativeMinutes(-staleMinutes, locale) })
            : live.unavailable
              ? t('bill.notLive')
              : live.connected
                ? t('bill.live')
                : t('bill.connecting')}
        </Text>
      </View>

      {lines.length === 0 ? (
        <Text style={styles.muted}>{t('bill.empty')}</Text>
      ) : (
        <View style={styles.lines}>
          {lines.map((line) => (
            <Line key={line.id} line={line} />
          ))}
        </View>
      )}

      {rendered.adjustments.length > 0 ? (
        <View style={styles.lines}>
          {rendered.adjustments.map((adjustment) => (
            <Adjustment key={adjustment.id} adjustment={adjustment} />
          ))}
        </View>
      ) : null}

      {/* A change staff just made, announced once by name. The voided line
          itself stays on the bill above, struck through. */}
      {removals.length > 0 ? (
        <View style={styles.removals}>
          {removals.map((marker) => (
            <Text key={marker.sequence} style={styles.removed}>
              {marker.lineName
                ? t('bill.marker.removedNamed', {
                    item: marker.lineName,
                    name: marker.actorName ?? t('bill.staff'),
                  })
                : t('bill.marker.removed', { name: marker.actorName ?? t('bill.staff') })}
            </Text>
          ))}
        </View>
      ) : null}

      {additions.length > 0 ? (
        <View style={styles.removals}>
          {additions.map((marker) => (
            <Text key={marker.sequence} style={styles.marker}>
              {t('bill.marker.added', { name: marker.actorName ?? t('bill.staff') })}
            </Text>
          ))}
        </View>
      ) : null}

      {rendered.money.kind === 'table' ? (
        <View style={styles.totals}>
          <View style={styles.row}>
            <Text style={styles.totalLabel}>{t('bill.subtotal')}</Text>
            <Text style={styles.totalValue}>{formatDram(rendered.money.subtotalDram, locale)}</Text>
          </View>
          {/* Its own line, always — from the first item, not at checkout — and
              with the venue's rate, which the tab now carries for everyone. */}
          <View style={styles.row}>
            <Text style={styles.totalLabel}>
              {rate > 0 ? t('bill.serviceChargeRate', { percent: rate }) : t('bill.serviceCharge')}
            </Text>
            <Text style={styles.totalValue}>
              {formatDram(rendered.money.serviceChargeDram, locale)}
            </Text>
          </View>
          <View style={[styles.row, payments ? null : styles.grandRow]}>
            <Text style={payments ? styles.totalLabel : styles.grandLabel}>{t('bill.total')}</Text>
            <Text style={payments ? styles.totalValue : styles.grandValue}>
              {formatDram(rendered.money.totalDram, locale)}
            </Text>
          </View>
          {payments ? (
            <>
              <View style={styles.row}>
                <Text style={styles.totalLabel}>{t('bill.paid')}</Text>
                <Text style={styles.paidValue}>{formatDram(payments.paidDram, locale)}</Text>
              </View>
              <View style={[styles.row, styles.grandRow]}>
                <Text style={styles.grandLabel}>{t('bill.remaining')}</Text>
                <Text style={styles.grandValue}>{formatDram(payments.remainingDram, locale)}</Text>
              </View>
            </>
          ) : null}
          {/* From the shares endpoint, which is where the server attributes it.
              `TabView` carries no per-participant share. */}
          {yourShareDram !== null ? (
            <View style={styles.row}>
              <Text style={styles.yourShareLabel}>{t('bill.yourShare')}</Text>
              <Text style={styles.yourShareValue}>{formatDram(yourShareDram, locale)}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.totals}>
          <View style={[styles.row, styles.grandRow]}>
            <Text style={styles.grandLabel}>{t('bill.yourItems')}</Text>
            <Text style={styles.grandValue}>
              {formatDram(rendered.money.yourItemsSubtotalDram, locale)}
            </Text>
          </View>
          {yourShareDram !== null ? (
            <View style={styles.row}>
              <Text style={styles.yourShareLabel}>{t('bill.yourShare')}</Text>
              <Text style={styles.yourShareValue}>{formatDram(yourShareDram, locale)}</Text>
            </View>
          ) : null}
          {rate > 0 ? (
            <Text style={styles.hidden}>{t('bill.serviceChargeApplies', { percent: rate })}</Text>
          ) : null}
          {/*
            No table total here, and deliberately not a zero or a dash either.
            The host has chosen to keep the table's total to themselves; a `0 ֏`
            would read as a free meal and a dash as a failure to load. Saying
            plainly what is and is not shown is the only honest option.
          */}
          <Text style={styles.hidden}>{t('bill.hiddenTotal')}</Text>
        </View>
      )}
    </View>
  );
}

function Line({ line }: { readonly line: RenderedLine }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();

  if (line.isVoided) {
    return (
      <View style={styles.line}>
        <View style={styles.row}>
          <Text style={[styles.lineName, styles.struck]}>
            {line.quantity}× {line.name}
          </Text>
          <Text style={[styles.lineAmount, styles.struck]}>{formatDram(0, locale)}</Text>
        </View>
        <Text style={styles.voided}>
          {line.voidReason
            ? t('bill.removedBy', { reason: line.voidReason })
            : t('bill.removedNoReason')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.line}>
      <View style={styles.row}>
        <Text style={styles.lineName}>
          {line.quantity}× {line.name}
        </Text>
        <Text style={styles.lineAmount}>{formatDram(line.lineTotalDram, locale)}</Text>
      </View>

      <Text style={styles.lineMeta}>
        {[
          line.isMine
            ? t('bill.yours')
            : line.orderedByName
              ? t('bill.orderedBy', { name: line.orderedByName })
              : t('bill.forTheTable'),
          // How many ways it splits, from the snapshot taken when it was ordered.
          line.isShared
            ? line.sharedWithCount > 1
              ? t('bill.sharedWays', { count: line.sharedWithCount })
              : t('bill.shared')
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {line.note ? <Text style={styles.lineNote}>{line.note}</Text> : null}
    </View>
  );
}

function Adjustment({ adjustment }: { readonly adjustment: RenderedAdjustment }) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  return (
    <View style={styles.adjustment}>
      <View style={styles.row}>
        <Text style={styles.adjustmentName}>{t(`bill.adjustment.${adjustment.kind}`)}</Text>
        <Text style={styles.adjustmentAmount}>−{formatDram(adjustment.reductionDram, locale)}</Text>
      </View>
      {adjustment.reason ? <Text style={styles.reason}>{adjustment.reason}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderSoft,
    backgroundColor: color.surface,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  title: { fontSize: fontSize.lg, lineHeight: lineHeight.lg, fontWeight: fontWeight.bold },
  status: { color: color.mutedForeground, fontSize: fontSize.xs },
  statusStale: { color: color.danger, fontWeight: fontWeight.bold },
  muted: { color: color.mutedForeground, fontSize: fontSize.md, lineHeight: lineHeight.md },

  lines: { gap: space.md },
  removals: { gap: 2 },
  removed: { color: color.danger, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
  line: { gap: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  lineName: { flex: 1, fontSize: fontSize.md, lineHeight: lineHeight.md },
  lineAmount: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  struck: { textDecorationLine: 'line-through', color: color.mutedForeground },
  lineMeta: { color: color.subtleForeground, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  lineNote: { color: color.mutedForeground, fontSize: fontSize.xs, fontStyle: 'italic' },
  voided: { color: color.danger, fontSize: fontSize.xs, lineHeight: lineHeight.xs },
  marker: {
    marginTop: 2,
    color: color.info,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },

  adjustment: {
    gap: 2,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.borderSoft,
  },
  adjustmentName: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
  adjustmentAmount: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.success },
  reason: { color: color.mutedForeground, fontSize: fontSize.xs, lineHeight: lineHeight.xs },

  totals: {
    gap: space.xs,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  totalLabel: { color: color.mutedForeground, fontSize: fontSize.md },
  totalValue: { fontSize: fontSize.md },
  paidValue: { fontSize: fontSize.md, color: color.success },
  grandRow: { paddingTop: space.xs },
  grandLabel: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  grandValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  yourShareLabel: { color: color.primaryInk, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  yourShareValue: { color: color.primaryInk, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  hidden: { color: color.mutedForeground, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
});
