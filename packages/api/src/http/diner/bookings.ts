import type { Booking, MyBookings } from '../../contracts/booking';
import {
  ExtensionsNotOfferedError,
  HoldAlreadyExtendedError,
  HoldNotActiveError,
  TableRequestClosedError,
} from '../../contracts/errors';
import { ApiError } from '../../errors';
import type { YallaGateway } from '../../gateway';
import type { components } from '../../generated/schema';
import { rethrowBookingRefusal } from '../bookingRefusal';
import { guestRecordFromWire } from '../guestRecordMapping';
import { localDateTime } from '../mapping';
import type { ExtendHoldOutcome, ReservationState } from '../../contracts/push';
import { booking, reservationState } from '../dinerMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import { type DinerHttpContext, noteOrNull } from './context';

type Schemas = components['schemas'];

/**
 * `acceptsFreeByUtc` on a booking body, only when one was agreed: an older
 * server then sees exactly the body it always did.
 *
 * Booking times, ahead of the generated request shapes — the bodies are built
 * with `satisfies` against them and this adds the one key they do not have
 * yet. After `api:generate` it can go back inline.
 */
function withFreeBy<T extends object>(
  body: T,
  acceptsFreeByUtc: string | null | undefined,
): T & { readonly acceptsFreeByUtc?: string } {
  return acceptsFreeByUtc ? { ...body, acceptsFreeByUtc } : body;
}

/** `ReservationChannel`: 1 App, 2 Web. */
const CHANNEL_CODE = { app: 1, web: 2 } as const;

export function bookingsMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  | 'createBooking'
  | 'listBookings'
  | 'getBooking'
  | 'cancelBooking'
  | 'rescheduleBooking'
  | 'answerTableRequest'
  | 'getReservationState'
  | 'cancelReservation'
  | 'extendReservationHold'
