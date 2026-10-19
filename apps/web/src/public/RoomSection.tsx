import { unavailableCopy, type PublicBranch, type TableAvailability } from '@yalla/api';
import { isOfflinePaused, PUBLIC_REFRESH_MS, useSlotFloor } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState } from 'react';
import RoomPhotos from './RoomPhotos';
import type { SlotSelection } from './slots';

/**
 * The rooms, and nothing else: the day, the time and the party are chosen on
 * the booking card (`BookingCard`), in the booking column beside or above this.
 *
 * The photos are behind an intersection observer: a visitor who reads the
 * free-table count and closes the tab — which is most of them — never
 * downloads a room photo.
 */

/**
 * True once `ref` has been near the viewport at least once.
 *
 * Sticky on purpose: it turns the photos on and never off, so scrolling back
 * up does not unmount a room somebody is using. `rootMargin` starts the fetch a
 * screen early, which on a slow connection is the difference between arriving
 * at a room and arriving at a placeholder.
 */
function useHasApproached(ref: React.RefObject<HTMLElement | null>): boolean {
  // No observer at all (an old browser): start visible rather than hide the
  // room forever. Failing open is right for content, and deciding it in the
  // initialiser rather than in an effect avoids a render that only exists to
  // undo the previous one.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (seen) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, seen]);

  return seen;
}

export interface RoomSectionProps {
  readonly branch: PublicBranch;
  readonly selection: SlotSelection;
  readonly slotUtc: string;
  readonly selectedTableId: string | null;
  readonly onTableTap: (availability: TableAvailability) => void;
  /** Set after a 409, cleared when another table is picked. */
  readonly takenTableLabel: string | null;
}

export function RoomSection({
  branch,
  selection,
  slotUtc,
  selectedTableId,
  onTableTap,
  takenTableLabel,
}: RoomSectionProps) {
  const { t } = useTranslation('public');
  const holder = useRef<HTMLDivElement | null>(null);
  const approached = useHasApproached(holder);

  /*
   * The tables **as they will be at the chosen slot** — each with its pin on a
   * room photo — and every table's verdict for it, from one request.
   *
   * This used to be two calls, and the one that drew the room asked about
   * *now* — so a visitor picking Saturday at 20:00 was shown tonight's walk-ins
   * greyed out and 20:00's bookings drawn free, and the time control moved
   * nothing on screen at all.
   *
   * Still polled at the same cadence as the free-table count above it. A slot
   * an hour out gains and loses bookings while somebody reads the menu, and
   * this is the one surface genuinely left open on a table with nobody touching
   * it.
   */
  const slotFloorQuery = useSlotFloor({
    branchId: branch.id,
    slotUtc,
    partySize: selection.partySize,
    // The backend asks in wall-clock terms; the zone travels with the slot so
    // it is never inferred from whatever the visitor's phone is set to.
    timeZoneId: branch.timeZoneId,
    pollMs: PUBLIC_REFRESH_MS,
  });

  const handleTap = (tableId: string) => {
    if (!branch.acceptsWebBookings) return;
    const availability = slotFloorQuery.data?.tables.find((entry) => entry.tableId === tableId);
    if (availability) onTableTap(availability);
  };

  /*
   * A rule that refused the whole request before any table was considered: the
   * slot has passed, it is beyond the branch's booking window, the venue is
   * shut then. Named by the server and said out loud — a room drawn with every
   * table greyed out reads as "fully booked", which is a different fact and
   * sends the visitor away instead of to the date picker.
   */
  /*
   * Only when booking is on offer. `availability` still answers for a venue with
   * web booking switched off — the room's free/taken colouring comes from it —
   * but "too soon to book this table" on a page with no booking on it is an
   * answer to a question nobody asked.
   */
  const rejection =
    branch.acceptsWebBookings && slotFloorQuery.data?.rejection
      ? unavailableCopy(slotFloorQuery.data.rejection, selection.partySize)
      : null;

  /*
   * Why each table the server will not give this party at this slot is
   * unavailable, in the reader's words: a pin free at the slot but too small,
   * kept for larger parties or in a closed hour is not drawn as free.
   */
  const unavailable: Record<string, string> = {};
  for (const entry of slotFloorQuery.data?.tables ?? []) {
    if (entry.isBookable) continue;
    const copy = unavailableCopy(
      entry.unavailableReason ?? slotFloorQuery.data?.rejection ?? null,
      selection.partySize,
    );
    unavailable[entry.tableId] = t(copy.key, { ns: 'diner', ...copy.params });
  }

  return (
    <section className="pub-section" aria-labelledby="room" ref={holder}>
      <h2 id="room">{t('section.room')}</h2>

      {/*
        A lost table is information with a next step attached, not an error
        banner. It sits above the room because the room is where the next step
        is, and it survives until another table is picked.
      */}
      {branch.acceptsWebBookings && takenTableLabel ? (
        <p className="pub-notice pub-notice-alert" role="status">
          {t('confirm.error.tableTaken', { ns: 'diner', label: takenTableLabel })}
        </p>
      ) : null}

      {rejection ? (
        <p className="pub-notice pub-notice-alert" role="status">
          {t(rejection.key, { ns: 'diner', ...rejection.params })}
        </p>
      ) : null}

      {/* The room is what matters here; a stale answer is a line above it, not a
          screen of its own. The room is still worth seeing. */}
      {slotFloorQuery.isError || isOfflinePaused(slotFloorQuery) ? (
        <p className="pub-notice" role="status">
          {isOfflinePaused(slotFloorQuery)
            ? t('net.offline', { ns: 'diner' })
            : t('net.serverError', { ns: 'diner' })}
        </p>
      ) : null}

      {slotFloorQuery.isError && !slotFloorQuery.data ? (
        <p className="pub-muted">{t('room.empty')}</p>
      ) : !approached || !slotFloorQuery.data ? (
        <div className="pub-plan is-placeholder" aria-hidden="true" />
      ) : (
        <RoomPhotos
          rooms={branch.rooms}
          tables={slotFloorQuery.data.plan.tables}
          selectedTableId={selectedTableId}
          onTableTap={handleTap}
          bookable={branch.acceptsWebBookings}
          unavailable={unavailable}
        />
      )}
    </section>
  );
}
