import {
  ServiceRequestRateLimitedError,
  ValidationError,
  isOffline,
  isTabAccessEnded,
  type BillScope,
  type ParticipantShare,
  type TabShares,
} from '@yalla/api';

/**
 * The pay sheet's arithmetic and choices, as pure functions.
 *
 * Every figure here comes from the shares read — the table's totals and this
 * person's own share, both as the server split them — priced by the shared
 * money rules the server's `BillQuote.For` applies, so the preview is the
 * figure the waiter brings. The sheet still sends a scope and a percent,
 * never an amount, and the success state shows what the server answered.
 *
 * - Whole bill: the tab's remaining balance.
 * - My share: what is left of it (share less paid), capped at the tab's
 *   remaining balance only for somebody shown the table total.
 * - The tip is a percent of the unpaid part of the items: the scope's items
 *   before service, in the proportion the amount bears to the scope's full
 *   figure — exactly the items when nothing is paid yet.
 *
 * Rounding is the server's: half-up, away from zero, to whole dram
 * (`Money.PercentOf`, `Money.ProRata`).
 */

/** The four tips the sheet offers, as the design draws them. */
export const TIP_PERCENTS = [0, 5, 10, 15] as const;

export type TipPercent = (typeof TIP_PERCENTS)[number];

/** The design's default: a small tip is already chosen, any other is a tap. */
export const DEFAULT_TIP_PERCENT: TipPercent = 5;

/** One row above the total. Paid and discount are amounts taken off. */
export type PayLineKind =
  'subtotal' | 'service' | 'myItems' | 'myShared' | 'absorbed' | 'discount' | 'paid' | 'tip';

export interface PayLine {
  readonly kind: PayLineKind;
  /** Always positive; `paid` and `discount` are drawn with a minus. */
  readonly amountDram: number;
}

export interface PayPreview {
  readonly scope: BillScope;
  readonly lines: readonly PayLine[];
  /**
   * What the scope leaves to pay — service charge in, tip out. The figure the
   * server works out for the request too, from the same read.
   */
  readonly amountDram: number;
  readonly tipDram: number;
  /** What the person hands over: the amount and the tip. */
  readonly totalDram: number;
}

/** An integer over a positive integer, rounded half away from zero, exactly. */
function divideHalfUp(dividend: number, divisor: number): number {
  const size = Math.abs(dividend);
  let quotient = Math.floor(size / divisor);
  let remainder = size - quotient * divisor;
  // The float division can land a whole step out for very large values.
  if (remainder < 0) {
    quotient -= 1;
    remainder += divisor;
  } else if (remainder >= divisor) {
    quotient += 1;
    remainder -= divisor;
  }
  const rounded = remainder * 2 >= divisor ? quotient + 1 : quotient;
  return dividend < 0 ? -rounded : rounded;
}

/** `percent` of an amount, half-up to whole dram — `Money.PercentOf`. */
export function percentOf(amountDram: number, percent: number): number {
  if (amountDram === 0 || percent === 0) return 0;
  return divideHalfUp(amountDram * percent, 100);
}

/**
 * `numerator`/`denominator` of an amount, half-up to whole dram —
 * `Money.ProRata`. Nothing when the fraction or the amount is nothing.
 */
export function proRata(amountDram: number, numerator: number, denominator: number): number {
  if (denominator <= 0 || numerator <= 0 || amountDram === 0) return 0;
  return divideHalfUp(amountDram * numerator, denominator);
}

/** What this person still owes of their own share. */
function owed(share: ParticipantShare): number {
  return Math.max(0, share.shareDram - share.paidDram);
}

/**
 * What "my share" asks for: what is left of it, and never more than the tab
 * still owes — but that cap only for somebody shown the table total, so a
 * person the host keeps it from never reads the table's balance off their
 * own figure. A payment the waiter took against the table, not a person,
 * lowers the balance without lowering anybody's share; the cap is why.
 */
export function myShareAmount(shares: TabShares | null | undefined): number {
  const share = shares?.yourShare;
  if (!shares || !share) return 0;
  const left = owed(share);
  return shares.kind === 'table' ? Math.min(left, shares.totals.remainingDram) : left;
}

/**
 * What the sheet offers, in the design's order.
 *
 * The whole bill only to somebody shown the table total — a person the host
 * keeps it from cannot be asked to agree to a number they may not see. Their
 * own share only when the shares read gives them one with something left on
 * it. Either is left out once nothing is left to pay on it, so an empty list
 * means the sheet has nothing to ask for.
 */
export function payScopes(shares: TabShares | null | undefined): readonly BillScope[] {
  if (!shares) return [];
  const scopes: BillScope[] = [];
  if (shares.kind === 'table' && shares.totals.remainingDram > 0) scopes.push('whole');
  if (myShareAmount(shares) > 0) scopes.push('mine');
  return scopes;
}

