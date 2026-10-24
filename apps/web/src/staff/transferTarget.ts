import type { TFunction } from 'i18next';

/** Somebody a table can be handed to. */
export interface TransferTarget {
  readonly staffMemberId: string;
  readonly name: string;
  /** "Waiter"; empty when only the floor knows them (a phone, holding a table). */
  readonly roleLabel: string;
  /** On shift now; `null` when only the floor says they are at work. */
  readonly onShift: boolean | null;
  /** Tables they hold now, from the floor; absent when not counted. */
  readonly load?: number | undefined;
}

/** "Waiter · on shift now · 3 tables now": who a candidate is, in one line. */
export function transferTargetDetail(target: TransferTarget, t: TFunction): string {
  return [
    target.roleLabel,
    target.onShift === null
      ? ''
      : target.onShift
        ? t('table.transfer.onShift')
        : t('table.transfer.offShift'),
    target.load === undefined
      ? ''
      : target.load === 0
        ? t('table.transfer.loadNone')
        : t('table.transfer.load', { count: target.load }),
  ]
    .filter(Boolean)
    .join(' · ');
}
