import {
  type CreateBookingCommand,
  MAX_BOOKING_NOTE,
  type Booking,
  type MyBookings,
  type AnswerTableRequestCommand,
  type RescheduleBookingCommand,
} from '../../contracts/booking';
import { requireClientCommandId, validationFailed } from '../problems';
import { NotFoundError, ConcurrencyConflictError } from '../../errors';
import { publicBranchFixtures } from '../publicVenues';
import {
  BookingsNotAcceptedError,
  BookingRejectedError,
  FreeByRequiredError,
  TableRequestClosedError,
  HoldNotActiveError,
  HoldAlreadyExtendedError,
  BookingNotChangeableError,
} from '../../contracts/errors';
import { onMyWayOpensAtUtc } from '../../contracts/onMyWay';
import { APPROVAL_EXPIRED_CODE } from '../../contracts/approvals';
import {
  type DinerMockContext,
  DEFAULT_POLICY,
  promiseAt,
  sameInstant,
  URL_TAG,
  type MockGateway,
} from './context';

/** Bookings: making, listing, answering, holding, cancelling and rescheduling, and the venue's no-show and seating. */
export function bookingsMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'markNoShowAsVenue'
  | 'seatAsVenue'
  | 'createBooking'
  | 'listBookings'
  | 'getBooking'
  | 'answerTableRequest'
  | 'getReservationState'
  | 'cancelReservation'
  | 'extendReservationHold'
  | 'cancelBooking'
  | 'rescheduleBooking'
