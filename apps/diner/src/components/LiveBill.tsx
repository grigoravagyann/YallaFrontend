import type { DinerTabLine, OrderStatus } from '@yalla/api';
import { formatDram, formatRelativeMinutes, minutesBetween, type Locale } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import {
  colors,
  displayWeight,
  fontWeight,
  layout,
  radius,
  space,
  tabularNumbers,
  typography,
  lineBadge,
} from '../theme';
import { Badge } from './Badge';
import { Card } from './Card';
import { Rise, riseDelay } from './motion/Rise';
import { useToast } from './motion/Toast';
import { Skeleton } from './Skeleton';
import { CountUp } from './motion/CountUp';
import { Text } from './Text';
import { useDinerTab, useTabShares, useTabStream } from '../data/orderQueries';
import { useNow } from '../hooks/useNow';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { tabAccessCopy } from '../tab/access';
import type { ChangeMarker } from '../tab/events';
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
 *
 * Laid out as two cards: "Orders", one row per line with where the kitchen is
 * with it, and the totals, whose bottom figure rolls to its new value when the
 * bill moves.
 */

export interface LiveBillProps {
  readonly tabId: string;
  /** The branch's zone, from the tab. Never the device's. */
  readonly timeZoneId: string;
  /** False while pending approval, so the stream is not started needlessly. */
  readonly active: boolean;
  /**
   * The last order this phone sent and the server accepted (the tray's
   * `lastSent`). Its lines are never announced as the waiter's, even when a
   * waiter's order lands in the same refetch.
   */
  readonly ownOrderId?: string | null;
}

/** How long after a line appears a waiter's "order placed" event may still claim it. */
const CLAIM_WINDOW_MS = 15_000;

