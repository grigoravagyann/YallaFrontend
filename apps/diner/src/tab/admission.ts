import type { DinerTabView } from '@yalla/api';

/**
 * A tab a scan opened with no proved number, waiting for a waiter to let the
 * table order (unverified guests, 2026-10-20).
 *
 * A photographed QR must not let somebody at home open a tab and fill the
 * floor's rail; the waiter can see who is sitting there. So such a tab is
 * open, its menu readable and a waiter callable, but nothing is ordered and
 * no bill asked for until a waiter admits it — or turns it away, which closes
 * it. The stream says which (events 21 and 22), the tab read says how it
 * stands, and the screen reads it from here.
 */
export type AdmissionState = 'awaiting' | 'rejected' | 'open';

export function admissionState(view: Pick<DinerTabView, 'status' | 'admission'>): AdmissionState {
  if (view.admission.status === 'awaiting') return 'awaiting';
  // Turned away closes the tab; a tab closed and paid is not that.
  if (view.admission.status === 'rejected') return 'rejected';
  return 'open';
}

/**
 * The moment a waiting table was let in: worth a word of welcome, once. A tab
 * that was open when first read — a proved host, a booking, staff — never was
 * waiting, and nothing is celebrated.
 */
export function justAdmitted(previous: AdmissionState | null, next: AdmissionState): boolean {
  return previous === 'awaiting' && next === 'open';
}
