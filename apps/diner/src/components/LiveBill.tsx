import { isEndpointNotWired } from '@yalla/api';
import { formatDram, formatRelativeMinutes, minutesBetween } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space } from '@yalla/tokens';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { useDinerTab, useTabShares, useTabStream } from '../data/orderQueries';
import { useNow } from '../hooks/useNow';
import { projectTab, type RenderedLine } from '../tab/projection';

/**
 * The bill, as it grows.
 *
 * The screen the product is judged on after the floor plan, and the one where a
 * single careless render does real damage. Three rules run through it:
 *
 * 1. **Nothing changes without being said.** This was "nothing disappears",
 *    and the server does not allow it: `TabProjection` filters voided lines
 *    out of the diner's view, so a void really is a row vanishing and a total
 *    moving. What survives of the rule is the part that matters — the change is
 *    named, by dish, from the snapshot held before the refetch.
 * 2. **The service charge is its own line from the very first item.** Not
 *    revealed at the end and not folded into a total. Without the percentage
 *    beside it: no diner endpoint carries one.
 * 3. **Changes made by staff are announced, after the data they describe.**
 *    A total that moves with no explanation is the fastest way to lose
 *    somebody's trust; an explanation that arrives before the bill agrees with
 *    it is worse.
 *
 * What no longer renders, because no diner endpoint carries it: adjustment
 * rows with the manager's reason, void reasons, actor names, kitchen notes, and
 * how many ways a shared line splits.
 */

export interface LiveBillProps {
  readonly tabId: string;
  /**
   * The branch's zone, passed explicitly.
   *
   * Not on `TabView`, and never the device's: a tourist's phone on Moscow time
   * would render the kitchen's estimate three hours out.
   */
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

  const rendered = projectTab(tab, timeZoneId);
  const staleMinutes = Math.max(0, minutesBetween(dataUpdatedAt, now));

  // Everyone's lines when the host allows it, otherwise the caller's own. The
  // `null` is what says which case this is; `myLines` is never empty-by-policy.
  const lines = rendered.tableLines ?? rendered.myLines;
  const yourShareDram = shares?.yourShare?.shareDram ?? null;

  const removals = live.markers.filter((marker) => marker.type === 'lineVoided');
  const additions = live.markers.filter((marker) => marker.type !== 'lineVoided');

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

      {lines.length === 0 ? (
        <Text style={styles.muted}>{t('bill.empty')}</Text>
      ) : (
        <View style={styles.lines}>
          {lines.map((line) => (
            <Line key={line.id} line={line} />
          ))}
        </View>
      )}

      {/*
        Removals are announced here rather than on a line, because there is no
        line left to announce them on.

        `TabProjection` filters voided lines out of the diner's view, so a void
        arrives as a row that is simply gone and a total that has moved. The
        marker carries the name the phone held before the refetch, which is the
        only place that name still exists. It is deliberately not a strike-
        through: pretending the line is still on the bill would be inventing a
        row the server does not send.
      */}
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
          {/*
            Its own line, always — from the first item, not at checkout.

            The percentage is *not* stated beside it. It was, and it was a
            guess: the only view carrying a branch's service-charge percentage
            is `ReservationPolicyView`, which is `ManagerOrAbove`. A diner token
            cannot read it, so the label says what the charge is and not what
            rate produced it.
          */}
          <View style={styles.row}>
            <Text style={styles.totalLabel}>{t('bill.serviceCharge')}</Text>
            <Text style={styles.totalValue}>
              {formatDram(rendered.money.serviceChargeDram, locale)}
            </Text>
          </View>
          <View style={[styles.row, styles.grandRow]}>
            <Text style={styles.grandLabel}>{t('bill.total')}</Text>
            <Text style={styles.grandValue}>{formatDram(rendered.money.totalDram, locale)}</Text>
          </View>
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
          {/*
            No table total here, and deliberately not a zero or a dash either.
            The host has chosen to keep the table's total to themselves; a `0 ֏`
            would read as a free meal and a dash as a failure to load. Saying
            plainly what is and is not shown is the only honest option.

            This used to add "a N% service charge applies". It cannot: see the
            service-charge note above.
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
          // How many ways it splits is not on `TabLineView`; only that it does.
          line.isShared ? t('bill.shared') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
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
  grandRow: { paddingTop: space.xs },
  grandLabel: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  grandValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  yourShareLabel: { color: color.primary, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  yourShareValue: { color: color.primary, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  hidden: { color: color.mutedForeground, fontSize: fontSize.sm, lineHeight: lineHeight.sm },
});
