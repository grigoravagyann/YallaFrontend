import type { AwaitingApproval, FloorChange, StaffFloor } from '@yalla/api';

/** How far ahead a cancelled booking is still this floor's news. */
export const BLOCK_NOTICE_AHEAD_MS = 6 * 60 * 60_000;

/** A booking a guest's no-show block cancelled that the floor should hear about. */
export interface BlockCancelled {
  readonly tableLabel: string;
  readonly startUtc: string;
}

/**
 * Which of the bookings a block cancelled (change-stream signal 4) the floor
 * needs telling about (review S6): a table's next booking, or a request
 * waiting here, starting within the next few hours. A booking days ahead is
 * gone from the lists by the reads that follow, and saying so would only
 * alarm. Several at once are said together, never one of them alone.
 */
export function blockCancelledNews(
  changes: readonly FloorChange[],
  floor: StaffFloor,
  awaiting: readonly AwaitingApproval[],
  now: Date,
): readonly BlockCancelled[] {
  const soon = (startUtc: string | null) => {
    if (!startUtc) return false;
    const start = Date.parse(startUtc);
    return start + 60 * 60_000 > now.getTime() && start <= now.getTime() + BLOCK_NOTICE_AHEAD_MS;
  };
  const news: BlockCancelled[] = [];
  for (const change of changes) {
    if (change.signal !== 'bookingCancelledByBlock' || !change.reservationId) continue;
    const next = floor.details.find((detail) => detail.nextReservationId === change.reservationId);
    const request = awaiting.find((entry) => entry.id === change.reservationId);
    const startUtc = next?.nextReservationStartUtc ?? request?.startUtc ?? null;
    if (
      !soon(startUtc) ||
      news.some((entry) => entry.startUtc === startUtc && entry.tableLabel === change.tableLabel)
    ) {
      continue;
    }
    news.push({ tableLabel: change.tableLabel, startUtc: startUtc! });
  }
  return news.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}
