import { unavailableCopy } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useMemo } from 'react';
import { useSlotFloor } from '../data/queries';
import type { Place, PlaceRoom, TablePhotoMarker } from '../places/model';
import { slotRefusal } from '../places/rooms';
import { answerFor } from '../places/slotAvailability';
import { tablesForParty, type TimeSlot } from '../places/slots';
import { anyRequestIn, preferredTable, slotRoomsFor, type ChosenTable } from './formRules';

/**
 * The rooms **as they will be at the slot**, from the same read the branch
 * screen and the confirm screen use. The place page's pins say who is
 * sitting where right now; a table free tonight is not necessarily free tomorrow at eight,
 * and one occupied now may well be. So the tapped table is checked against
 * the slot, and with no table tapped the first one the server would take is
 * booked — never the first one that happens to be empty this minute.
 */
export function useSlotTables({
  place,
  rooms,
  tables,
  activeSlot,
  slotUtc,
  partySize,
  excludeBookingId,
  chosenTable,
}: {
  readonly place: Place;
  readonly rooms: readonly PlaceRoom[];
  /** Every pin's live state. */
  readonly tables: readonly TablePhotoMarker[];
  readonly activeSlot: TimeSlot | null;
  readonly slotUtc: string;
  readonly partySize: number;
  readonly excludeBookingId: string | undefined;
  readonly chosenTable: ChosenTable | null;
}) {
  const { t } = useTranslation('diner');
  const slotQuery = useSlotFloor({
    branchId: activeSlot ? place.id : undefined,
    slotUtc,
    partySize,
    timeZoneId: place.timeZoneId,
    excludeBookingId,
  });
  // With every time struck there is no slot, and the last slot's room (kept
  // on screen between answers) is not drawn as if it were this one's.
  const slotShown = activeSlot ? slotQuery.data : undefined;
  /*
   * What the screen decides on — the table a press books, whether it needs a
   * promise, why it cannot be had — is only ever this time's answer: the last
   * one stays drawn while the next loads, and Confirm waits for it.
   */
  const slotAnswer = useMemo(
    () => answerFor(slotShown, slotUtc ? Date.parse(slotUtc) : null, partySize),
    [slotShown, slotUtc, partySize],
  );
  const slotTables = slotAnswer?.tables;
  /*
   * The rooms as they will be at the slot: every pin coloured by its state
   * then, and bookable only where the server would give it to this party.
   */
  const shownPlan = slotShown?.plan.tables;
  const shownTables = slotShown?.tables;
  const slotRooms = useMemo(
    () => slotRoomsFor(rooms, shownPlan, shownTables),
    [rooms, shownPlan, shownTables],
  );
  // The legend explains the question-mark pin only when one is on the photos.
  const anyRequest = useMemo(() => anyRequestIn(slotRooms), [slotRooms]);
  const chosenAtSlot = useMemo(
    () => slotTables?.find((table) => table.tableId === chosenTable?.tableId) ?? null,
    [slotTables, chosenTable?.tableId],
  );
  const autoTableId = useMemo(() => {
    if (chosenTable) return null;
    if (slotTables) return preferredTable(slotTables)?.tableId ?? null;
    // No slot answer yet (or none possible): the photo's own free tables, so
    // the button is not dead while the server is thinking.
    return tablesForParty(tables, partySize)[0]?.tableId ?? null;
  }, [chosenTable, slotTables, tables, partySize]);

  // Why the tapped table cannot be had at this slot, if it cannot.
  const chosenRefusal: string | null = useMemo(() => {
    if (!chosenTable) return null;
    if (chosenAtSlot) {
      if (chosenAtSlot.isBookable) return null;
      const line = unavailableCopy(chosenAtSlot.unavailableReason, partySize);
      return t(line.key, line.params);
    }
    if (slotAnswer && !chosenAtSlot) return t('confirm.tableMissing');
    // This time's answer is on its way: nothing said until it is here.
    if (slotShown) return null;
    // No slot answer yet: the photo's live state is the best available word.
    if (chosenTable.live && chosenTable.live.status !== 'free') return t('tables.notBookable');
    return null;
  }, [chosenTable, chosenAtSlot, slotAnswer, slotShown, partySize, t]);

  // Said only for a time that can be had: a struck one already says why.
  const noTableFits = activeSlot !== null && !chosenTable && autoTableId === null;
  // Shut at that time (or too soon, too far ahead): the time is the problem,
  // not the party, and the banner says so rather than "try another party size".
  const slotClosed = useMemo(() => (slotAnswer ? slotRefusal(slotAnswer) : null), [slotAnswer]);
  const noTableText = useMemo(() => {
    if (!slotClosed) return t('book.noTableForParty', { count: partySize });
    const line = unavailableCopy(slotClosed, partySize);
    return t(line.key, line.params);
  }, [slotClosed, partySize, t]);

  return {
    slotQuery,
    slotAnswer,
    slotTables,
    slotRooms,
    anyRequest,
    chosenAtSlot,
    autoTableId,
    chosenRefusal,
    noTableFits,
    noTableText,
  };
}
