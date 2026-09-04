import type { FloorPlanData } from '@yalla/floorplan/types';
import type {
  Booking,
  CreateBookingCommand,
  PhoneChallenge,
  TableAvailability,
  VenueSummary,
  VerifiedPhone,
} from './contracts/booking';

/**
 * Everything the diner app needs from a data source.
 *
 * Components are typed against this and never against a mock. There are two
 * implementations — `createMockGateway` and `createHttpGateway` — and switching
 * between them is a change to `resolveGateway` alone.
 *
 * Every method may throw the typed errors in `contracts/errors`; the ones that
 * are *expected outcomes* rather than failures are documented per method.
 */
export interface YallaGateway {
  // --- Browse -------------------------------------------------------------
  listVenues(): Promise<readonly VenueSummary[]>;
  getVenue(venueId: string): Promise<VenueSummary | null>;

  /** Current floor state for a branch. */
  getFloorPlan(branchId: string): Promise<FloorPlanData | null>;

  /**
   * Per-table availability for a specific slot and party size.
   *
   * Separate from `getFloorPlan` because availability depends on *when* and
   * *how many*, while the floor itself does not. The backend derives both the
   * window and the "too small / occupied" reasons — the client must not.
   */
  getTableAvailability(input: {
    branchId: string;
    slotUtc: string;
    partySize: number;
  }): Promise<readonly TableAvailability[]>;

  // --- Phone verification -------------------------------------------------
  /**
   * Send a 6-digit code.
   *
   * @throws {RateLimitedError} when too many codes were requested for a number.
   */
  requestPhoneCode(phoneE164: string): Promise<PhoneChallenge>;

  /**
   * Exchange a code for a verification token.
   *
   * @throws {WrongCodeError} wrong digits; carries attempts remaining.
   * @throws {ExpiredCodeError} the challenge aged out.
   * @throws {TooManyAttemptsError} the challenge is burned.
   */
  verifyPhoneCode(input: { challengeId: string; code: string }): Promise<VerifiedPhone>;

  // --- Booking ------------------------------------------------------------
  /**
   * Create a booking. Idempotent on `commandId`: replaying the same command
   * returns the same booking rather than making a second one.
   *
   * A party over the branch's instant-confirmation limit yields a booking with
   * status `pendingApproval` — a normal result, not an error.
   *
   * @throws {TableTakenError} someone else got there first; carries the
   * refreshed floor so the UI can re-render immediately.
   * @throws {LeadTimeExceededError} the slot became too soon while deciding.
   */
  createBooking(command: CreateBookingCommand): Promise<Booking>;

  listBookings(): Promise<readonly Booking[]>;
  getBooking(bookingId: string): Promise<Booking | null>;

  /**
   * Cancel a booking. Never refuses: cancelling late is far better for the
   * venue than a no-show, so lateness is a message, not a block.
   */
  cancelBooking(bookingId: string): Promise<Booking>;
}
