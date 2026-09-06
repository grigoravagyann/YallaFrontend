/**
 * Push registration, and the two things a notification can do without opening
 * the app.
 *
 * The scheduler that sends these shipped in Backend 9 and, until this task,
 * reached nothing: five message types going out to zero registered devices.
 */

/** `Yalla.Domain.Identity.DevicePlatform`: 1 iOS, 2 Android. */
export type DevicePlatform = 'ios' | 'android';

export interface RegisterPushDeviceCommand {
  /** The Expo push token this phone reported. */
  readonly pushToken: string;
  readonly platform: DevicePlatform;
  /**
   * BCP-47, and **the person's language rather than the venue's**.
   *
   * The backend writes to a Russian-speaking regular at an Armenian venue in
   * Russian, and it picks the language from the most recently seen device row —
   * so this field is not a formality, it is where the diner's language actually
   * comes from. Anything unrecognised falls back to Armenian on the server.
   */
  readonly locale: string;
}

/**
 * A booking as the app reads it **when a notification lands on it**.
 *
 * Deliberately not {@link Booking}. That contract carries `venueId`,
 * `venueName`, `floorAreaName`, the availability `window`,
 * `freeCancellationUntilUtc` and `createdAtUtc`, and `ReservationView` — the
 * only reservation shape the wire has — carries none of the six. Wiring
 * `Booking` to the real endpoint would mean inventing all of them.
 *
 * This is the subset that is real, and it is exactly what the landing screen
 * needs to decide whether an action is still worth offering.
 */
export interface ReservationState {
  readonly reservationId: string;
  /** The short code quoted at the door. */
  readonly code: string;
  readonly status: ReservationStatusCode;
  readonly branchId: string;
  readonly branchName: string;
  readonly tableLabel: string;
  readonly partySize: number;
  readonly startUtc: string;
  readonly endUtc: string;
  /** Wall clock at the branch, from the server. */
  readonly localDate: string;
  readonly localStartTime: string;
  /** The branch's zone. Every time on this booking renders in it. */
  readonly timeZoneId: string;
  readonly cancelledAtUtc: string | null;
  /** True when the cancellation came in past the branch's free deadline. */
  readonly cancelledAfterDeadline: boolean;
}

/**
 * `Yalla.Domain.Enums.ReservationStatus`: 1 PendingApproval, 2 Confirmed,
 * 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow.
 *
 * There is no 3, and the two cancellations are **separate members** rather than
 * one `cancelled`. Collapsing them would lose the only thing the diner cares
 * about on that screen: whether they cancelled or the venue did. `unknown`
 * exists for the same reason it does on the tab event stream — an old build must
 * not break on a value added later.
 */
export type ReservationStatusCode =
  | 'pendingApproval'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelledByDiner'
  | 'cancelledByVenue'
  | 'noShow'
  | 'unknown';

/**
 * Whether a notification's action is still worth offering.
 *
 * A reminder fires an hour before; a nudge fires after the slot. Either can be
 * read late — from a lock screen the next morning, or after somebody has already
 * been seated. Offering "Cancel" on a booking that was cancelled two hours ago,
 * or "Extend hold" on a party already at the table, is the kind of thing that
 * makes people stop trusting an action button entirely.
 */
export function actionIsLive(status: ReservationStatusCode): boolean {
  return status === 'confirmed' || status === 'pendingApproval';
}

/** Only a confirmed booking holds a table, so only one can extend that hold. */
export function canExtendHold(status: ReservationStatusCode): boolean {
  return status === 'confirmed';
}

export interface ExtendHoldCommand {
  readonly reservationId: string;
  /**
   * Generated once per user action and **reused on every retry**.
   *
   * The server answers a repeat of the same id with the original result and
   * `wasReplay: true` rather than refusing — which is what makes a notification
   * that is tapped twice on a bad connection safe. A fresh id on retry would
   * turn the second tap into a genuine second attempt, and a genuine second
   * attempt is refused.
   */
  readonly clientCommandId: string;
}

export interface ExtendHoldOutcome {
  readonly reservationId: string;
  readonly holdExpiresAtUtc: string;
  /** How long was added, from the branch's policy. */
  readonly extensionMinutes: number;
  /** Always zero after a successful extension, so a button can be greyed out. */
  readonly extensionsRemaining: number;
  /** The server had this command already. A success, not a duplicate. */
  readonly wasReplay: boolean;
}

/**
 * Cancelling from a notification.
 *
 * **There is no `clientCommandId` here, and its absence is the finding.**
 * `CancelReservationRequest` carries `reason` and nothing else, so unlike every
 * other mutation in the product this one is not keyed for idempotency. The
 * gateway compensates in the only honest way available: a 409 on a booking that
 * is *already cancelled* is reported as success, because the outcome the diner
 * asked for is true. A `clientCommandId` on this endpoint would replace that
 * inference with a fact.
 */
export interface CancelReservationCommand {
  readonly reservationId: string;
  /** Optional free text, recorded on the booking. Never shown to the diner. */
  readonly reason?: string | undefined;
}