export function LiveBill({ tabId, timeZoneId, active, ownOrderId = null }: LiveBillProps) {
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

  const rawLines = tab ? (tab.tableLines ?? tab.myLines) : null;
  const staff = useStaffAdditions(rawLines, live.markers, ownOrderId);

  if (isLoading && !tab) {
    return (
      <View style={styles.root}>
        <OrdersHead status={t('bill.loading')} />
        <Card padded={false} radiusToken="hero" style={styles.skeletonCard}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="50%" height={12} />
          <Skeleton width="62%" height={14} />
        </Card>
      </View>
    );
  }

  if (!tab) {
    return (
      <View style={styles.root}>
        <OrdersHead />
        <Card radiusToken="hero">
          <Text style={styles.muted}>
            {t(tabAccessCopy(error)?.body ?? (isError ? 'bill.error' : 'bill.empty'))}
          </Text>
        </Card>
      </View>
    );
  }

  const rendered = projectTab(tab, timeZoneId);
  const staleMinutes = Math.max(0, minutesBetween(dataUpdatedAt, now));
  const payments = paymentRows(rendered.money);
  // Where the kitchen is with each line. The projection does not carry it, so
  // it is read off the tab's own lines by id.
  const statusById = new Map((rawLines ?? []).map((line) => [line.id, line.orderStatus]));

  // Everyone's lines when the host allows it, otherwise the caller's own. The
  // `null` is what says which case this is; `myLines` is never empty-by-policy.
  const lines = rendered.tableLines ?? rendered.myLines;
  const yourShareDram = shares?.yourShare?.shareDram ?? null;
  const rate = rendered.serviceChargePercent;

  const removals = live.markers.filter((marker) => marker.type === 'lineVoided');
  // A waiter's order whose lines are on screen is told by the toast and the
  // glow on those rows. One whose lines this person cannot see, and a comp,
  // still get a line of their own here.
  const additions = live.markers.filter(
    (marker) =>
      marker.type !== 'lineVoided' &&
      (marker.type !== 'orderPlaced' || staff.unmatched.has(marker.sequence)),
  );

  return (
    <View style={styles.root}>
      {/* Honest about whether this is live: "Up to date" only once a page of
          events has actually come back. */}
      <OrdersHead
        stale={isPaused}
        status={
          isPaused
            ? t('bill.stale', { ago: formatRelativeMinutes(-staleMinutes, locale) })
            : live.unavailable
              ? t('bill.notLive')
              : live.connected
                ? t('bill.live')
                : t('bill.connecting')
        }
      />

      <Card padded={false} radiusToken="hero">
        <View style={styles.rowsClip}>
          {lines.length === 0 && rendered.adjustments.length === 0 ? (
            <Text style={[styles.muted, styles.emptyRow]}>{t('bill.empty')}</Text>
          ) : null}
          {lines.map((line, i) => (
            <Rise key={line.id} delay={staff.initial?.has(line.id) ? riseDelay(i) : 0}>
              <LineRow
                line={line}
                status={statusById.get(line.id) ?? null}
                ruled={i > 0}
                fresh={staff.fresh.has(line.id)}
                locale={locale}
              />
            </Rise>
          ))}
          {rendered.adjustments.map((adjustment, i) => (
            <AdjustmentRow
              key={adjustment.id}
              adjustment={adjustment}
              ruled={lines.length > 0 || i > 0}
              locale={locale}
            />
          ))}
        </View>
      </Card>

      {/* A change staff just made, announced once by name. The voided line
          itself stays on the bill above, struck through. */}
      {removals.length > 0 || additions.length > 0 ? (
        <View style={styles.markers}>
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
          {additions.map((marker) => (
            <Text key={marker.sequence} style={styles.marker}>
              {t('bill.marker.added', { name: marker.actorName ?? t('bill.staff') })}
            </Text>
          ))}
        </View>
      ) : null}

      {rendered.money.kind === 'table' ? (
        <Card radiusToken="hero" style={styles.totals}>
          <MoneyRow
            label={t('bill.subtotal')}
            value={formatDram(rendered.money.subtotalDram, locale)}
          />
          {/* Its own line, always — from the first item, not at checkout — and
              with the venue's rate, which the tab now carries for everyone. */}
          <MoneyRow
            label={
              rate > 0 ? t('bill.serviceChargeRate', { percent: rate }) : t('bill.serviceCharge')
            }
            value={formatDram(rendered.money.serviceChargeDram, locale)}
          />
          {payments ? (
            <>
              <MoneyRow
                label={t('bill.total')}
                value={formatDram(rendered.money.totalDram, locale)}
              />
              <MoneyRow
                label={t('bill.paid')}
                value={formatDram(payments.paidDram, locale)}
                valueStyle={styles.paidValue}
              />
            </>
          ) : null}
          <View style={styles.divider} />
          <GrandRow
            label={payments ? t('bill.remaining') : t('bill.total')}
            value={payments ? payments.remainingDram : rendered.money.totalDram}
            locale={locale}
          />
          {/* From the shares endpoint, which is where the server attributes it.
              `TabView` carries no per-participant share. */}
          {yourShareDram !== null ? <YourShareRow amount={yourShareDram} locale={locale} /> : null}
        </Card>
      ) : (
        <Card radiusToken="hero" style={styles.totals}>
          <GrandRow
            label={t('bill.yourItems')}
            value={rendered.money.yourItemsSubtotalDram}
            locale={locale}
          />
          {yourShareDram !== null ? <YourShareRow amount={yourShareDram} locale={locale} /> : null}
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
        </Card>
      )}
    </View>
  );
}

/**
 * Which rows a waiter just added, and saying so once.
 *
 * The stream's markers say *that* staff placed an order, not which lines it
 * brought: an `orderPlaced` event names the order, and the marker is raised
 * only after the refetch that drew the new lines has landed. So the lines that
 * appear after the first read are remembered as they arrive, and a staff
 * marker claims the ones that came in shortly before it — never one on an
 * order this phone itself sent, because a diner's own order is not news to
 * them. Claimed lines glow and are named in a toast; a marker that finds none
 * (its lines are hidden from this person) is left for the plain
 * "Just added by" line.
 */
