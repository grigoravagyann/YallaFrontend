import { useMemo, useState } from 'react';
import { useSlotFloors } from '../data/queries';
import type { Place } from '../places/model';
import { answerFor, unlimitedAt } from '../places/slotAvailability';
import type { TimeSlot } from '../places/slots';
import { quickTimes, type WheelSlot } from '../places/wheelTimes';
import { PROBE_TIMES, QUICK_TIMES } from './formRules';

/**
 * The time chips beside the wheel: the nearest free times, and — after a "no"
 * to freeing the table in time — the nearby times with no limit.
 */
export function useTimeChoices({
  place,
  activeDateKey,
  partySize,
  activeMs,
  soonSlot,
  soonMs,
  wheelRows,
  freeByDeclined,
  declinedTableId,
  excludeBookingId,
}: {
  readonly place: Place;
  readonly activeDateKey: string | null;
  readonly partySize: number;
  readonly activeMs: number | null;
  readonly soonSlot: TimeSlot | null;
  readonly soonMs: number;
  readonly wheelRows: readonly WheelSlot[];
  readonly freeByDeclined: boolean;
  /** The chosen table, whose limit the other times are judged by; `null` for any table. */
  readonly declinedTableId: string | null;
  readonly excludeBookingId: string | undefined;
}) {
  /*
   * The quick chips: "In 10 min" today, then the nearest free times — after it
   * today, around the time the day opened on any other day. Anchored once per
   * day and party, so the chips do not run after the wheel.
   */
  const anchorKey = `${activeDateKey ?? ''}|${partySize}`;
  const [anchor, setAnchor] = useState<{ readonly key: string; readonly at: number } | null>(null);
  // Adjusted while rendering, as React has state follow a changed input.
  if (activeMs !== null && anchor?.key !== anchorKey) setAnchor({ key: anchorKey, at: activeMs });
  const anchorAt = soonSlot ? soonMs : anchor?.key === anchorKey ? anchor.at : activeMs;
  const quick = useMemo(
    () =>
      anchorAt === null
        ? []
        : quickTimes(wheelRows, anchorAt, QUICK_TIMES, soonSlot ? soonMs : null),
    [wheelRows, anchorAt, soonSlot, soonMs],
  );
  /*
   * After a "no" to the promise: the nearest free times, each asked of the
   * room, and offered when the chosen table — or, with none chosen, any
   * table — has no limit then (see `unlimitedAt`). Asked only after a no.
   */
  const probeRows = useMemo(
    () =>
      freeByDeclined && activeMs !== null
        ? quickTimes(
            wheelRows.filter((row) => row.state === 'free'),
            activeMs,
            PROBE_TIMES,
            activeMs,
          )
        : [],
    [freeByDeclined, wheelRows, activeMs],
  );
  const probeSlotUtcs = useMemo(
    () => probeRows.map((row) => new Date(row.at).toISOString()),
    [probeRows],
  );
  const probes = useSlotFloors({
    branchId: probeRows.length > 0 ? place.id : undefined,
    slotUtcs: probeSlotUtcs,
    partySize,
    timeZoneId: place.timeZoneId,
    excludeBookingId,
  });
  const unlimited =
    activeMs === null
      ? []
      : quickTimes(
          probeRows.filter((row, i) =>
            unlimitedAt(answerFor(probes[i]?.data, row.at, partySize), declinedTableId),
          ),
          activeMs,
          QUICK_TIMES,
          activeMs,
        );
  return { quick, unlimited };
}
