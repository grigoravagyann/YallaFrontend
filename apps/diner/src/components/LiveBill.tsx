import { isEndpointNotWired } from '@yalla/api';
import { formatDram, formatRelativeMinutes, minutesBetween } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space } from '@yalla/tokens';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useDinerTab, useTabStream } from '../data/orderQueries';
import { useNow } from '../hooks/useNow';
import { projectTab, type RenderedLine } from '../tab/projection';
import type { ChangeMarker } from '../tab/events';

/**
 * The bill, as it grows.
 *
 * The screen the product is judged on after the floor plan, and the one where a
 * single careless render does real damage. Three rules run through it:
 *
 * 1. **Nothing disappears.** A line a waiter voided is struck through and
 *    labelled with the reason, and an adjustment is its own row with the
 *    manager's words on it. A bill somebody is watching that quietly shrinks is
 *    a bill they stop believing.
 * 2. **The service charge is its own line from the very first item.** Not
 *    revealed at the end, not folded into a total, and with the branch's
 *    percentage stated beside it.
 * 3. **Changes made by staff are announced.** A total that moves with no
 *    explanation is the fastest way to lose somebody's trust in the app.
 */

export interface LiveBillProps {
  readonly tabId: string;
  readonly participantId: string;
  /** False while pending approval, so the stream is not started needlessly. */
  readonly active: boolean;
}

export function LiveBill({ tabId, participantId, active }: LiveBillProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();

  const { data: tab, isLoading, isError, error, dataUpdatedAt, isPaused } = useDinerTab(tabId);
  const live = useTabStream(tabId, active);
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
          {isEndpointNotWired(error)
            ? t('bill.notWired')
            : isError
              ? t('bill.error')
              : t('bill.empty')}
        </Text>
      </View>
    );
  }

  const rendered = projectTab(tab, participantId);
  const staleMinutes = Math.max(0, minutesBetween(dataUpdatedAt, now));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('bill.title')}</Text>
        {/* Honest about whether this is live. A bill that looks current and is
            forty seconds behind is worse than one that says it is catching up. */}
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

      {rendered.lines.length === 0 ? (
        <Text style={styles.muted}>{t('bill.empty')}</Text>
      ) : (
        <View style={styles.lines}>
          {rendered.lines.map((line) => (
            <Line key={line.id} line={line} markers={live.markers} />
          ))}
        </View>
      )}

      {rendered.adjustments.map((adjustment) => (
        <View key={adjustment.id} style={styles.adjustment}>
          <View style={styles.row}>
            <Text style={styles.adjustmentName}>{t(`bill.adjustment.${adjustment.kind}`)}</Text>
            <Text style={styles.adjustmentAmount}>
              −{formatDram(adjustment.reductionDram, locale)}
            </Text>
          </View>
          <Text style={styles.reason}>
            {adjustment.byName
              ? t('bill.adjustedBy', { reason: adjustment.reason, name: adjustment.byName })
              : adjustment.reason}
          </Text>
        </View>
      ))}

      {rendered.money.kind === 'table' ? (
        <View style={styles.totals}>
          <View style={styles.row}>
            <Text style={styles.totalLabel}>{t('bill.subtotal')}</Text>
            <Text style={styles.totalValue}>{formatDram(rendered.money.subtotalDram, locale)}</Text>
          </View>
          {/* Its own line, always — from the first item, not at checkout. */}
          <View style={styles.row}>
            <Text style={styles.totalLabel}>
              {t('bill.serviceCharge', { percent: rendered.money.serviceChargePercent })}
            </Text>
            <Text style={styles.totalValue}>
              {formatDram(rendered.money.serviceChargeDram, locale)}
            </Text>
          </View>
          <View style={[styles.row, styles.grandRow]}>
            <Text style={styles.grandLabel}>{t('bill.total')}</Text>
            <Text style={styles.grandValue}>{formatDram(rendered.money.totalDram, locale)}</Text>
          </View>
          {rendered.money.yourShareDram !== null ? (
            <View style={styles.row}>
              <Text style={styles.yourShareLabel}>{t('bill.yourShare')}</Text>
              <Text style={styles.yourShareValue}>
                {formatDram(rendered.money.yourShareDram, locale)}
              </Text>
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
          {/*
            No table total here, and deliberately not a zero or a dash either.
            The host has chosen to keep the table's total to themselves; a `0 ֏`
            would read as a free meal and a dash as a failure to load. Saying
            plainly what is and is not shown is the only honest option, and the
            service-charge percentage is a fact about the venue rather than an
            aggregate, so it can still be stated.
          */}
          <Text style={styles.hidden}>
            {t('bill.hiddenTotal', { percent: rendered.money.serviceChargePercent })}
          </Text>
        </View>
      )}
    </View>
  );
}

function Line({
  line,
  markers,
}: {
  readonly line: RenderedLine;
  readonly markers: readonly ChangeMarker[];
}) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();

  const marker = markers.find((candidate) => candidate.lineId === line.id);

  return (
    <View style={styles.line}>
      <View style={styles.row}>
        <Text style={[styles.lineName, line.isVoided && styles.struck]}>
          {line.quantity}× {line.name}
        </Text>
        <Text style={[styles.lineAmount, line.isVoided && styles.struck]}>
          {formatDram(line.lineTotalDram, locale)}
        </Text>
      </View>

      <Text style={styles.lineMeta}>
        {[
          line.isMine
            ? t('bill.yours')
            : line.orderedByName
              ? t('bill.orderedBy', { name: line.orderedByName })
              : t('bill.forTheTable'),
          line.isShared ? t('bill.sharedWays', { count: line.sharedWithCount }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>

      {line.note ? <Text style={styles.lineNote}>{line.note}</Text> : null}

      {line.isVoided ? (
        <Text style={styles.voided}>
          {line.voidedByName
            ? t('bill.removedBy', { name: line.voidedByName, reason: line.voidReason ?? '' })
            : t('bill.removed', { reason: line.voidReason ?? '' })}
        </Text>
      ) : null}

      {/* A brief inline marker, long enough to read. Without it a diner sees a
          total move and has no idea why. */}
      {marker ? (
        <Text style={styles.marker}>
          {marker.type === 'lineVoided'
            ? t('bill.marker.removed', { name: marker.actorName ?? t('bill.staff') })
            : t('bill.marker.added', { name: marker.actorName ?? t('bill.staff') })}
        </Text>
      ) : null}
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
  grandRow: { paddingTop: space.xs },
  grandLabel: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  grandValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  yourShareLabel: { color: color.primary, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  yourShareValue: { color: color.primary, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  hidden: { color: color.mutedForeground, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
});
