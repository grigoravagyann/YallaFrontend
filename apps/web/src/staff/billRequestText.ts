import type { BillRequest } from '@yalla/api';
import type { TFunction } from 'i18next';

/**
 * A table's bill request, in words: what they want to pay, then the tip.
 *
 * The tip is its own phrase after the amount, never added into it, for the
 * same reason the cash keypad keeps it in its own box: a tip folded into the
 * amount makes a tab look settled while money is still owed.
 *
 * `wants` is the tab's sentence ("Wants to pay the whole bill: …"); the
 * request card says it shorter, under its own "asked for the bill" line.
 */
export function billRequestText(
  bill: BillRequest,
  t: TFunction,
  dram: (amount: number) => string,
  variant: 'wants' | 'short',
): string {
  const amount = dram(bill.amountDram);
  const head =
    variant === 'wants'
      ? bill.scope === 'whole'
        ? t('billRequest.wantsWhole', { amount })
        : t('billRequest.wantsMine', { amount })
      : bill.scope === 'whole'
        ? t('billRequest.whole', { amount })
        : t('billRequest.mine', { amount });
  const tip =
    bill.tipDram > 0
      ? t('billRequest.tip', { percent: bill.tipPercent, amount: dram(bill.tipDram) })
      : t('billRequest.noTip');
  return `${head} · ${tip}`;
}
