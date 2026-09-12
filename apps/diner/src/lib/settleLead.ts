import type { TabShares } from '@yalla/api';

export interface SettleLead {
  readonly amount: number;
  /** The bill's total and what is already paid — only when the table's totals are in the body. */
  readonly total: number | null;
  readonly paid: number | null;
  readonly labelKey: 'bill.remaining' | 'bill.yourShare';
}

/**
 * The one number the settle screen leads with.
 *
 * The table's totals are in the body only when the host lets everyone see
 * them; otherwise the number that leads is this person's own share. Nothing
 * leads until the shares have been read, or when the host hid the total and
 * this person has no share of their own.
 */
export function settleLead(shares: TabShares | null | undefined): SettleLead | null {
  if (shares?.kind === 'table') {
    return {
      // Never below zero: an overpayment is settled, not a debt the screen
      // shows in 40px with a minus sign in front of it.
      amount: Math.max(0, shares.totals.remainingDram),
      total: shares.totals.totalDram,
      paid: shares.totals.paidDram,
      labelKey: 'bill.remaining',
    };
  }
  if (shares?.yourShare) {
    return {
      amount: shares.yourShare.shareDram,
      total: null,
      paid: null,
      labelKey: 'bill.yourShare',
    };
  }
  return null;
}
