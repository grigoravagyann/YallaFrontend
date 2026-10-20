import { unavailableCopy, type PublicBranch, type TableAvailability } from '@yalla/api';
import { isOfflinePaused, PUBLIC_REFRESH_MS, useSlotFloor } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TakenNotice } from './BookingCard';
import { dayWords } from './dayNames';
import RoomPhotos from './RoomPhotos';
import { branchToday, type SlotSelection } from './slots';
import { useSettled } from './useSettled';

/**
 * "Choose your table": the rooms for the slot picked on the booking card
 * (`BookingCard`), in the booking column beside or above this — room tabs with
 * their free counts, the tables as pins on a photo or as a list, and on a
 * phone the bar that books the table chosen here (the page's `footer`).
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
  /**
   * Set after a 409 in a panel that was open under this room, cleared when
   * another table is picked: said here, where the panel was.
   */
  readonly takenTableLabel: string | null;
  /** Told which room is on screen, so "Choose for me" can look there first. */
  readonly onRoomShown?: ((roomId: string) => void) | undefined;
  /** What closes the section: on a phone, the bar that books the chosen table. */
  readonly footer?: ReactNode;
  /** The booking being changed from its manage link: left out, so its own table reads free. */
  readonly excludeReservationId?: string | undefined;
}

export function RoomSection({
  branch,
  selection,
  slotUtc,
  selectedTableId,
  onTableTap,
  takenTableLabel,
  onRoomShown,
  footer,
  excludeReservationId,
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
    // A run along the time chips asks about the time it stops on (review S5).
    slotUtc: useSettled(slotUtc),
    partySize: selection.partySize,
    // The backend asks in wall-clock terms; the zone travels with the slot so
    // it is never inferred from whatever the visitor's phone is set to.
    timeZoneId: branch.timeZoneId,
    pollMs: PUBLIC_REFRESH_MS,
    excludeBookingId: excludeReservationId,
  });

  const handleTap = (tableId: string) => {
    if (!branch.acceptsWebBookings) return;
    const availability = slotFloorQuery.data?.tables.find((entry) => entry.tableId === tableId);
    if (availability) onTableTap(availability);
  };

  /*
   * A rule that refused the whole request before any table was considered —
   * the slot has passed, it is beyond the window, the venue is shut — is said
   * on the booking card, under the time that caused it. The room only knows
   * not to add "no free table here" to it.
   */
  const refused = branch.acceptsWebBookings && Boolean(slotFloorQuery.data?.rejection);
  /** The answer on screen is the last slot's or the last party's while the new one loads. */
  const answer = slotFloorQuery.data;
  const stale =
    answer != null &&
    (slotFloorQuery.isPlaceholderData ||
      answer.partySize !== selection.partySize ||
      Date.parse(answer.slotUtc) !== Date.parse(slotUtc));

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

  const day = dayWords(selection.date, branchToday(branch.timeZoneId), t);
  // Its own call: a `diner` key read inside another key's options would be
  // taken for that key's namespace by `pnpm i18n:check`.
  const guests = t('booking.guests', { ns: 'diner', count: selection.partySize });

  return (
    <section className="pub-section pub-room" aria-labelledby="room" ref={holder}>
      <h2 id="room">{t(branch.acceptsWebBookings ? 'room.choose' : 'room.now')}</h2>
      <p className="pub-room-sub">
        {branch.acceptsWebBookings
          ? t('room.slot', {
              date: day.short,
              time: selection.time,
              guests,
            })
          : t('room.liveSub')}
      </p>

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
        // Not "no tables marked yet": the room did not come, which is a
        // different fact with a next step (review S5).
        <div className="pub-room-failed">
          <p className="pub-muted">{t('room.failed')}</p>
          <button
            type="button"
            className="pub-button pub-button-small"
            onClick={() => void slotFloorQuery.refetch()}
          >
            {t('page.retry')}
          </button>
        </div>
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
          partySize={selection.partySize}
          onRoomShown={onRoomShown}
          refused={refused}
          stale={stale}
        />
      )}

      {/* A lost table is information with a next step attached — pick another,
          in the room right above — said where the panel that lost it was. */}
      {branch.acceptsWebBookings && takenTableLabel ? (
        <TakenNotice label={takenTableLabel} />
      ) : null}

      {footer}
    </section>
  );
}