/**
 * Whether anybody else at the table has a share to pay — what the "the others
 * pay their part from their own phones" note under My share depends on. A read
 * that hides the table keeps the others out of it; somebody else is there,
 * since a host is keeping the total from this person.
 */
export function othersHaveShares(shares: TabShares | null | undefined): boolean {
  if (!shares) return false;
  if (shares.kind !== 'table') return true;
  const mine = shares.yourShare?.participantId;
  return shares.shares.some((share) => share.participantId !== mine);
}

/** The chosen scope while it is still offered, else the first one that is. */
export function pickScope(
  scopes: readonly BillScope[],
  chosen: BillScope | null,
): BillScope | null {
  if (chosen && scopes.includes(chosen)) return chosen;
  return scopes[0] ?? null;
}

/**
 * The rows, the amount and the tip for one scope.
 *
 * Whole: the table's items and service charge, less what has been paid. Mine:
 * this person's own items, their part of the shared ones, anything that fell
 * to them from somebody who left, a discount when the split took one off, the
 * service charge, less what has been paid toward it (their own payments, and
 * what the table's payments covered once the balance is below their share).
 * The rows always add up to the amount, the amount plus the tip to the total.
 * `null` when the read cannot answer for that scope.
 */
export function payPreview(
  shares: TabShares | null | undefined,
  scope: BillScope,
  tipPercent: number,
): PayPreview | null {
  if (!shares) return null;
  const lines: PayLine[] = [];
  let amountDram: number;
  let tipDram: number;

  if (scope === 'whole') {
    if (shares.kind !== 'table') return null;
    const totals = shares.totals;
    lines.push({ kind: 'subtotal', amountDram: totals.subtotalDram });
    lines.push({ kind: 'service', amountDram: totals.serviceChargeDram });
    if (totals.paidDram > 0) lines.push({ kind: 'paid', amountDram: totals.paidDram });
    amountDram = totals.remainingDram;
    // The tip on the items still unpaid: all of them until somebody pays.
    tipDram = percentOf(proRata(totals.subtotalDram, amountDram, totals.totalDram), tipPercent);
  } else {
    const share = shares.yourShare;
    if (!share) return null;
    lines.push({ kind: 'myItems', amountDram: share.ownItemsDram });
    if (share.sharedItemsDram > 0) {
      lines.push({ kind: 'myShared', amountDram: share.sharedItemsDram });
    }
    if (share.absorbedFromRemovedDram > 0) {
      lines.push({ kind: 'absorbed', amountDram: share.absorbedFromRemovedDram });
    }
    // A tab-wide discount is apportioned into `personalDram`, not into the
    // parts above it: said as its own row, so the rows still add up.
    const discount =
      share.ownItemsDram +
      share.sharedItemsDram +
      share.absorbedFromRemovedDram -
      share.personalDram;
    if (discount > 0) lines.push({ kind: 'discount', amountDram: discount });
    lines.push({ kind: 'service', amountDram: share.serviceChargeDram });
    amountDram = myShareAmount(shares);
    // What has been paid toward it: this person's own payments, and — when
    // the table's balance is below what they owe — what the table's payments
    // already covered. Said as one row, so the rows add up to the amount.
    const covered = share.shareDram - amountDram;
    if (covered > 0) lines.push({ kind: 'paid', amountDram: covered });
    tipDram =
      share.shareDram > 0
        ? percentOf(proRata(share.personalDram, amountDram, share.shareDram), tipPercent)
        : 0;
  }

  if (tipDram > 0) lines.push({ kind: 'tip', amountDram: tipDram });
  return { scope, lines, amountDram, tipDram, totalDram: amountDram + tipDram };
}

/** Why a bill request did not go through, as the key of its sentence. */
export type BillRequestFailure =
  | { readonly key: 'tab.pay.nothingLeft' }
  | { readonly key: 'waiter.rateLimited'; readonly count: number }
  | { readonly key: 'waiter.rateLimitedNoWindow' }
  | { readonly key: 'tab.accessEnded.body' }
  | { readonly key: 'net.offline' }
  | { readonly key: 'waiter.failed' };

/**
 * A refused bill request, as what the sheet says.
 *
 * A 422 naming `billScope` is the server finding nothing left to pay on that
 * scope — the shares moved under the sheet. The rate limit means the floor
 * already knows the table wants somebody; it is said, not apologised for.
 */
export function billRequestFailure(error: unknown): BillRequestFailure {
  if (error instanceof ValidationError && error.field === 'billScope') {
    return { key: 'tab.pay.nothingLeft' };
  }
  if (error instanceof ServiceRequestRateLimitedError) {
    return error.windowMinutes
      ? { key: 'waiter.rateLimited', count: error.windowMinutes }
      : { key: 'waiter.rateLimitedNoWindow' };
  }
  if (isTabAccessEnded(error)) return { key: 'tab.accessEnded.body' };
  if (isOffline(error)) return { key: 'net.offline' };
  return { key: 'waiter.failed' };
}