> {
  const { client, venueNames } = ctx;
  function toBooking(view: Schemas['Yalla.Application.Reservations.ReservationView']): Booking {
    return booking(view, venueNames.get(view.branchId) ?? null);
  }

  type ReservationViewWire = Schemas['Yalla.Application.Reservations.ReservationView'];

  /** `GET /api/reservations/mine`, as the wire has it. */
  async function mineWire(): Promise<Schemas['Yalla.Application.Reservations.MyReservations']> {
    const { data } =
      await client.get<Schemas['Yalla.Application.Reservations.MyReservations']>(
        '/api/reservations/mine',
      );
    return data;
  }

  /**
   * The caller's bookings, split upcoming and past **by the server**, with
   * their own guest record beside them (2026-10-20).
   */
  async function mine(): Promise<MyBookings> {
    const data = await mineWire();
    return {
      upcoming: (data.upcoming ?? []).map(toBooking),
      past: (data.past ?? []).map(toBooking),
      guestRecord: guestRecordFromWire(data.guestRecord),
    };
  }

  async function findMineView(reservationId: string): Promise<ReservationViewWire | null> {
    const data = await mineWire();
    return (
      [...(data.upcoming ?? []), ...(data.past ?? [])].find(
        (entry) => entry.id === reservationId,
      ) ?? null
    );
  }

  async function findMine(reservationId: string): Promise<Booking | null> {
    const view = await findMineView(reservationId);
    return view ? toBooking(view) : null;
  }

  /**
   * `POST /api/reservations/{id}/cancel`, with the one retry rule it needs.
   *
   * Already cancelled is the outcome the diner asked for. This endpoint takes
   * no `clientCommandId`, so a retry after a lost response is
   * indistinguishable from a second tap, and both land as a 409. Reading the
   * booking back and reporting success when it is genuinely cancelled is the
   * honest resolution; reporting a conflict would tell somebody their
   * cancellation failed when it did not.
   */
  async function cancelView(reservationId: string, reason?: string): Promise<ReservationViewWire> {
    try {
      const { data } = await client.post<ReservationViewWire>(
        `/api/reservations/${reservationId}/cancel`,
        reason ? { reason } : {},
      );
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = await findMineView(reservationId);
        // 6 CancelledByDiner, 7 CancelledByVenue.
        if (current && (current.status === 6 || current.status === 7)) return current;
      }
      throw error;
    }
  }

  return {
    // --- Bookings ---------------------------------------------------------------
    //
    // Real, all four. They were answered by the mock even against a real
    // backend, so no reservation ever reached it.

    /**
     * `POST /api/reservations`, in the branch's wall-clock date and time.
     *
     * The server answers 201 for a new booking and 200 for a replay of the same
     * `clientCommandId`, with the same body; both are a booking.
     */
    async createBooking(command): Promise<Booking> {
      const { date, time } = localDateTime(command.slotUtc, command.timeZoneId);
      // Checked against the request shape by `satisfies` while `acceptsFreeByUtc`
      // is ahead of it (booking times); inline again once the schema has it.
      const body = {
        branchId: command.branchId,
        tableId: command.tableId,
        date,
        time,
        partySize: command.partySize,
        guestName: command.guestName,
        guestPhone: command.guestPhone,
        clientCommandId: command.commandId,
        channel: CHANNEL_CODE[command.channel],
        note: noteOrNull(command.note),
      } satisfies Schemas['Yalla.Api.Endpoints.CreateReservationRequest'];
      try {
        const { data } = await client.post<
          Schemas['Yalla.Application.Reservations.ReservationView']
        >('/api/reservations', withFreeBy(body, command.acceptsFreeByUtc));
        return toBooking(data);
      } catch (error) {
        rethrowBookingRefusal(error, command);
      }
    },

    listBookings: mine,

    /** There is no `GET /api/reservations/{id}`; `/mine` is the read. */
    getBooking: findMine,

    async cancelBooking(bookingId): Promise<Booking> {
      return toBooking(await cancelView(bookingId));
    },

    /**
     * `POST /api/reservations/{id}/reschedule`, in the branch's wall-clock date
     * and time like a new booking. 200 with the booking as it now stands —
     * same id, same code — for a change and for a replay of one alike.
     */
    async rescheduleBooking(command): Promise<Booking> {
      const { date, time } = localDateTime(command.slotUtc, command.timeZoneId);
      const body = {
        date,
        time,
        partySize: command.partySize,
        diningTableId: command.tableId,
        clientCommandId: command.commandId,
      } satisfies Schemas['Yalla.Api.Endpoints.RescheduleReservationRequest'];
      try {
        const { data } = await client.post<
          Schemas['Yalla.Application.Reservations.ReservationView']
        >(
          `/api/reservations/${command.bookingId}/reschedule`,
          withFreeBy(body, command.acceptsFreeByUtc),
        );
        return toBooking(data);
      } catch (error) {
        rethrowBookingRefusal(error, {
          branchId: null,
          tableId: command.tableId,
          partySize: command.partySize,
        });
      }
    },

    /**
     * `POST /api/reservations/{id}/table-requests/{requestId}/answer` — the
     * earlier guest's yes or no. The server always answers 200 with the booking
     * as it now stands (a replay too).
     */
    async answerTableRequest({ bookingId, requestId, accept, commandId }): Promise<Booking> {
      let data: ReservationViewWire;
      try {
        ({ data } = await client.post<ReservationViewWire>(
          `/api/reservations/${bookingId}/table-requests/${requestId}/answer`,
          { accept, clientCommandId: commandId },
        ));
      } catch (error) {
        // Lapsed, let go by the later guest, or answered on another device.
        if (
          error instanceof ApiError &&
          (error.status === 409 ||
            error.status === 410 ||
            (error.status === 404 && (error.code ?? '').includes('table-request')))
        ) {
          throw new TableRequestClosedError({ url: error.url, requestId, status: error.status });
        }
        throw error;
      }
      return toBooking(data);
    },

    async getReservationState(reservationId): Promise<ReservationState | null> {
      // There is no `GET /api/reservations/{id}`. `/mine` is the only read, and
      // it is scoped to the caller — which is the right scope for this, since a
      // notification only ever lands on the diner's own booking.
      const found = await findMineView(reservationId);
      return found ? reservationState(found) : null;
    },

    /** The lock-screen cancel. Same route, same already-cancelled rule, as the screen's. */
    async cancelReservation({ reservationId, reason }): Promise<ReservationState> {
      return reservationState(await cancelView(reservationId, reason));
    },

    async extendReservationHold({ reservationId, clientCommandId }): Promise<ExtendHoldOutcome> {
      try {
        const { data } = await client.post<
          Schemas['Yalla.Application.Reservations.ExtendHoldResult']
        >(`/api/reservations/${reservationId}/extend-hold`, {
          clientCommandId,
        } satisfies Schemas['Yalla.Api.Endpoints.ExtendHoldRequest']);
        return {
          reservationId: data.reservationId,
          holdExpiresAtUtc: data.holdExpiresAtUtc,
          extensionMinutes: data.extensionMinutes,
          extensionsRemaining: data.extensionsRemaining,
          wasReplay: data.wasReplay,
        };
      } catch (error) {
        // Each refusal by its own code. This used to read every 409 as "already
        // extended", which told a diner at a branch that offers no extensions —
        // or one tapping days early — that they had already let them know.
        if (error instanceof ApiError && error.status === 409) {
          const base = { url: error.url, reservationId, requestId: error.requestId };
          switch (error.problem?.code) {
            case ProblemCodes.HoldAlreadyExtended:
              throw new HoldAlreadyExtendedError({
                ...base,
                serverDetail: error.problem.detail ?? null,
              });
            case ProblemCodes.HoldNotActive:
              throw new HoldNotActiveError(base);
            case ProblemCodes.ExtensionsNotOffered:
              throw new ExtensionsNotOfferedError(base);
          }
        }
        throw error;
      }
    },
  };
}
