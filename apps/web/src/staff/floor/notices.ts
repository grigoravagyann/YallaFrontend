import type { TableActionKind } from '@yalla/api';
import type { TFunction } from 'i18next';
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { freshPaidRefusal } from '../commands/reducer';
import type { ConflictEntry } from '../commands/types';
import type { BlockCancelled } from '../live/blockCancelled';
import type { UndoableNoShow } from '../UndoNoShowNotice';

/**
 * The floor's one notice line: what just happened, said once and gone.
 */
export interface Notice {
  readonly kind: 'race' | 'warning' | 'info';
  readonly text: string;
  /** What a table action was sent to do — not yet what the server did. */
  readonly acted?: boolean;
  /** A no-show just marked: the notice offers to undo it (`UndoNoShowNotice`). */
  readonly undo?: UndoableNoShow;
  /**
   * Bookings due soon that a guest's no-show block cancelled (change-stream
   * signal 4): worded when shown, as the stream's handler has no translations
   * of its own.
   */
  readonly blockCancelled?: readonly BlockCancelled[];
}

export type SetNotice = Dispatch<SetStateAction<Notice | null>>;

/** How long a notice stays: long enough to read at arm's length. */
const NOTICE_MS = 6_000;
/** A notice offering an undo stays longer: noticing the mistake takes a moment. */
const UNDO_NOTICE_MS = 15_000;

/**
 * A notice is transient. It stays long enough to read at arm's length and
 * then goes, because nothing on this screen should need dismissing.
 */
/*
 * `setNotice` is the route's state setter throughout: stable, so it is in the
 * effects' dependencies only to say so.
 */
export function useNoticeTimeout(notice: Notice | null, setNotice: SetNotice): void {
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!notice) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(
      () => setNotice(null),
      notice.undo ? UNDO_NOTICE_MS : NOTICE_MS,
    );
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [notice, setNotice]);
}

/**
 * What the conflicts chip changing does to the notice line.
 */
export function useConflictNotices(
  conflicts: readonly ConflictEntry[],
  setNotice: SetNotice,
  t: TFunction,
): void {
  // A refusal lands in the conflicts chip. A "seated" toast still up beside it
  // would claim what the server just refused, so it goes.
  const conflictCount = conflicts.length;
  const seenConflicts = useRef(conflictCount);
  useEffect(() => {
    if (conflictCount > seenConflicts.current) {
      setNotice((current) => (current?.acted ? null : current));
    }
    seenConflicts.current = conflictCount;
  }, [conflictCount, setNotice]);

  // An order voided whole on a bill already paid against is refused (the
  // server, 2026-10-25): that would be a refund. Said here, in words, and not
  // only in the chip (`freshPaidRefusal`).
  const toldPaid = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const fresh = freshPaidRefusal(conflicts, toldPaid.current, Date.now());
    toldPaid.current = new Set(conflicts.map((entry) => entry.command.id));
    if (!fresh) return;
    setNotice({
      kind: 'warning',
      text: t('notice.orderVoidPaid', { label: fresh.command.subject.tableLabel ?? '' }),
    });
  }, [conflicts, setNotice, t]);
}

/**
 * What a table action just did, for the notice: the Table artboard's toasts,
 * without their undo — every action is a command on its way to the server,
 * and not every one has an inverse the server would accept.
 */
export function actedNotice(
  t: TFunction,
  kind: TableActionKind,
  label: string,
  partySize: number | null | undefined,
): string | null {
  switch (kind) {
    case 'seatWalkIn':
    case 'seatHeldParty':
      return partySize
        ? t('notice.acted.seated', { label, count: partySize })
        : t('notice.acted.seatedBooking', { label });
    case 'seatReservation':
      return t('notice.acted.seatedBooking', { label });
    case 'hold':
      return t('notice.acted.held', { label });
    case 'releaseHold':
      return t('notice.acted.holdReleased', { label });
    case 'outOfService':
      return t('notice.acted.outOfService', { label });
    case 'returnToService':
      return t('notice.acted.returned', { label });
    case 'freeTable':
      return t('notice.acted.freed', { label });
  }
}
