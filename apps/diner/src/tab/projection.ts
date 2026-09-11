import type { DinerTabLine, DinerTabView } from '@yalla/api';

/**
 * The tab, reduced to exactly what a screen renders.
 *
 * The permission rule is the reason this exists as a pure function rather than
 * as branches inside a component. What a host may hide is the **table total**
 * and **other people's items** — never prices, and never your own lines. A guest
 * always knows what their own coffee costs; that distinction is the feature, and
 * a component full of `?.` and `?? 0` loses it silently.
 *
 * The absence is modelled, not defaulted. When there is no aggregate there is no
 * `totals` node at all — not a zero, not a dash. A zero on a bill reads as
 * "nothing to pay", and a dash reads as "we could not load it"; both are worse
 * than the truth, which is that this person is not shown the table's total.
 *
 * ## Three things the server now sends, and this now carries
 *
 * 1. **Voided lines**, kept in both arrays with `isVoided` and the reason staff
 *    gave, worth zero. Drawn struck through with "removed by staff: <reason>",
 *    never as a live item at `0 ֏` and never as a row that vanishes.
 * 2. **Adjustments**, with the reason the manager typed, so a total that moves
 *    has a row that says why.
 * 3. **The service-charge percentage**, for everyone, hidden total or not.
 */

export interface RenderedLine {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly lineTotalDram: number;
  /** Whose it is, in initials or a short name. `null` for a table line. */
  readonly orderedByName: string | null;
  readonly isMine: boolean;
  /** True for a line split across the table. */
  readonly isShared: boolean;
  /** How many ways it splits, snapshotted when it was ordered. */
  readonly sharedWithCount: number;
  readonly note: string | null;
  /** Removed by staff. Drawn struck through, with the reason. */
  readonly isVoided: boolean;
  readonly voidReason: string | null;
}

/** A comp or discount, as the bill shows it: what it took off, and why. */
export interface RenderedAdjustment {
  readonly id: string;
  readonly kind: 'discount' | 'comp';
  readonly reductionDram: number;
  readonly reason: string;
}

/**
 * The money, or its absence.
 *
 * A union rather than a struct with nullable fields, so a screen cannot render
 * `0` for a total it is not allowed to show: the aggregate is unreachable
 * without narrowing on `kind`.
 */
export type RenderedMoney =
  | {
      readonly kind: 'table';
      readonly subtotalDram: number;
      /** Its own line, present from the very first item. Never folded in. */
      readonly serviceChargeDram: number;
      readonly totalDram: number;
      readonly paidDram: number;
      readonly remainingDram: number;
    }
  | {
      readonly kind: 'ownItemsOnly';
      readonly yourItemsSubtotalDram: number;
    };

export interface RenderedTab {
  readonly tabId: string;
  readonly tableLabel: string;
  /**
   * The branch's zone, passed in — the tab read carries it (`timeZoneId`).
   * Threading it through rather than defaulting is what stops a tourist's phone
   * on Moscow time from rendering an Armenian kitchen's estimate three hours out.
   */
  readonly timeZoneId: string;
  readonly status: DinerTabView['status'];
  /** This participant's own items — placed by them, or shared with them. */
  readonly myLines: readonly RenderedLine[];
  /** Every line on the tab, voided ones marked, or `null` when the total is hidden. */
  readonly tableLines: readonly RenderedLine[] | null;
  readonly money: RenderedMoney;
  /** Live comps and discounts. A reversed one no longer takes anything off. */
  readonly adjustments: readonly RenderedAdjustment[];
  /** The venue's rate, for everyone — the percentage beside the service-charge row. */
  readonly serviceChargePercent: number;
  /** True when this participant is shown the table's aggregate. */
  readonly showsTableTotal: boolean;
  /** True once the bill has been asked for: no more items go on. */
  readonly acceptsOrders: boolean;
  readonly fetchedAtUtc: string;
}

export function projectTab(tab: DinerTabView, timeZoneId: string): RenderedTab {
  const participantId = tab.me.participantId;
  const render = (line: DinerTabLine): RenderedLine => ({
    id: line.id,
    name: line.name,
    quantity: line.quantity,
    lineTotalDram: line.lineTotalDram,
    orderedByName: line.orderedByName,
    isMine: line.participantId === participantId,
    isShared: line.isShared,
    sharedWithCount: line.sharedWithCount,
    note: line.note,
    isVoided: line.isVoided,
    voidReason: line.voidReason,
  });

  return {
    tabId: tab.tabId,
    tableLabel: tab.tableLabel,
    timeZoneId,
    status: tab.status,
    myLines: tab.myLines.map(render),
    // `null` survives the projection. A screen that turned it into `[]` here
    // would render "nothing ordered" at a table mid-meal.
    tableLines: tab.tableLines ? tab.tableLines.map(render) : null,
    money:
      tab.money.kind === 'table'
        ? {
            kind: 'table',
            subtotalDram: tab.money.bill.subtotalDram,
            serviceChargeDram: tab.money.bill.serviceChargeDram,
            totalDram: tab.money.bill.totalDram,
            paidDram: tab.money.bill.paidDram,
            remainingDram: tab.money.bill.remainingDram,
          }
        : { kind: 'ownItemsOnly', yourItemsSubtotalDram: tab.money.yourItemsSubtotalDram },
    adjustments: tab.adjustments
      .filter((adjustment) => !adjustment.isVoided)
      .map((adjustment) => ({
        id: adjustment.id,
        kind: adjustment.kind,
        reductionDram: adjustment.reductionDram,
        reason: adjustment.reason,
      })),
    serviceChargePercent: tab.serviceChargePercent,
    showsTableTotal: tab.money.kind === 'table',
    // The server's own flag, computed by the rule the ordering endpoint
    // enforces. Never reassembled here from status and tab state.
    acceptsOrders: tab.me.canOrderNow,
    fetchedAtUtc: tab.fetchedAtUtc,
  };
}

/**
 * What this participant's own unshared lines come to.
 *
 * A cross-check against the server's `myItemsSubtotalAmd` on the hidden-total
 * branch, never a substitute for it. Shared lines are excluded because the
 * server excludes them: they are apportioned by the shares endpoint, and adding
 * a whole bottle to one person's subtotal here would overstate what they owe.
 */
export function ownItemsSubtotalDram(lines: readonly RenderedLine[]): number {
  return lines
    .filter((line) => line.isMine && !line.isShared && !line.isVoided)
    .reduce((sum, line) => sum + line.lineTotalDram, 0);
}

/**
 * Paid and still to pay, once money has changed hands.
 *
 * `null` until then, and for a participant not shown the table total. After a
 * guest pays cash the bill used to go on stating the whole total as owed, on
 * every phone at the table; with a payment in, the remaining amount leads.
 */
export function paymentRows(
  money: RenderedMoney,
): { readonly paidDram: number; readonly remainingDram: number } | null {
  if (money.kind !== 'table' || money.paidDram <= 0) return null;
  return { paidDram: money.paidDram, remainingDram: money.remainingDram };
}
