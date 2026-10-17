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
 * person's own share, both as the server split them. The one number the phone
 * works out itself is the tip, and only as a preview: the sheet sends a scope
 * and a percent, never an amount, and the success state shows what the server
 * answered. The tip is rounded half-up once, the server's `Money.PercentOf`.
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

/** A tip as a whole-dram percent of the items before service, half-up. */
export function tipOn(itemsDram: number, percent: number): number {
  if (itemsDram <= 0 || percent <= 0) return 0;
  return Math.round((itemsDram * percent) / 100);
}

/** What this person still owes of their own share. */
function owed(share: ParticipantShare): number {
  return Math.max(0, share.shareDram - share.paidDram);
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
  if (shares.yourShare && owed(shares.yourShare) > 0) scopes.push('mine');
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
 * service charge, less what they paid. The rows always add up to the amount,
 * the amount plus the tip to the total. `null` when the read cannot answer
 * for that scope.
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
    tipDram = tipOn(totals.subtotalDram, tipPercent);
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
    if (share.paidDram > 0) lines.push({ kind: 'paid', amountDram: share.paidDram });
    amountDram = owed(share);
    tipDram = tipOn(share.personalDram, tipPercent);
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
