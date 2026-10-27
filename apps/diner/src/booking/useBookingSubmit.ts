import {
  LeadTimeExceededError,
  bookingFailure,
  type CopyLine,
  type TableAvailability,
} from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import type { ScrollViewInstance } from 'react-native';
import { isUnchanged, type BookingChange } from '../components/bookings/changeBooking';
import { useToast } from '../components/motion/Toast';
import { bookingRefusal, changeFailureLine, overlapsOwnLine } from '../data/bookingRefusals';
import { keys, useCreateBooking, useRescheduleBooking } from '../data/queries';
import { newCommandId } from '../lib/commandId';
import { freeByAnswered, freeByNeeded } from '../lib/confirm';
import { pauseRefusalLine } from '../lib/guestRecord';
import { haptics } from '../lib/haptics';
import { placeKeys } from '../places/hooks';
import type { Place } from '../places/model';
import type { TimeSlot } from '../places/slots';
import { firstOfferedFrom, type WheelSlot } from '../places/wheelTimes';
import { actionIcon, space } from '../theme';
import type { ChosenTable } from './formRules';

/** A query the screen asks to read again. */
interface Refetchable {
  readonly refetch: () => unknown;
}

export interface BookingSubmitInput {
  readonly place: Place;
  readonly change: BookingChange | null;
  readonly activeSlot: TimeSlot | null;
  readonly slotUtc: string;
  readonly partySize: number;
  readonly chosenTable: ChosenTable | null;
  readonly autoTableId: string | null;
  readonly chosenRefusal: string | null;
  /** This time's tables, once its answer is here. */
  readonly slotTables: readonly TableAvailability[] | undefined;
  /** This time's answer, or `undefined` while it loads. */
  readonly slotAnswer: unknown;
  readonly requests: string;
  readonly guestName: string;
  readonly verified: boolean;
  readonly phoneE164: string | null | undefined;
  readonly rememberName: (name: string) => void;
  readonly mustVerify: boolean;
  readonly pausedUntil: string | null;
  readonly setVerifyRefused: (refused: boolean) => void;
  readonly here: { readonly venueName: string; readonly branchName: string };
  readonly clearErrors: () => void;
  readonly setErrorText: (text: string | null) => void;
  readonly setConflictText: (text: string | null) => void;
  readonly setOutcomeUnknown: (unknown: boolean) => void;
  readonly setPauseRefused: (refused: boolean) => void;
  readonly slotQuery: Refetchable;
  readonly daySlotsQuery: Refetchable;
  readonly nextDaySlotsQuery: Refetchable;
  readonly nextDateKey: string | undefined;
  readonly refreshNow: () => void;
  readonly wheelRows: readonly WheelSlot[];
  readonly setPickedMs: (at: number | null) => void;
  readonly scrollRef: RefObject<ScrollViewInstance | null>;
  readonly pickTop: MutableRefObject<number>;
  readonly reducedMotion: boolean;
}

/**
 * One press of Book — or Save changes: the promise to free the table asked
 * first when one is needed, then the booking made or moved, and a refusal said
 * where the diner acts on it.
 */