> {
  const {
    acceptsAppBookings,
    answerInThread,
    answersInApp,
    askEarlierGuest,
    askersOf,
    bookerPhones,
    bookingOwners,
    bookings,
    callerGuest,
    changeOrigins,
    commandLog,
    conflict,
    conversations,
    decideApproval,
    decideTableRequest,
    deletedAccounts,
    earlierGuestDecision,
    feeds,
    findBranch,
    floors,
    guestRecordOf,
    holdExtensions,
    markNoShow,
    mintBookingCode,
    now,
    numberOf,
    offerToFloor,
    openRequestOf,
    preOrders,
    reasonFor,
    refuseAtBranch,
    refuseFourthActiveBooking,
    refuseOverlapWithOwn,
    refuseWhileBlocked,
    rejudgeAskersOf,
    requireVerifiedPhone,
    rescheduleLog,
    stateAt,
    tableRequests,
    tableTaken,
    timingAt,
    toReservationState,
    wait,
    withRequest,
    withdrawRequestsFor,
  } = ctx;
  return {
    markNoShowAsVenue(bookingId) {
      markNoShow(bookingId);
    },

    seatAsVenue(bookingId) {
      const booking = bookings.get(bookingId);
      if (booking) bookings.set(bookingId, { ...booking, status: 'seated' });
    },

    async createBooking(command: CreateBookingCommand) {
      await wait();
      const url = `${URL_TAG}/api/reservations`;
      // The body binds first: a command id that is not a GUID never reaches the rules.
      requireClientCommandId(url, command.commandId);
      // The request's own validation runs before anything else, as on the server.
      const note = typeof command.note === 'string' ? command.note.trim() : '';
      if (note.length > MAX_BOOKING_NOTE) {
        throw validationFailed(url, [
          {
            field: 'note',
            message: `At most ${MAX_BOOKING_NOTE} characters.`,
            bound: 'max',
            max: MAX_BOOKING_NOTE,
          },
        ]);
      }
      // No booking without a proved number (guest record, 2026-10-20).
      requireVerifiedPhone(url);

      // Idempotency first: a retry of the same command must not book twice.
      const existingId = commandLog.get(command.commandId);
      if (existingId) {
        const existing = bookings.get(existingId);
        if (existing) return withRequest(existing);
      }
      // Three no-shows in three days: no booking until the week is over.
      refuseWhileBlocked(url);

      const found = findBranch(command.branchId);
      const floor = floors.get(command.branchId);
      // A 404, as the server answers an unknown branch or table.
      if (!found || !floor) throw new NotFoundError({ url: `${URL_TAG}/api/reservations` });
      const policy = DEFAULT_POLICY;

      // `ReservationService.RequireWebBookingsAccepted`: a branch that never
      // agreed to take bookings from its public page does not take them — a
      // 409 `web-bookings-not-accepted`, before the app gate and every table
      // rule. The mock booked through a page whose switch was off (QA F5).
      if (
        command.channel === 'web' &&
        !(publicBranchFixtures[command.branchId]?.acceptsWebBookings ?? false)
      ) {
        throw conflict(
          url,
          'web-bookings-not-accepted',
          `${found.branch.name} does not take bookings from its public page. ` +
            'Contact the venue directly to book a table.',
        );
      }

      // K9: the app channel needs the switch on and a reviewed policy.
      if (command.channel === 'app' && !acceptsAppBookings(command.branchId)) {
        throw new BookingsNotAcceptedError({ url, branchId: command.branchId });
      }

      const table = floor.tables.find((t) => t.id === command.tableId);
      if (!table) throw new NotFoundError({ url: `${URL_TAG}/api/reservations` });

      const slot = new Date(command.slotUtc);

      // The branch-wide rules first, as the server applies them. Lead time:
      // the slot may have become too soon while they were deciding.
      refuseAtBranch(command.branchId, slot, command.partySize);

      // Judged at the slot being booked, not at now — the same projection the
      // availability answer used. Judging it at now would refuse a Saturday
      // booking because somebody is sitting there this evening.
      const refusal = reasonFor(table, stateAt(table, slot, policy), command.partySize);

      // Lost to somebody else — the two 409s. Every other refusal is a rule,
      // a 422, and says which rule; it is not "taken".
      const taken =
        ctx.simulateTakenOnce ||
        refusal === 'occupied' ||
        refusal === 'alreadyBooked' ||
        refusal === 'held';
      if (taken) {
        const simulated = ctx.simulateTakenOnce && refusal === null;
        ctx.simulateTakenOnce = false;
        if (simulated) {
          // Somebody else booked it for this slot, in the mock's world, so the
          // refreshed room and the next availability read are honest.
          floors.set(command.branchId, {
            ...floor,
            tables: floor.tables.map((t) =>
              t.id === table.id
                ? { ...t, state: 'reservedSoon', nextReservationStartUtc: command.slotUtc }
                : t,
            ),
          });
        }

        throw tableTaken({
          branchId: command.branchId,
          table,
          slotUtc: command.slotUtc,
          partySize: command.partySize,
          refusal,
        });
      }
      if (refusal) {
        throw new BookingRejectedError({
          url: URL_TAG,
          reason: refusal,
          partySize: command.partySize,
        });
      }

      // The server's order after the table: the diner's own evening, here or
      // too close to it elsewhere (an overlap says so, with the booking), then
      // at most three active bookings per proved number.
      refuseOverlapWithOwn(url, command.branchId, slot, policy.turnMinutes);
      const phone = numberOf(command);
      refuseFourthActiveBooking(url, phone);

      // Booking times: a sitting the next booking cuts short is taken only with
      // the promise to free the table by then — the very instant, or a 422.
      const timing = timingAt(table, slot);
      const cut = timing.kind === 'refused' ? null : timing.mustFreeByUtc;
      if (cut && !sameInstant(command.acceptsFreeByUtc, cut)) {
        throw new FreeByRequiredError({
          url,
          requiredFreeByUtc: cut,
          nextBookingStartUtc: timing.kind === 'refused' ? null : timing.nextStartUtc,
        });
      }

      // A table somebody booked shortly before, another day: the guest before is
      // asked. Every other booking is decided as it always was.
      const decision =
        earlierGuestDecision(table, timing, command.slotUtc, found.branch.timeZoneId) ??
        decideApproval({
          partySize: command.partySize,
          slotUtc: command.slotUtc,
          timeZoneId: found.branch.timeZoneId,
        });

      const id = `bk_${ctx.sequence++}`;
      const booking: Booking = {
        id,
        code: mintBookingCode(),
        ...decision,
        venueName: found.venue.name,
        branchId: found.branch.id,
        branchName: found.branch.name,
        timeZoneId: found.branch.timeZoneId,
        tableId: table.id,
        tableLabel: table.label,
        roomId: table.floorAreaId,
        roomName: table.floorAreaName,
        partySize: command.partySize,
        slotUtc: command.slotUtc,
        // Cut to the promise when the next booking made it shorter.
        endUtc: cut ?? new Date(slot.getTime() + policy.turnMinutes * 60_000).toISOString(),
        freeCancellationUntilUtc: new Date(
          slot.getTime() - policy.freeCancellationMinutes * 60_000,
        ).toISOString(),
        cancelledAtUtc: null,
        cancelledAfterDeadline: false,
        note: note === '' ? null : note,
        declinedBecause: null,
        phoneUnverified: false,
        promisedFreeByUtc: cut,
        // The mock issues one for every booking, so the manage-booking page is
        // walkable from the app's own flow too. See `publicMock.ts` for what
        // the token is and, more importantly, what it is not.
        manageToken: `mbk_${id}`,
      };

      bookings.set(id, booking);
      commandLog.set(command.commandId, id);
      if (phone) bookerPhones.set(id, phone);
      offerToFloor(booking);
      if (booking.awaitingApprovalBecause === 'earlierGuestConsent')
        askEarlierGuest(booking, timing);
      if (ctx.signedInAccountId && !deletedAccounts.has(ctx.signedInAccountId)) {
        bookingOwners.set(id, ctx.signedInAccountId);
      }

      // Reflect the booking on the floor so a second attempt sees it gone.
      floors.set(command.branchId, {
        ...floor,
        tables: floor.tables.map((t) =>
          t.id === table.id
            ? { ...t, state: 'reservedSoon', nextReservationStartUtc: command.slotUtc }
            : t,
        ),
      });

      return withRequest(booking);
    },

    /**
     * Split by the server's rule, not by the clock against the start: upcoming
     * is a booking whose sitting has not ended and which still holds a table.
     */
    async listBookings(): Promise<MyBookings> {
      await wait();
      const t = now().getTime();
      const holdsTable = (b: Booking) =>
        b.status === 'confirmed' || b.status === 'pendingApproval' || b.status === 'seated';
      const all = [...bookings.values()];
      const upcoming = all
        .filter((b) => holdsTable(b) && Date.parse(b.endUtc) > t)
        .sort((a, b) => Date.parse(a.slotUtc) - Date.parse(b.slotUtc));
      const past = all
        .filter((b) => !upcoming.includes(b))
        .sort((a, b) => Date.parse(b.slotUtc) - Date.parse(a.slotUtc));
      // A later guest's request rides on the booking it is for; the diner's own
      // record comes beside the lists.
      return {
        upcoming: upcoming.map(withRequest),
        past: past.map(withRequest),
        guestRecord: guestRecordOf(callerGuest()),
      };
    },

    async getBooking(bookingId) {
      await wait();
      const booking = bookings.get(bookingId);
      return booking ? withRequest(booking) : null;
    },

    async answerTableRequest(answer: AnswerTableRequestCommand): Promise<Booking> {
      await wait();
      const url = `${URL_TAG}/api/reservations/${answer.bookingId}/table-requests/${answer.requestId}/answer`;
      requireClientCommandId(url, answer.commandId);
      // Their own booking only; anybody else's answers as one that does not exist.
      const booking = bookings.get(answer.bookingId);
      const owner = booking ? (bookingOwners.get(booking.id) ?? null) : null;
      if (!booking || (owner !== null && owner !== ctx.signedInAccountId)) {
        throw new NotFoundError({ url });
      }
      const request = tableRequests.get(answer.requestId);
      // A question the floor is deciding is not this guest's to answer: as if absent.
      if (!request || request.earlierId !== booking.id || !request.asksEarlierGuest) {
        throw new NotFoundError({ url });
      }
      if (request.status !== 'pending') {
        // The same answer again is the answer it was: a lock-screen button
        // tapped twice on a bad connection is not a second answer.
        if (request.answerCommandId === answer.commandId) {
          return withRequest(bookings.get(booking.id) ?? booking);
        }
        throw new TableRequestClosedError({ url, requestId: request.id });
      }
      request.answerCommandId = answer.commandId;
      decideTableRequest(request, answer.accept, now().toISOString());
      return withRequest(bookings.get(booking.id) ?? booking);
    },

    async getReservationState(reservationId) {
      await wait();
      const booking = bookings.get(reservationId);
      return booking ? toReservationState(booking) : null;
    },

    async cancelReservation({ reservationId }) {
      const booking = await this.cancelBooking(reservationId);
      return toReservationState(booking);
    },

    async extendReservationHold({ reservationId, clientCommandId }) {
      await wait();
      requireClientCommandId(
        `${URL_TAG}/api/reservations/${reservationId}/extend-hold`,
        clientCommandId,
      );
      const booking = bookings.get(reservationId);
      if (!booking) throw new NotFoundError({ url: `${URL_TAG}/api/reservations` });
      // As the server now refuses it: nothing is held before the start, and
      // only a confirmed booking holds a table. Nothing is spent.
      if (booking.status !== 'confirmed' || now().getTime() < Date.parse(booking.slotUtc)) {
        throw new HoldNotActiveError({ url: URL_TAG, reservationId });
      }

      const previous = holdExtensions.get(reservationId);
      if (previous) {
        // The same command again is a replay, not a second attempt: a
        // notification is tappable twice and the second tap is not an error.
        if (previous.clientCommandId === clientCommandId) {
          return { ...previous.outcome, wasReplay: true };
        }
        // A genuinely second attempt. The one extension is spent.
        throw new HoldAlreadyExtendedError({ url: URL_TAG, reservationId });
      }

      const minutes = 15;
      const outcome = {
        reservationId,
        holdExpiresAtUtc: new Date(now().getTime() + minutes * 60_000).toISOString(),
        extensionMinutes: minutes,
        extensionsRemaining: 0,
        wasReplay: false,
      };
      holdExtensions.set(reservationId, { clientCommandId, outcome });
      return outcome;
    },

    async cancelBooking(bookingId) {
      await wait();
      const booking = bookings.get(bookingId);
      if (!booking) throw new NotFoundError({ url: `${URL_TAG}/api/reservations` });

      // Already cancelled is the outcome asked for, as the real gateway reads
      // it back. Anything else that no longer holds a table is refused, as the
      // server refuses it.
      if (booking.status === 'cancelledByDiner' || booking.status === 'cancelledByVenue') {
        return withRequest(booking);
      }
      if (booking.status !== 'confirmed' && booking.status !== 'pendingApproval') {
        throw new ConcurrencyConflictError({ url: `${URL_TAG}/api/reservations` });
      }

      // Never refuses for lateness: a late cancellation is far better for the
      // venue than a no-show. It is only recorded as late.
      const at = now();
      const cancelled: Booking = {
        ...booking,
        status: 'cancelledByDiner',
        cancelledAtUtc: at.toISOString(),
        cancelledAfterDeadline: at.getTime() > Date.parse(booking.freeCancellationUntilUtc),
      };
      bookings.set(bookingId, cancelled);
      rejudgeAskersOf(bookingId, at.toISOString());
      withdrawRequestsFor(bookingId);
      // "Not coming" is the ordinary cancel: an answer in the thread when the
      // booking has one already or the answer window has opened (two hours
      // before the start), as the server writes it. A booking cancelled next
      // week is a cancellation, not an answer to anybody.
      if (
        conversations.record({ kind: 'reservation', id: bookingId }) ||
        at.getTime() >= Date.parse(onMyWayOpensAtUtc(booking.slotUtc))
      ) {
        answerInThread(cancelled, { kind: 'notComing', lateMinutes: null });
      }

      const floor = floors.get(booking.branchId);
      if (floor) {
        floors.set(booking.branchId, {
          ...floor,
          tables: floor.tables.map((t) =>
            t.id === booking.tableId ? { ...t, state: 'free', nextReservationStartUtc: null } : t,
          ),
        });
      }

      return withRequest(cancelled);
    },

    /**
     * Move a booking, by the server's rules: the diner's own, waiting or
     * confirmed and not started; every gate a new booking meets, with the
     * collision check leaving this booking out; the status decided afresh; the
     * code, the id and the manage link kept. A replay of the command answers
     * the booking as it now stands.
     */
    async rescheduleBooking(command: RescheduleBookingCommand): Promise<Booking> {
      // As it stood before the floor's answers catch up with the clock: the
      // server refuses a change to a request whose answer window has closed,
      // whatever its sweep has made of it yet.
      const before = bookings.get(command.bookingId);
      await wait();
      const url = `${URL_TAG}/api/reservations/${command.bookingId}/reschedule`;
      requireClientCommandId(url, command.commandId);
      requireVerifiedPhone(url);

      const replayed = rescheduleLog.get(command.commandId);
      const current = replayed !== undefined ? bookings.get(replayed) : undefined;
      if (current) return withRequest(current);
      // Blocked for no-shows: no change either, one rule everywhere.
      refuseWhileBlocked(url);

      if (
        before?.status === 'pendingApproval' &&
        before.approvalExpiresAtUtc &&
        now().getTime() >= Date.parse(before.approvalExpiresAtUtc)
      ) {
        throw conflict(
          url,
          APPROVAL_EXPIRED_CODE,
          `The answer window for ${before.code} has closed; it can no longer be changed.`,
        );
      }

      // Somebody else's booking answers exactly as one that does not exist.
      const booking = bookings.get(command.bookingId);
      const owner = booking ? (bookingOwners.get(booking.id) ?? null) : null;
      if (!booking || (owner !== null && owner !== ctx.signedInAccountId)) {
        throw new NotFoundError({ url });
      }

      const started = now().getTime() >= Date.parse(booking.slotUtc);
      if ((booking.status !== 'pendingApproval' && booking.status !== 'confirmed') || started) {
        throw new BookingNotChangeableError({ url, reservationId: booking.id });
      }
      // The kitchen has its pre-order: the booking stays where it is (it may
      // still be cancelled). Otherwise "not coming" goes with the old time.
      preOrders.beforeMove(url, booking.id);

      const floor = floors.get(booking.branchId);
      const table = floor?.tables.find((t) => t.id === command.tableId);
      if (!floor || !table) throw new NotFoundError({ url });
      const policy = DEFAULT_POLICY;
      const slot = new Date(command.slotUtc);

      refuseAtBranch(booking.branchId, slot, command.partySize);
      refuseOverlapWithOwn(url, booking.branchId, slot, policy.turnMinutes, booking.id);

      /*
       * A confirmed booking keeping its table and start, its party not
       * growing, is never judged again by the table-sequencing rules: nothing
       * the venue said yes to got harder to keep. Only a party sitting into it
       * now still refuses it.
       */
      const keeps =
        booking.status === 'confirmed' &&
        sameInstant(command.slotUtc, booking.slotUtc) &&
        table.id === booking.tableId &&
        command.partySize <= booking.partySize;
      // At the new slot, leaving this booking out — so keeping the same table
      // half an hour later is not a collision with itself.
      const judged = reasonFor(table, stateAt(table, slot, policy, booking.id), command.partySize);
      const refusal = keeps && judged === 'alreadyBooked' ? null : judged;
      if (refusal === 'occupied' || refusal === 'alreadyBooked' || refusal === 'held') {
        throw tableTaken({
          branchId: booking.branchId,
          table,
          slotUtc: command.slotUtc,
          partySize: command.partySize,
          refusal,
          excludeBookingId: booking.id,
        });
      }
      if (refusal) {
        throw new BookingRejectedError({ url, reason: refusal, partySize: command.partySize });
      }

      // The same promise as for a new booking, at the new table and time — not
      // asked again of a booking that already made exactly it for the same
      // table and start (a change of party size alone), nor of one the rules
      // do not judge again. Bookings only asking for this one's table are left
      // out of judging it: the guest before is not made to promise a time, nor
      // refused, because somebody would like their table.
      const askers = askersOf(booking.id);
      const timing = timingAt(table, slot, booking.id, askers);
      const cut = keeps || timing.kind === 'refused' ? null : timing.mustFreeByUtc;
      const samePlace =
        table.id === booking.tableId && sameInstant(command.slotUtc, booking.slotUtc);
      const promisedAlready =
        cut !== null && samePlace && sameInstant(booking.promisedFreeByUtc ?? null, cut);
      if (cut && !promisedAlready && !sameInstant(command.acceptsFreeByUtc, cut)) {
        throw new FreeByRequiredError({
          url,
          requiredFreeByUtc: cut,
          nextBookingStartUtc: timing.kind === 'refused' ? null : timing.nextStartUtc,
        });
      }

      // Re-decided like a new booking, except that a confirmed one the floor
      // already said yes to stays confirmed while its start and table hold and
      // its party does not grow — nothing the floor agreed to has changed.
      const decided = keeps
        ? {
            status: 'confirmed' as const,
            awaitingApprovalBecause: null,
            approvalExpiresAtUtc: null,
          }
        : (earlierGuestDecision(table, timing, command.slotUtc, booking.timeZoneId) ??
          decideApproval({
            partySize: command.partySize,
            slotUtc: command.slotUtc,
            timeZoneId: booking.timeZoneId,
          }));
      /*
       * A waiting booking that moves never gets a later deadline than it had:
       * moved from the guest before's two hours into tonight it gets tonight's
       * fifteen minutes, moved around while it waits on the same guest the two
       * hours do not restart, and moving is no way to buy the floor more time.
       * A move to a wait with no clock has none.
       */
      const waitingWindow =
        booking.status === 'pendingApproval' ? (booking.approvalExpiresAtUtc ?? null) : null;
      const decision =
        decided.approvalExpiresAtUtc && waitingWindow
          ? {
              ...decided,
              approvalExpiresAtUtc: new Date(
                Math.min(
                  Date.parse(decided.approvalExpiresAtUtc),
                  Date.parse(waitingWindow),
                  Date.parse(command.slotUtc),
                ),
              ).toISOString(),
            }
          : decided;
      /*
       * Still asking the same guest the same way, it keeps the same question —
       * retimed to the new start, no second push, no new card. Otherwise
       * whatever it was asking is withdrawn and asked afresh.
       */
      const open = openRequestOf(booking.id);
      const sameQuestion =
        open !== null &&
        decision.awaitingApprovalBecause === 'earlierGuestConsent' &&
        timing.kind === 'requestable' &&
        timing.previousId === open.earlierId &&
        open.asksEarlierGuest ===
          answersInApp(timing, {
            partySize: command.partySize,
            slotUtc: command.slotUtc,
            timeZoneId: booking.timeZoneId,
          });
      // A confirmed booking moved into short notice — or onto a table the guest
      // before is asked about — keeps the slot it had until the answer; a
      // change of a change keeps the first one.
      if (
        decision.awaitingApprovalBecause === 'shortNotice' ||
        decision.awaitingApprovalBecause === 'earlierGuestConsent'
      ) {
        if (booking.status === 'confirmed') changeOrigins.set(booking.id, booking);
      } else {
        changeOrigins.delete(booking.id);
      }
      if (sameQuestion && timing.kind === 'requestable') {
        open.requestedStartUtc = command.slotUtc;
        open.freeByUtc = timing.freeByUtc;
      } else {
        withdrawRequestsFor(booking.id);
      }
      const moved: Booking = {
        ...booking,
        ...decision,
        tableId: table.id,
        tableLabel: table.label,
        roomId: table.floorAreaId,
        roomName: table.floorAreaName,
        partySize: command.partySize,
        slotUtc: command.slotUtc,
        // A promise is kept where the booking stays (a yes to a later guest
        // included), and never lengthens the sitting.
        ...promiseAt(
          slot,
          cut ?? (samePlace ? (booking.promisedFreeByUtc ?? null) : null),
          policy.turnMinutes,
        ),
        freeCancellationUntilUtc: new Date(
          slot.getTime() - policy.freeCancellationMinutes * 60_000,
        ).toISOString(),
      };
      bookings.set(booking.id, moved);
      rescheduleLog.set(command.commandId, booking.id);
      if (moved.awaitingApprovalBecause === 'earlierGuestConsent' && !sameQuestion) {
        askEarlierGuest(moved, timing);
      }
      // The guest before moved: whoever was asking for their table is judged again.
      if (askers.size > 0) rejudgeAskersOf(booking.id, now().toISOString());

      // The marks move with it: off the old table, onto the new one.
      floors.set(booking.branchId, {
        ...floor,
        tables: floor.tables.map((t) => {
          if (t.id === table.id) {
            return { ...t, state: 'reservedSoon', nextReservationStartUtc: command.slotUtc };
          }
          if (t.id === booking.tableId && t.nextReservationStartUtc === booking.slotUtc) {
            return { ...t, state: 'free', nextReservationStartUtc: null };
          }
          return t;
        }),
      });

      // The reminder moves too: one not yet read is withdrawn, and the feed
      // writes a fresh one when the new time comes round.
      for (const feed of feeds.values()) {
        for (let i = feed.length - 1; i >= 0; i -= 1) {
          const row = feed[i]!;
          if (row.kind === 'booking-reminder' && row.reservationId === booking.id && !row.read) {
            feed.splice(i, 1);
          }
        }
      }

      return withRequest(moved);
    },
  };
}