function useStaffAdditions(
  lines: readonly DinerTabLine[] | null,
  markers: readonly ChangeMarker[],
  ownOrderId: string | null,
) {
  const { t } = useTranslation('diner');
  const showToast = useToast((state) => state.show);

  // The bill as it stood at the first read. Nothing on it is news, and those
  // rows rise in one after another; anything later rises on its own.
  const [initial, setInitial] = useState<ReadonlySet<string> | null>(null);
  if (lines && initial === null) setInitial(new Set(lines.map((line) => line.id)));

  const seen = useRef<Set<string> | null>(null);
  const appeared = useRef(new Map<string, number>());
  const handled = useRef(new Set<number>());
  const ownOrders = useRef(new Set<string>());
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [unmatched, setUnmatched] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    if (ownOrderId) ownOrders.current.add(ownOrderId);
  }, [ownOrderId]);

  useEffect(() => {
    if (!lines) return;
    if (seen.current === null) {
      seen.current = new Set(lines.map((line) => line.id));
      return;
    }
    const at = Date.now();
    for (const line of lines) {
      if (seen.current.has(line.id)) continue;
      seen.current.add(line.id);
      appeared.current.set(line.id, at);
    }
  }, [lines]);

  useEffect(() => {
    if (!lines) return;
    const placed = markers.filter(
      (marker) => marker.type === 'orderPlaced' && !handled.current.has(marker.sequence),
    );
    if (placed.length === 0) return;
    const at = Date.now();
    // The event names the order it placed: the waiter's lines are exactly
    // that order's. Only a marker without one (an older server) falls back to
    // "appeared in the last few seconds", and even then never claims a line
    // a diner ordered, so another guest's order is not credited to the waiter.
    const placedOrders = new Set(
      placed.flatMap((marker) => (marker.orderId ? [marker.orderId] : [])),
    );
    const byTime = placed.some((marker) => !marker.orderId);
    const claimed = lines.filter((line) => {
      if (line.isVoided || ownOrders.current.has(line.orderId)) return false;
      if (placedOrders.has(line.orderId)) return true;
      const since = appeared.current.get(line.id);
      return byTime && since !== undefined && at - since <= CLAIM_WINDOW_MS && !line.orderedByName;
    });
    for (const marker of placed) handled.current.add(marker.sequence);
    for (const line of claimed) appeared.current.delete(line.id);

    if (claimed.length === 0) {
      setUnmatched((current) => new Set([...current, ...placed.map((m) => m.sequence)]));
      return;
    }
    setFresh((current) => new Set([...current, ...claimed.map((line) => line.id)]));
    showToast(
      t('tab.staffAddedToast', {
        line: claimed.map((line) => `${line.quantity} × ${line.name}`).join(', '),
      }),
      'add',
    );
  }, [markers, lines, showToast, t]);

  return { initial, fresh, unmatched };
}

function OrdersHead({ status, stale = false }: { status?: string; stale?: boolean }) {
  const { t } = useTranslation('diner');
  return (
    <View style={styles.head}>
      <Text display style={styles.section} accessibilityRole="header">
        {t('bill.orders')}
      </Text>
      {status ? (
        <Text style={[styles.status, stale && styles.statusStale]} numberOfLines={1}>
          {status}
        </Text>
      ) : null}
    </View>
  );
}

/** How long a waiter's new line stays lit. */
const GLOW_MS = 1800;
const GLOW_DELAY_MS = 300;

function LineRow({
  line,
  status,
  ruled,
  fresh,
  locale,
}: {
  readonly line: RenderedLine;
  readonly status: OrderStatus | null;
  readonly ruled: boolean;
  /** Just added by a waiter: lit, then fading back to the card. */
  readonly fresh: boolean;
  readonly locale: Locale;
}) {
  const { t } = useTranslation('diner');
  const reduced = useReducedMotion();
  const [glow] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!fresh || reduced) return;
    glow.setValue(1);
    const run = Animated.timing(glow, {
      toValue: 0,
      duration: GLOW_MS,
      delay: GLOW_DELAY_MS,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [fresh, glow, reduced]);

  const title = `${line.quantity} × ${line.name}`;

  if (line.isVoided) {
    return (
      <View style={[styles.row, ruled && styles.rowRuled]}>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, styles.struck]}>{title}</Text>
          <Text style={styles.voided}>
            {line.voidReason
              ? t('bill.removedBy', { reason: line.voidReason })
              : t('bill.removedNoReason')}
          </Text>
        </View>
        <Text style={[styles.rowPrice, styles.struck]}>{formatDram(0, locale)}</Text>
      </View>
    );
  }

  const badge = status ? lineBadge(status) : null;
  const who = [
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
    .join(' · ');

  return (
    <View style={[styles.row, ruled && styles.rowRuled]}>
      <Animated.View pointerEvents="none" style={[styles.glow, { opacity: glow }]} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowMeta}>{who}</Text>
        {line.note ? <Text style={styles.rowNote}>{line.note}</Text> : null}
      </View>
      {/* The price, and under it where the kitchen is with the line. */}
      <View style={styles.rowEnd}>
        <Text style={styles.rowPrice}>{formatDram(line.lineTotalDram, locale)}</Text>
        {badge ? (
          <Badge
            variant={badge.variant}
            tone="soft"
            size="status"
            dot
            {...(badge.labelKey ? { label: t(badge.labelKey) } : {})}
          />
        ) : null}
      </View>
    </View>
  );
}