export function useBookingSubmit({
  place,
  change,
  activeSlot,
  slotUtc,
  partySize,
  chosenTable,
  autoTableId,
  chosenRefusal,
  slotTables,
  slotAnswer,
  requests,
  guestName,
  verified,
  phoneE164,
  rememberName,
  mustVerify,
  pausedUntil,
  setVerifyRefused,
  here,
  clearErrors,
  setErrorText,
  setConflictText,
  setOutcomeUnknown,
  setPauseRefused,
  slotQuery,
  daySlotsQuery,
  nextDaySlotsQuery,
  nextDateKey,
  refreshNow,
  wheelRows,
  setPickedMs,
  scrollRef,
  pickTop,
  reducedMotion,
}: BookingSubmitInput) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const showToast = useToast((state) => state.show);

  // One id per screen, reused on every retry — see `confirm.tsx`.
  const commandId = useRef(newCommandId());
  const createBooking = useCreateBooking();
  const reschedule = useRescheduleBooking();
  const pending = createBooking.isPending || reschedule.isPending;

  const targetTableId = chosenTable?.tableId ?? autoTableId;
  // The booking-times answer for the table that one press books.
  const targetAtSlot = useMemo(
    () => slotTables?.find((table) => table.tableId === targetTableId) ?? null,
    [slotTables, targetTableId],
  );
  // Must the diner promise to free it by a time? Asked before sending.
  const targetFreeBy = targetAtSlot?.isBookable ? (targetAtSlot.mustFreeByUtc ?? null) : null;
  /*
   * The server's time, once a refusal named it, for the time, table and party
   * it was said for — newer than the room, so it wins over it until one of
   * them changes (see `freeByNeeded`).
   */
  const freeByKey = `${slotUtc}|${targetTableId ?? ''}|${partySize}`;
  const [serverFreeBy, setServerFreeBy] = useState<{
    readonly key: string;
    readonly freeByUtc: string;
  } | null>(null);
  const neededFreeBy = freeByNeeded({
    server: serverFreeBy?.key === freeByKey ? serverFreeBy.freeByUtc : null,
    table: targetFreeBy,
  });
  const [freeByAsk, setFreeByAsk] = useState<{
    readonly freeByUtc: string;
    readonly nextStartUtc: string | null;
  } | null>(null);
  // Said "no" to the question: another table or time, and which have no limit.
  const [freeByDeclined, setFreeByDeclined] = useState(false);
  // A change that would move the booking to where it already is.
  const unchanged =
    change !== null &&
    isUnchanged(change, {
      slotUtc: activeSlot ? slotUtc : null,
      partySize,
      tableId: targetTableId,
    });

  const canConfirm =
    activeSlot !== null &&
    // Never on the last time's answer, kept on screen while this one's loads.
    slotAnswer !== undefined &&
    targetTableId !== null &&
    chosenRefusal === null &&
    !pending &&
    !unchanged &&
    pausedUntil === null &&
    (change !== null || !verified || guestName.trim().length > 0);

  /**
   * A failed create or change, said where the diner acts on it: a lost table
   * over the photo, everything else under the form.
   */
  const fail = useCallback(
    (error: unknown, slotUtc: string) => {
      // Not taking app bookings, a note over the limit, a booking that can no
      // longer move: said in their own words.
      const refusal = bookingRefusal(error);
      if (refusal) {
        setOutcomeUnknown(false);
        setErrorText(t(refusal.key, refusal.params));
        if (change) {
          // Whatever the booking became, its own screen should say it.
          void queryClient.invalidateQueries({ queryKey: keys.booking(change.bookingId) });
          void queryClient.invalidateQueries({ queryKey: keys.bookings });
        }
        return;
      }
      const failure = bookingFailure(error, place.timeZoneId, locale, { here });
      // A booking landed after the room was read: the table now needs the
      // promise, or a different one. Asked again, with the server's time.
      if (failure.kind === 'freeByRequired') {
        void slotQuery.refetch();
        setOutcomeUnknown(false);
        if (failure.requiredFreeByUtc) {
          setServerFreeBy({ key: freeByKey, freeByUtc: failure.requiredFreeByUtc });
          setFreeByAsk({
            freeByUtc: failure.requiredFreeByUtc,
            nextStartUtc:
              failure.nextBookingStartUtc ?? targetAtSlot?.window?.nextBookingStartUtc ?? null,
          });
        } else {
          setErrorText(t(failure.line.key, failure.line.params));
        }
        return;
      }
      if (failure.kind === 'tableTaken') {
        // The photo underneath and the slot answer are told to redraw; the
        // diner picks again, with the day, time and party kept.
        void queryClient.invalidateQueries({ queryKey: placeKeys.rooms(place.id) });
        void slotQuery.refetch();
        void daySlotsQuery.refetch();
        if (nextDateKey) void nextDaySlotsQuery.refetch();
        setOutcomeUnknown(false);
        setConflictText(t(failure.line.key, failure.line.params));
        scrollRef.current?.scrollTo({
          y: Math.max(0, pickTop.current - space.sm),
          animated: !reducedMotion,
        });
        return;
      }
      /*
       * Time passed while the diner chose: the clock is read again, the day's
       * times with it, and a new booking moves on to the first time the
       * server still books — said, not silently. A change keeps nothing it
       * did not choose: its time is gone, and it says so.
       */
      if (failure.kind === 'leadTime') {
        refreshNow();
        void daySlotsQuery.refetch();
        if (nextDateKey) void nextDaySlotsQuery.refetch();
        if (!change && error instanceof LeadTimeExceededError) {
          const earliest = Date.parse(error.earliestSlotUtc);
          const next = Number.isNaN(earliest) ? null : firstOfferedFrom(wheelRows, earliest);
          setPickedMs(next ? next.at : null);
        }
      }
      // Nothing was booked; the command id stays for the retry.
      if (failure.kind === 'phoneNotVerified' && !change) {
        setVerifyRefused(true);
        setOutcomeUnknown(false);
        return;
      }
      // The diner's own booking at that time: named, with its day when it is
      // on another one — for a change as for a new booking.
      if (failure.kind === 'overlapsOwn') {
        const own = overlapsOwnLine(failure.error, slotUtc, place.timeZoneId, locale, here);
        setOutcomeUnknown(false);
        setErrorText(t(own.key, own.params));
        return;
      }
      // Paused for no-shows, new or a change: the bookings are read again, so
      // the bookings tab's banner and this screen's own note say it from now on.
      if (failure.kind === 'blockedNoShows') {
        setPauseRefused(true);
        void queryClient.invalidateQueries({ queryKey: keys.bookings });
      }
      if (failure.kind === 'commandInUse') commandId.current = newCommandId();
      setOutcomeUnknown(failure.kind === 'unknown');
      // The pause's end on the phone's clock, as the note and the banner say it.
      const line: CopyLine =
        pauseRefusalLine(failure, locale) ??
        (change ? changeFailureLine(failure, error) : failure.line);
      setErrorText(t(line.key, line.params));
    },
    [
      change,
      queryClient,
      place.id,
      place.timeZoneId,
      locale,
      slotQuery,
      daySlotsQuery,
      nextDaySlotsQuery,
      nextDateKey,
      t,
      reducedMotion,
      setVerifyRefused,
      here,
      setFreeByAsk,
      setServerFreeBy,
      setPickedMs,
      targetAtSlot,
      freeByKey,
      refreshNow,
      wheelRows,
      setErrorText,
      setConflictText,
      setOutcomeUnknown,
      setPauseRefused,
      scrollRef,
      pickTop,
    ],
  );

  const confirm = useCallback(
    async (acceptsFreeByUtc: string | null = null) => {
      if (!activeSlot || !targetTableId || pending || chosenRefusal) return;
      clearErrors();
      setFreeByDeclined(false);

      /*
       * A booking follows on the table: asked first, never sent without a yes
       * to that very instant — the server's once it named one — and what goes
       * is the instant the diner agreed to.
       */
      if (!freeByAnswered(acceptsFreeByUtc, neededFreeBy)) {
        setFreeByAsk({
          freeByUtc: neededFreeBy!,
          nextStartUtc: targetAtSlot?.window?.nextBookingStartUtc ?? null,
        });
        return;
      }
      const promise = neededFreeBy && acceptsFreeByUtc ? { acceptsFreeByUtc } : {};

      // Change mode: move the booking, then back to it with a word of what happened.
      if (change) {
        if (unchanged) return;
        try {
          const moved = await reschedule.mutateAsync({
            bookingId: change.bookingId,
            commandId: commandId.current,
            tableId: targetTableId,
            slotUtc,
            timeZoneId: place.timeZoneId,
            partySize,
            ...promise,
          });
          void queryClient.invalidateQueries({ queryKey: placeKeys.rooms(place.id) });
          haptics.success();
          // A bigger party may go back to waiting for the venue: said so.
          const waiting = moved.status === 'pendingApproval';
          showToast(
            t(waiting ? 'book.changeSent' : 'book.changed'),
            waiting ? actionIcon.time : 'checkmark',
          );
          // Back to the booking: the detail it came from, or in place of this
          // screen when it came from the list.
          router.dismissTo({ pathname: '/booking/[bookingId]', params: { bookingId: moved.id } });
        } catch (error) {
          fail(error, slotUtc);
        }
        return;
      }

      const note = requests.trim();
      const forward = {
        branchId: place.id,
        venueId: place.venueId,
        tableId: targetTableId,
        slotUtc,
        partySize: String(partySize),
        ...(note ? { requests: note } : {}),
        // The promise travels through the SMS detour to the confirm screen.
        ...promise,
      };

      // Not verified, or verified on a restored session that never stored the
      // number: log in (the SMS step), then the existing confirm screen — with
      // whatever name was typed here already remembered for it.
      if (!verified || !phoneE164) {
        const typed = guestName.trim();
        if (typed) rememberName(typed);
        router.push({ pathname: '/auth/login', params: forward });
        return;
      }

      const name = guestName.trim();
      if (!name) return;
      rememberName(name);

      // The code flow, with the booking in hand: it lands on `/reserve/confirm`.
      if (mustVerify) {
        router.push({ pathname: '/auth/code', params: forward });
        return;
      }

      try {
        const booking = await createBooking.mutateAsync({
          commandId: commandId.current,
          branchId: place.id,
          tableId: targetTableId,
          slotUtc,
          timeZoneId: place.timeZoneId,
          partySize,
          guestName: name,
          guestPhone: phoneE164,
          channel: 'app',
          // The note goes to the venue with the booking (K9).
          note: note || null,
          ...promise,
        });
        void queryClient.invalidateQueries({ queryKey: placeKeys.rooms(place.id) });
        router.replace({ pathname: '/reserve/success', params: { bookingId: booking.id } });
      } catch (error) {
        fail(error, slotUtc);
      }
    },
    [
      change,
      unchanged,
      reschedule,
      showToast,
      fail,
      mustVerify,
      activeSlot,
      targetTableId,
      pending,
      chosenRefusal,
      requests,
      place.id,
      place.venueId,
      place.timeZoneId,
      slotUtc,
      partySize,
      verified,
      phoneE164,
      guestName,
      rememberName,
      router,
      createBooking,
      queryClient,
      t,
      clearErrors,
      neededFreeBy,
      targetAtSlot,
      setFreeByAsk,
      setFreeByDeclined,
    ],
  );

  return {
    pending,
    canConfirm,
    confirm,
    freeByAsk,
    setFreeByAsk,
    freeByDeclined,
    setFreeByDeclined,
  };
}
