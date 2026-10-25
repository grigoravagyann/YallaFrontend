import type { TFunction } from 'i18next';

/**
 * Somebody a table can be handed to, as the chooser shows them: one item of
 * the server's `GET /api/tabs/{tabId}/transfer-targets`, its role worded.
 */
export interface TransferTarget {
  readonly staffMemberId: string;
  readonly name: string;
  /** "Waiter", in the floor's language. */
  readonly roleLabel: string;
  /** A shift of theirs at this branch runs now. */
  readonly onShift: boolean;
  /** Tables they hold here now. */
  readonly load: number;
}

/** "Waiter · on shift now · 3 tables now": who a candidate is, in one line. */
export function transferTargetDetail(target: TransferTarget, t: TFunction): string {
  return [
    target.roleLabel,
    target.onShift ? t('table.transfer.onShift') : t('table.transfer.offShift'),
    target.load === 0
      ? t('table.transfer.loadNone')
      : t('table.transfer.load', { count: target.load }),
  ]
    .filter(Boolean)
    .join(' · ');
}
