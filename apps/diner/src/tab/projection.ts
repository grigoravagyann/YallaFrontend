import type { DinerTabView, TabAdjustment, TabLine } from '@yalla/api';

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
 */

export interface RenderedLine {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly lineTotalDram: number;
  readonly note: string | null;
  /** Whose it is, in initials or a short name. `null` for a table line. */
  readonly orderedByName: string | null;
  readonly isMine: boolean;
  /** True for a line split across the table. */
  readonly isShared: boolean;
  /** How many ways it splits, from the line's own snapshot. */
  readonly sharedWithCount: number;
  /** Struck through and labelled, never removed. */
  readonly isVoided: boolean;
  readonly voidReason: string | null;
  readonly voidedByName: string | null;
  readonly placedAtUtc: string;
}

/** A discount or comp, rendered as its own row with the manager's reason. */
export interface RenderedAdjustment {
  readonly id: string;
  readonly kind: TabAdjustment['kind'];
  readonly reductionDram: number;
  readonly reason: string;
  readonly byName: string | null;
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
      readonly serviceChargePercent: number;
      readonly totalDram: number;
      readonly paidDram: number;
      readonly remainingDram: number;
      /** What this participant owes, when the server attributes a share. */
      readonly yourShareDram: number | null;
    }
  | {
      readonly kind: 'ownItemsOnly';
      readonly yourItemsSubtotalDram: number;
      /**
       * The branch's percentage. A fact about the venue rather than an
       * aggregate, so it can be stated without saying what the table owes.
       */
      readonly serviceChargePercent: number;
    };

export interface RenderedTab {
  readonly tabId: string;
  readonly tableLabel: string;
  readonly timeZoneId: string;
  readonly status: DinerTabView['status'];
  readonly lines: readonly RenderedLine[];
  readonly adjustments: readonly RenderedAdjustment[];
  readonly money: RenderedMoney;
  /** True when this participant is shown the table's aggregate. */
  readonly showsTableTotal: boolean;
}

export function projectTab(tab: DinerTabView, participantId: string): RenderedTab {
  return {
    tabId: tab.tabId,
    tableLabel: tab.tableLabel,
    timeZoneId: tab.timeZoneId,
    status: tab.status,
    lines: tab.lines.map((line) => renderLine(line, participantId)),
    adjustments: tab.adjustments.map((adjustment) => ({
      id: adjustment.id,
      kind: adjustment.kind,
      reductionDram: adjustment.reductionDram,
      reason: adjustment.reason,
      byName: adjustment.byName,
    })),
    money:
      tab.money.kind === 'table'
        ? {
            kind: 'table',
            subtotalDram: tab.money.bill.subtotalDram,
            serviceChargeDram: tab.money.bill.serviceChargeDram,
            serviceChargePercent: tab.money.serviceChargePercent,
            totalDram: tab.money.bill.totalDram,
            paidDram: tab.money.bill.paidDram,
            remainingDram: tab.money.bill.remainingDram,
            yourShareDram: tab.money.yourShare?.shareDram ?? null,
          }
        : {
            kind: 'ownItemsOnly',
            yourItemsSubtotalDram: tab.money.yourItemsSubtotalDram,
            serviceChargePercent: tab.money.serviceChargePercent,
          },
    showsTableTotal: tab.money.kind === 'table',
  };
}

function renderLine(line: TabLine, participantId: string): RenderedLine {
  return {
    id: line.id,
    name: line.name,
    quantity: line.quantity,
    lineTotalDram: line.lineTotalDram,
    note: line.note,
    orderedByName: line.orderedByName,
    isMine: line.participantId === participantId,
    isShared: line.isShared || line.isTableAttributed,
    // From the line's own snapshot, never from the current participant count.
    // Recomputing it would relabel every past line the moment somebody joins,
    // and the amount beside it would stop matching.
    sharedWithCount: line.sharedWithCount,
    isVoided: line.status === 'voided',
    voidReason: line.voidReason,
    voidedByName: line.voidedByName,
    placedAtUtc: line.placedAtUtc,
  };
}

/**
 * What this participant's own active lines come to.
 *
 * Used only on the `ownItemsOnly` branch, where the server sends this figure and
 * this function is the check that the screen agrees with it. A voided line
 * counts zero, exactly as it does on the table's bill — a struck-through row
 * that still adds to a subtotal is the kind of thing a guest spots and nobody
 * can explain.
 */
export function ownItemsSubtotalDram(
  lines: readonly RenderedLine[],
  participantId: string,
  allLines: readonly TabLine[],
): number {
  const mine = new Set(
    allLines
      .filter((line) => line.participantId === participantId && !line.isShared)
      .map((line) => line.id),
  );
  return lines
    .filter((line) => mine.has(line.id) && !line.isVoided)
    .reduce((sum, line) => sum + line.lineTotalDram, 0);
}
