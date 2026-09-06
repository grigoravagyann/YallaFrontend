import type { PublicBranch, TableAvailability } from '@yalla/api';
import {
  isOfflinePaused,
  PUBLIC_REFRESH_MS,
  useFloorPlan,
  useTableAvailability,
} from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { PARTY_SIZES, addDays, branchToday, timeOptions, type SlotSelection } from './slots';

/**
 * The room, the three controls above it, and nothing else.
 *
 * `FloorPlanCanvas` is behind `lazy()` **and** behind an intersection observer.
 * Both matter and they do different jobs: `lazy()` keeps
 * `react-native-web` out of the first download, and the observer keeps it from
 * being requested at all until the visitor scrolls far enough to want it. A
 * visitor who reads the free-table count and closes the tab — which is most of
 * them — never fetches the renderer.
 */
const FloorPlanCanvas = lazy(() => import('./FloorPlanCanvas'));

/**
 * True once `ref` has been near the viewport at least once.
 *
 * Sticky on purpose: it turns the chunk fetch on and never off, so scrolling
 * back up does not unmount a plan somebody is using. `rootMargin` starts the
 * fetch a screen early, which on a slow connection is the difference between
 * arriving at a drawn room and arriving at a placeholder.
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
  readonly onSelectionChange: (next: SlotSelection) => void;
  readonly slotUtc: string;
  readonly selectedTableId: string | null;
  readonly onTableTap: (availability: TableAvailability) => void;
  /** Set after a 409, cleared when another table is picked. */
  readonly takenTableLabel: string | null;
}

export function RoomSection({
  branch,
  selection,
  onSelectionChange,
  slotUtc,
  selectedTableId,
  onTableTap,
  takenTableLabel,
}: RoomSectionProps) {
  const { t } = useTranslation('public');
  const holder = useRef<HTMLDivElement | null>(null);
  const approached = useHasApproached(holder);

  // Polled while the tab is in front, so a page left open on a table does not
  // sit there drawing a room from ten minutes ago. Same cadence as the count
  // above it, so the two cannot drift apart on screen.
  const floorQuery = useFloorPlan(branch.id, { pollMs: PUBLIC_REFRESH_MS });
  const availabilityQuery = useTableAvailability({
    branchId: branch.id,
    slotUtc,
    partySize: selection.partySize,
    // The backend asks in wall-clock terms; the zone travels with the slot so
    // it is never inferred from whatever the visitor's phone is set to.
    timeZoneId: branch.timeZoneId,
  });

  const today = branchToday(branch.timeZoneId);
  // The venue's own horizon, so the platform's date picker cannot offer a day
  // the server will refuse once a table has already been chosen.
  const lastBookableDay = addDays(today, branch.bookingWindowDays);

  const handleTap = (tableId: string) => {
    const availability = availabilityQuery.data?.find((entry) => entry.tableId === tableId);
    if (availability) onTableTap(availability);
  };

  return (
    <section className="pub-section" aria-labelledby="room" ref={holder}>
      <h2 id="room">{t('section.room')}</h2>

      {branch.acceptsWebBookings ? (
        <div className="pub-slot">
          <label className="pub-field">
            <span>{t('booking.date', { ns: 'diner' })}</span>
            <input
              type="date"
              value={selection.date}
              min={today}
              max={lastBookableDay}
              onChange={(event) =>
                onSelectionChange({ ...selection, date: event.currentTarget.value })
              }
            />
          </label>
          <label className="pub-field">
            <span>{t('booking.time', { ns: 'diner' })}</span>
            <select
              value={selection.time}
              onChange={(event) =>
                onSelectionChange({ ...selection, time: event.currentTarget.value })
              }
            >
              {/* Half-hourly rather than a free-form time input: the backend
                  reasons in slots, and a 20:07 request is one nobody can fill. */}
              {timeOptions().map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="pub-field">
            <span>{t('booking.partySize', { ns: 'diner' })}</span>
            <select
              value={selection.partySize}
              onChange={(event) =>
                onSelectionChange({
                  ...selection,
                  partySize: Number(event.currentTarget.value),
                })
              }
            >
              {PARTY_SIZES.map((size) => (
                <option key={size} value={size}>
                  {t('booking.guests', { ns: 'diner', count: size })}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="pub-notice">{t('booking.notOffered')}</p>
      )}

      {/*
        A lost table is information with a next step attached, not an error
        banner. It sits above the room because the room is where the next step
        is, and it survives until another table is picked.
      */}
      {takenTableLabel ? (
        <p className="pub-notice pub-notice-alert" role="status">
          {t('confirm.error.tableTaken', { ns: 'diner', label: takenTableLabel })}
        </p>
      ) : null}

      {/* The floor is what matters here; a failed availability answer is a line
          above it, not a screen of its own. The room is still worth seeing. */}
      {availabilityQuery.isError || isOfflinePaused(availabilityQuery) ? (
        <p className="pub-notice" role="status">
          {isOfflinePaused(availabilityQuery)
            ? t('net.offline', { ns: 'diner' })
            : t('net.serverError', { ns: 'diner' })}
        </p>
      ) : null}

      {floorQuery.isError ? (
        <p className="pub-muted">{t('room.empty')}</p>
      ) : !approached || floorQuery.isLoading || !floorQuery.data ? (
        <div className="pub-plan is-placeholder" aria-hidden="true" />
      ) : (
        <Suspense fallback={<div className="pub-plan is-placeholder" aria-hidden="true" />}>
          <FloorPlanCanvas
            plan={floorQuery.data}
            partySize={selection.partySize}
            selectedTableId={selectedTableId}
            onTableTap={handleTap}
          />
        </Suspense>
      )}
    </section>
  );
}