function AdjustmentRow({
  adjustment,
  ruled,
  locale,
}: {
  readonly adjustment: RenderedAdjustment;
  readonly ruled: boolean;
  readonly locale: Locale;
}) {
  const { t } = useTranslation('diner');
  return (
    <View style={[styles.row, ruled && styles.rowRuled]}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{t(`bill.adjustment.${adjustment.kind}`)}</Text>
        {adjustment.reason ? <Text style={styles.rowMeta}>{adjustment.reason}</Text> : null}
      </View>
      <Text style={[styles.rowPrice, styles.adjustmentAmount]}>
        −{formatDram(adjustment.reductionDram, locale)}
      </Text>
    </View>
  );
}

function MoneyRow({
  label,
  value,
  valueStyle,
}: {
  readonly label: string;
  readonly value: string;
  readonly valueStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.moneyRow}>
      <Text style={styles.moneyLabel}>{label}</Text>
      <Text style={[styles.moneyValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function GrandRow({
  label,
  value,
  locale,
}: {
  readonly label: string;
  readonly value: number;
  readonly locale: Locale;
}) {
  return (
    <View style={styles.grandRow} accessibilityLiveRegion="polite">
      <Text style={styles.grandLabel}>{label}</Text>
      <CountUp
        display
        value={value}
        format={(amount) => formatDram(amount, locale)}
        style={styles.grandValue}
      />
    </View>
  );
}

function YourShareRow({ amount, locale }: { readonly amount: number; readonly locale: Locale }) {
  const { t } = useTranslation('diner');
  return (
    <View style={styles.moneyRow}>
      <Text style={styles.yourShareLabel}>{t('bill.yourShare')}</Text>
      <Text style={styles.yourShareValue}>{formatDram(amount, locale)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: layout.cardGap },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
    marginTop: 2,
  },
  section: { ...typography.bodyLg, color: colors.text },
  status: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  statusStale: { color: colors.errorInk, fontWeight: fontWeight.bold },
  muted: { ...typography.body, color: colors.textMuted },
  skeletonCard: { padding: space.lg, gap: space.md },

  // The card keeps its shadow; this inner layer clips a lit row to its corners.
  rowsClip: { borderRadius: radius.hero, overflow: 'hidden' },
  emptyRow: { paddingVertical: space.md, paddingHorizontal: space.md + 2 },
  // The design's row: padded 14 all round, 12 between the words and the price.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md + 2,
  },
  rowRuled: { borderTopWidth: 1, borderTopColor: colors.border },
  // A waiter's new line lights in the soft burgundy, then fades to the card.
  glow: { ...StyleSheet.absoluteFill, backgroundColor: colors.primarySoft },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { ...typography.body, fontWeight: fontWeight.medium, color: colors.text },
  rowMeta: { ...typography.caption, color: colors.textMuted },
  rowNote: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' },
  rowEnd: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  rowPrice: {
    minWidth: 64,
    textAlign: 'right',
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: fontWeight.bold,
    color: colors.text,
    ...tabularNumbers,
  },
  struck: { textDecorationLine: 'line-through', color: colors.textMuted },
  voided: { ...typography.caption, color: colors.errorInk },
  adjustmentAmount: { color: colors.successInk },

  markers: { gap: 2, paddingHorizontal: space.xs },
  removed: { ...typography.body, color: colors.errorInk },
  marker: { ...typography.caption, fontWeight: fontWeight.bold, color: colors.infoInk },

  totals: { gap: space.sm, padding: space.md + 2 },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  moneyLabel: { ...typography.body, color: colors.textMuted, flexShrink: 1 },
  moneyValue: { ...typography.body, color: colors.text, ...tabularNumbers },
  paidValue: { color: colors.successInk },
  divider: { height: 1, backgroundColor: colors.borderStrong },
  grandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  grandLabel: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  grandValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: displayWeight.semibold,
    color: colors.primary,
    ...tabularNumbers,
  },
  yourShareLabel: { ...typography.body, fontWeight: fontWeight.medium, color: colors.primary },
  yourShareValue: {
    ...typography.body,
    fontWeight: fontWeight.bold,
    color: colors.primary,
    ...tabularNumbers,
  },
  hidden: { ...typography.body, color: colors.textMuted },
});
