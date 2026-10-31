/**
 * GENERATED FILE — do not edit.
 *
 * Source: http://127.0.0.1:5391/swagger/v1/swagger.json (the `x-problem-codes` extension)
 * Regenerate with: pnpm api:generate
 *
 * Every problem code the backend answers with. Each is declared once, on its
 * constant in the backend’s `src/Yalla.Api/Errors/ErrorCodes.cs`: the slug, the
 * HTTP status it always carries and the members of its `context`. Branch on
 * `ProblemCodes.X`, never on a hand-typed slug, so a code the backend drops or
 * renames is a compile error here rather than a branch that silently never runs.
 *
 * A context member that is not optional is present whenever `context` is; some
 * codes answer without a context on some routes. Read values defensively all the
 * same — an older server may lag behind this file.
 */

/* eslint-disable */

import type { components } from './schema';

/** Every problem code, by the name of its backend constant. */
export const ProblemCodes = {
  /** 401 Account inactive — The account or staff member behind the credential is no longer active. */
  AccountInactive: 'account-inactive',
  /** 403 Account locked — The account is locked, not the credential wrong. */
  AccountLocked: 'account-locked',
  /** 422 Export too large — A History export would carry more rows than a file may. */
  ActivityExportTooLarge: 'activity-export-too-large',
  /** 409 Asked a moment ago — "Ask: are you coming?" within fifteen minutes of the last ask. */
  AskOnMyWayAskedRecently: 'ask-on-my-way-asked-recently',
  /** 409 Booking not expecting anybody — "Ask: are you coming?" for a booking that is not confirmed, or has started. */
  AskOnMyWayNotOpen: 'ask-on-my-way-not-open',
  /** 409 Too early to ask — "Ask: are you coming?" more than two hours before the start. */
  AskOnMyWayTooEarly: 'ask-on-my-way-too-early',
  /** 403 Booking paused after missed bookings — The guest missed three bookings in three days and cannot book until the block ends. */
  BookingBlockedNoShows: 'booking-blocked-no-shows',
  /** 409 Booking has ended — The booking is over: past its end, or its sitting has finished. */
  BookingEnded: 'booking-ended',
  /** 409 Booking not active — The booking is not expecting its party: awaiting approval, cancelled, or a no-show. */
  BookingNotActive: 'booking-not-active',
  /** 404 Booking not found — None of the caller's bookings carries that code. */
  BookingNotFound: 'booking-not-found',
  /** 409 Booked table still occupied — The booked table still has another party's sitting open; staff must free it. */
  BookingTableOccupied: 'booking-table-occupied',
  /** 409 Too early for this booking — The booking's table is not being held for the party yet; context says from when. */
  BookingTooEarly: 'booking-too-early',
  /** 409 Bookings not accepted — A booking from the diner app at a branch that is not taking app bookings. */
  BookingsNotAccepted: 'bookings-not-accepted',
  /** 409 Branch is not ready for diners — The branch's menu has unfinished dishes, so table service cannot be turned on. */
  BranchNotReady: 'branch-not-ready',
  /** 409 Branch not open for business — The branch is not open for business: venue suspended or deleted, or branch switched off. */
  BranchUnavailable: 'branch-unavailable',
  /** 409 Command id already used — The clientCommandId already belongs to another caller's command; start again with a fresh one. */
  ClientCommandIdInUse: 'client-command-id-in-use',
  /** 409 Concurrent update — Someone else changed the row first: re-read and retry. */
  ConcurrentUpdate: 'concurrent-update',
  /** 409 Conflicting state — The operation is not legal in the current state; a staff order's unorderable guest, or the branch whose open tabs keep table service on, is named in context. */
  ConflictingState: 'conflicting-state',
  /** 409 Conversation closed — Writing to a guest-message thread that has closed. */
  ConversationClosed: 'conversation-closed',
  /** 401 Credentials invalid — An admin-panel email and password did not match an account. */
  CredentialsInvalid: 'credentials-invalid',
  /** 401 Device revoked — The tablet or device is no longer enrolled; ask a manager to enrol it again. */
  DeviceRevoked: 'device-revoked',
  /** 409 Email address taken — The email address on a diner sign-up or profile edit is somebody else's. */
  EmailTaken: 'email-taken',
  /** 401 Enrolment code expired — The tablet enrolment code has expired; ask a manager for a new one. */
  EnrolmentCodeExpired: 'enrolment-code-expired',
  /** 401 Enrolment code invalid — The tablet enrolment code is not valid. */
  EnrolmentCodeInvalid: 'enrolment-code-invalid',
  /** 409 Hold extensions not offered — The branch offers no hold extensions. */
  ExtensionsNotOffered: 'extensions-not-offered',
  /** 409 Feature not enabled for this branch — The platform has not allowed this feature at the branch. */
  FeatureNotEnabled: 'feature-not-enabled',
  /** 409 Floor plan changed — The floor plan was saved by somebody else since the editor loaded it. */
  FloorPlanChanged: 'floor-plan-changed',
  /** 422 Floor plan invalid — The floor plan cannot be applied; every reason is listed. */
  FloorPlanInvalid: 'floor-plan-invalid',
  /** 403 Forbidden — The caller is not allowed to do this. */
  Forbidden: 'forbidden',
  /** 409 The guest has answered — "Ask: are you coming?" when the guest already said on my way or running late. */
  GuestAlreadyAnswered: 'guest-already-answered',
  /** 403 This venue takes no written messages — A guest's typed message where the venue switched guest messages off. */
  GuestsCannotWrite: 'guests-cannot-write',
  /** 409 Hold already extended — The booking's one hold extension is already used. */
  HoldAlreadyExtended: 'hold-already-extended',
  /** 409 No table being held yet — "Keep my table" with no table being held yet. */
  HoldNotActive: 'hold-not-active',
  /** 500 Internal error — Anything unhandled; quote the traceId when reporting it. */
  InternalError: 'internal-error',
  /** 401 Invalid credentials — A diner's identifier and password, or current password, did not match a usable account. */
  InvalidCredentials: 'invalid-credentials',
  /** 400 Invalid request — The request violated a domain rule or arrived malformed; context names the field when one is to blame. */
  InvalidRequest: 'invalid-request',
  /** 422 Invalid table transition — The table cannot make that transition from its current status. */
  InvalidTableTransition: 'invalid-table-transition',
  /** 401 Join token invalid — The tab invitation is no longer valid; ask the host for a new one. */
  JoinTokenInvalid: 'join-token-invalid',
  /** 409 No phone for kitchen staff — A phone cannot be paired to kitchen staff: the kitchen works on its tablet. */
  KitchenPhoneNotAllowed: 'kitchen-phone-not-allowed',
  /** 409 Line already paid for — Removing this line would reverse money already taken; that is a refund. */
  LineAlreadyPaid: 'line-already-paid',
  /** 409 Item unavailable — A dish on the order has sold out; context names it. */
  MenuItemUnavailable: 'menu-item-unavailable',
  /** 429 Messages too fast — A guest writing more than five messages a minute, or sixty in one thread. */
  MessagesTooFast: 'messages-too-fast',
  /** 409 Too late to withdraw this no-show — A no-show can no longer be withdrawn: its service day ended. */
  NoShowUndoWindowClosed: 'no-show-undo-window-closed',
  /** 404 Not found — The thing addressed does not exist; a staff order's missing guest is named in context. */
  NotFound: 'not-found',
  /** 409 Booking not expecting you — "On my way" for a booking that is not expecting anybody now. */
  OnMyWayNotOpen: 'on-my-way-not-open',
  /** 401 Pairing code expired — The phone pairing code is past its ten minutes, or a newer one replaced it. */
  PairingCodeExpired: 'pairing-code-expired',
  /** 401 Pairing code not valid — The phone pairing code is unknown: mistyped, or a tablet's enrolment code. */
  PairingCodeInvalid: 'pairing-code-invalid',
  /** 409 Payment exceeds the balance — More was offered than the tab still owes; context carries the balance. */
  PaymentExceedsRemaining: 'payment-exceeds-remaining',
  /** 409 This number holds as many bookings as it can — The booker's proved number already holds as many active bookings as one number may. */
  PhoneHasActiveBooking: 'phone-has-active-booking',
  /** 409 Phone number already has an account — The phone number on a diner sign-up already has an account; log in with a code instead. */
  PhoneInUse: 'phone-in-use',
  /** 403 Phone number not verified — The diner's phone number has never been proved, and the request would land on it. */
  PhoneNotVerified: 'phone-not-verified',
  /** 401 Pin invalid — The staff PIN was not recognised. */
  PinInvalid: 'pin-invalid',
  /** 409 PIN already in use on this tablet — The PIN is already used by somebody else who signs in on the same tablet. */
  PinTaken: 'pin-taken',
  /** 409 Pre-order already sent to the kitchen — The kitchen already has the pre-order, so it no longer changes. */
  PreOrderAlreadySent: 'pre-order-already-sent',
  /** 422 Dishes cannot be pre-ordered — Dishes that cannot be pre-ordered, every one named with why. */
  PreOrderItemsUnavailable: 'pre-order-items-unavailable',
  /** 409 Pre-order closed — The pre-order can no longer be changed by the guest: two hours before the start or later. */
  PreOrderLocked: 'pre-order-locked',
  /** 409 Pre-order cannot be sent now — Not the time or the state to send a pre-order to the kitchen, or mark the party not coming. */
  PreOrderNotSendable: 'pre-order-not-sendable',
  /** 409 Pre-orders not accepted — The branch does not take pre-orders. */
  PreOrdersNotAccepted: 'pre-orders-not-accepted',
  /** 409 Precondition failed — A queued command describes a table that has since moved; resolve it from the conflict list. */
  PreconditionFailed: 'precondition-failed',
  /** 429 Rate limited — Too many requests in the window; wait for Retry-After. */
  RateLimited: 'rate-limited',
  /** 401 Refresh token invalid — The refresh token is unknown, expired or revoked; sign in again. */
  RefreshTokenInvalid: 'refresh-token-invalid',
  /** 401 Refresh token reused — A refresh token already rotated was presented again; its whole chain is revoked. */
  RefreshTokenReused: 'refresh-token-reused',
  /** 403 Relocation not allowed — Moving a branch (address or map pin) is for an owner or platform admin; nothing was saved. */
  RelocationNotAllowed: 'relocation-not-allowed',
  /** 400 Report range too long — The report range is longer than any report will run. */
  ReportRangeTooLong: 'report-range-too-long',
  /** 409 Too late to answer this booking — Approving or declining a booking whose chance to be answered has gone. */
  ReservationApprovalExpired: 'reservation-approval-expired',
  /** 409 Waiting for the guest before to answer — Staff deciding a booking that waits on the guest before it on the table to answer. */
  ReservationAwaitingEarlierGuest: 'reservation-awaiting-earlier-guest',
  /** 409 Cancelled: the guest is blocked for no-shows — Approving or rejecting a booking its guest's no-show block cancelled. */
  ReservationCancelledByBlock: 'reservation-cancelled-by-block',
  /** 422 Free the table by the time required — The next booking cuts the sitting short and the booking did not accept the time to free the table by. */
  ReservationFreeByRequired: 'reservation-free-by-required',
  /** 422 Reservation lead time too short — The slot starts sooner than the branch's minimum lead time. */
  ReservationLeadTimeTooShort: 'reservation-lead-time-too-short',
  /** 422 Reservation local time does not exist — The wall-clock time picked does not exist in the branch's zone (a clock change skips it). */
  ReservationLocalTimeDoesNotExist: 'reservation-local-time-does-not-exist',
  /** 503 Reservation lock timeout — The booking could not get the table's lock in time; retry with the same clientCommandId. */
  ReservationLockTimeout: 'reservation-lock-timeout',
  /** 409 Booking can no longer be changed — A change to a booking that is no longer pending or confirmed, or has started. */
  ReservationNotChangeable: 'reservation-not-changeable',
  /** 409 Booking has not started yet — A no-show recorded against a booking whose start has not come yet. */
  ReservationNotStarted: 'reservation-not-started',
  /** 422 Reservation outside booking window — The date is further ahead than the branch takes bookings. */
  ReservationOutsideBookingWindow: 'reservation-outside-booking-window',
  /** 422 Reservation outside opening hours — The sitting does not fit inside one opening block of the branch's day. */
  ReservationOutsideOpeningHours: 'reservation-outside-opening-hours',
  /** 409 You already have a booking then — The sitting overlaps another of the diner's own live bookings; context names it (not on a manage link). */
  ReservationOverlapsOwn: 'reservation-overlaps-own',
  /** 422 Reservation party exceeds capacity — More guests than the table has seats. */
  ReservationPartyExceedsCapacity: 'reservation-party-exceeds-capacity',
  /** 422 Reservation seat overhang exceeded — The party would leave more seats empty than the branch allows. */
  ReservationSeatOverhangExceeded: 'reservation-seat-overhang-exceeded',
  /** 422 Reservation table not bookable — The table never takes bookings: a bar stool, a counter seat. */
  ReservationTableNotBookable: 'reservation-table-not-bookable',
  /** 422 Reservation table out of service — The table is withdrawn from service. */
  ReservationTableOutOfService: 'reservation-table-out-of-service',
  /** 401 Reset token invalid — The password reset link is unknown, spent or expired; ask for a new one. */
  ResetTokenInvalid: 'reset-token-invalid',
  /** 403 Review needs a visit — A first review of a branch from a diner with no visit there in the window. */
  ReviewNeedsVisit: 'review-needs-visit',
  /** 409 Ask a waiter — A scan refused for a while after a waiter turned this phone or table away. */
  ScanTurnedAway: 'scan-turned-away',
  /** 429 Too many requests from this table — This table has asked for staff too many times too quickly. */
  ServiceRequestRateLimited: 'service-request-rate-limited',
  /** 401 Session expired — The staff PIN session timed out; tap the PIN again. */
  SessionExpired: 'session-expired',
  /** 401 Session invalid — The staff PIN session is no longer valid; tap the PIN again. */
  SessionInvalid: 'session-invalid',
  /** 401 Session revoked — The token's session has ended; refresh once, then sign out. */
  SessionRevoked: 'session-revoked',
  /** 409 Sign-in not identified — The token names no sign-in, so "sign out everywhere else" cannot tell which to keep. */
  SignInUnknown: 'sign-in-unknown',
  /** 503 Codes by SMS unavailable — No SMS provider is configured, so no code can be sent; prove the number with Telegram. */
  SmsUnavailable: 'sms-unavailable',
  /** 409 Already decided — Admitting a tab already turned away, or turning away one already admitted. */
  TabAdmissionDecided: 'tab-admission-decided',
  /** 409 Waiting for a waiter — The tab waits for a waiter to let it order. */
  TabAwaitingAdmission: 'tab-awaiting-admission',
  /** 409 Tab not accepting orders — The tab takes no more orders: the bill has been asked for, or it is closed. */
  TabNotAcceptingOrders: 'tab-not-accepting-orders',
  /** 409 Nothing to hand over — A table whose bill is closed or written off, or whose party has gone, has nobody to hand over. */
  TabNotTransferable: 'tab-not-transferable',
  /** 409 Table already booked — The table was booked by somebody else between seeing it free and confirming. */
  TableAlreadyBooked: 'table-already-booked',
  /** 409 Table currently occupied — A party seated at the table now runs into the requested slot; it may free up early. */
  TableCurrentlyOccupied: 'table-currently-occupied',
  /** 409 Table has upcoming bookings — A table with a booking still to come cannot be deleted, nor left out of a floor-plan save. */
  TableHasFutureBookings: 'table-has-future-bookings',
  /** 503 Table busy — A table write waited too long for another writer; retry, nothing was decided. */
  TableLockTimeout: 'table-lock-timeout',
  /** 409 Nobody seated at this table — Staff tried to open a tab on a table with nobody seated at it. */
  TableNotSeated: 'table-not-seated',
  /** 409 This request no longer needs an answer — An answer to a request for the table that no longer waits. */
  TableRequestNotPending: 'table-request-not-pending',
  /** 409 Table sitting changed — A free that named a booking found another sitting, or none, open at the table. */
  TableSittingChanged: 'table-sitting-changed',
  /** 409 Table state conflict — Somebody else changed this table first; redraw it from the current state. */
  TableStateConflict: 'table-state-conflict',
  /** 409 Kitchen busy — ASAP while the kitchen has as many takeaway orders in progress as the venue allows. */
  TakeawayBusy: 'takeaway-busy',
  /** 409 Takeaway closed now — Closed for takeaway now: shut, or past the last order. */
  TakeawayClosed: 'takeaway-closed',
  /** 422 Dishes not for takeaway — Dishes that cannot be ordered to take away, every one named with why. */
  TakeawayItemsUnavailable: 'takeaway-items-unavailable',
  /** 409 Too early for a no-show — "No-show" for a takeaway order before thirty minutes past ready. */
  TakeawayNoShowTooEarly: 'takeaway-no-show-too-early',
  /** 409 Takeaway not offered — The branch does not take takeaway orders. */
  TakeawayNotAccepted: 'takeaway-not-accepted',
  /** 409 Pickup time unavailable — The pickup time asked for is not one on offer; context lists the slots on offer now. */
  TakeawaySlotUnavailable: 'takeaway-slot-unavailable',
  /** 409 Order has moved on — The takeaway order is not in the state for that move; context says where it is now. */
  TakeawayStatusConflict: 'takeaway-status-conflict',
  /** 410 Telegram verification no longer available — A Telegram verification challenge that can no longer be claimed; start again. */
  TelegramVerificationExpired: 'telegram-verification-expired',
  /** 409 Time full — There is no room for that many guests at that time. */
  TimeFull: 'time-full',
  /** 429 Too many attempts — A one-time credential is out of attempts, or a per-identity limit is spent; ask for a new code. */
  TooManyAttempts: 'too-many-attempts',
  /** 422 Cannot take this table — The waiter named cannot take the table. */
  TransferTargetIneligible: 'transfer-target-ineligible',
  /** 401 Not authenticated — No usable credential was presented (declared for clients; a bare 401 carries no body). */
  Unauthenticated: 'unauthenticated',
  /** 409 Unsupported image — An upload is not a JPEG, PNG or WebP, or is too large to store. */
  UnsupportedImage: 'unsupported-image',
  /** 409 Username taken — The username on a diner sign-up or profile edit is somebody else's. */
  UsernameTaken: 'username-taken',
  /** 422 Validation failed — Field-level validation failed; every offending field is named. */
  ValidationFailed: 'validation-failed',
  /** 409 Venue cannot be deleted — The venue has open tabs or future bookings and cannot be deleted. */
  VenueDeletionBlocked: 'venue-deletion-blocked',
  /** 401 Verification code expired — The one-time code has expired; ask for a new one. */
  VerificationCodeExpired: 'verification-code-expired',
  /** 401 Verification code invalid — A one-time code that was not accepted; context says how many tries are left. */
  VerificationCodeInvalid: 'verification-code-invalid',
  /** 403 Only managers write to guests here — A waiter writing to a guest where the venue keeps messages to managers. */
  WaitersCannotWrite: 'waiters-cannot-write',
  /** 409 Web bookings not accepted — The branch does not take bookings from its public page. */
  WebBookingsNotAccepted: 'web-bookings-not-accepted',
} as const;

/** Any problem code the backend declares. */
export type ProblemCode = (typeof ProblemCodes)[keyof typeof ProblemCodes];

/** The HTTP status each code always answers with. */
export const PROBLEM_CODE_STATUS = {
  'account-inactive': 401,
  'account-locked': 403,
  'activity-export-too-large': 422,
  'ask-on-my-way-asked-recently': 409,
  'ask-on-my-way-not-open': 409,
  'ask-on-my-way-too-early': 409,
  'booking-blocked-no-shows': 403,
  'booking-ended': 409,
  'booking-not-active': 409,
  'booking-not-found': 404,
  'booking-table-occupied': 409,
  'booking-too-early': 409,
  'bookings-not-accepted': 409,
  'branch-not-ready': 409,
  'branch-unavailable': 409,
  'client-command-id-in-use': 409,
  'concurrent-update': 409,
  'conflicting-state': 409,
  'conversation-closed': 409,
  'credentials-invalid': 401,
  'device-revoked': 401,
  'email-taken': 409,
  'enrolment-code-expired': 401,
  'enrolment-code-invalid': 401,
  'extensions-not-offered': 409,
  'feature-not-enabled': 409,
  'floor-plan-changed': 409,
  'floor-plan-invalid': 422,
  'forbidden': 403,
  'guest-already-answered': 409,
  'guests-cannot-write': 403,
  'hold-already-extended': 409,
  'hold-not-active': 409,
  'internal-error': 500,
  'invalid-credentials': 401,
  'invalid-request': 400,
  'invalid-table-transition': 422,
  'join-token-invalid': 401,
  'kitchen-phone-not-allowed': 409,
  'line-already-paid': 409,
  'menu-item-unavailable': 409,
  'messages-too-fast': 429,
  'no-show-undo-window-closed': 409,
  'not-found': 404,
  'on-my-way-not-open': 409,
  'pairing-code-expired': 401,
  'pairing-code-invalid': 401,
  'payment-exceeds-remaining': 409,
  'phone-has-active-booking': 409,
  'phone-in-use': 409,
  'phone-not-verified': 403,
  'pin-invalid': 401,
  'pin-taken': 409,
  'pre-order-already-sent': 409,
  'pre-order-items-unavailable': 422,
  'pre-order-locked': 409,
  'pre-order-not-sendable': 409,
  'pre-orders-not-accepted': 409,
  'precondition-failed': 409,
  'rate-limited': 429,
  'refresh-token-invalid': 401,
  'refresh-token-reused': 401,
  'relocation-not-allowed': 403,
  'report-range-too-long': 400,
  'reservation-approval-expired': 409,
  'reservation-awaiting-earlier-guest': 409,
  'reservation-cancelled-by-block': 409,
  'reservation-free-by-required': 422,
  'reservation-lead-time-too-short': 422,
  'reservation-local-time-does-not-exist': 422,
  'reservation-lock-timeout': 503,
  'reservation-not-changeable': 409,
  'reservation-not-started': 409,
  'reservation-outside-booking-window': 422,
  'reservation-outside-opening-hours': 422,
  'reservation-overlaps-own': 409,
  'reservation-party-exceeds-capacity': 422,
  'reservation-seat-overhang-exceeded': 422,
  'reservation-table-not-bookable': 422,
  'reservation-table-out-of-service': 422,
  'reset-token-invalid': 401,
  'review-needs-visit': 403,
  'scan-turned-away': 409,
  'service-request-rate-limited': 429,
  'session-expired': 401,
  'session-invalid': 401,
  'session-revoked': 401,
  'sign-in-unknown': 409,
  'sms-unavailable': 503,
  'tab-admission-decided': 409,
  'tab-awaiting-admission': 409,
  'tab-not-accepting-orders': 409,
  'tab-not-transferable': 409,
  'table-already-booked': 409,
  'table-currently-occupied': 409,
  'table-has-future-bookings': 409,
  'table-lock-timeout': 503,
  'table-not-seated': 409,
  'table-request-not-pending': 409,
  'table-sitting-changed': 409,
  'table-state-conflict': 409,
  'takeaway-busy': 409,
  'takeaway-closed': 409,
  'takeaway-items-unavailable': 422,
  'takeaway-no-show-too-early': 409,
  'takeaway-not-accepted': 409,
  'takeaway-slot-unavailable': 409,
  'takeaway-status-conflict': 409,
  'telegram-verification-expired': 410,
  'time-full': 409,
  'too-many-attempts': 429,
  'transfer-target-ineligible': 422,
  'unauthenticated': 401,
  'unsupported-image': 409,
  'username-taken': 409,
  'validation-failed': 422,
  'venue-deletion-blocked': 409,
  'verification-code-expired': 401,
  'verification-code-invalid': 401,
  'waiters-cannot-write': 403,
  'web-bookings-not-accepted': 409,
} as const satisfies { readonly [C in ProblemCode]: number };

/** `account-locked` (403): The account is locked, not the credential wrong. */
export interface AccountLockedProblemContext {
  readonly lockedUntilUtc: string | null;
}

/** `activity-export-too-large` (422): A History export would carry more rows than a file may. */
export interface ActivityExportTooLargeProblemContext {
  readonly rows: number;
  readonly maxRows: number;
}

/** `ask-on-my-way-asked-recently` (409): "Ask: are you coming?" within fifteen minutes of the last ask. */
export interface AskOnMyWayAskedRecentlyProblemContext {
  readonly reservationId: string;
  readonly askedAtUtc: string;
  readonly nextAllowedAtUtc: string;
}

/** `ask-on-my-way-not-open` (409): "Ask: are you coming?" for a booking that is not confirmed, or has started. */
export interface AskOnMyWayNotOpenProblemContext {
  readonly reservationId: string;
  /** `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow. */
  readonly status: 1 | 2 | 4 | 5 | 6 | 7 | 8;
  readonly startUtc: string;
}

/** `ask-on-my-way-too-early` (409): "Ask: are you coming?" more than two hours before the start. */
export interface AskOnMyWayTooEarlyProblemContext {
  readonly reservationId: string;
  readonly opensAtUtc: string;
}

/** `booking-blocked-no-shows` (403): The guest missed three bookings in three days and cannot book until the block ends. */
export interface BookingBlockedNoShowsProblemContext {
  readonly blockedUntilUtc: string;
}

/** `booking-ended` (409): The booking is over: past its end, or its sitting has finished. */
export interface BookingEndedProblemContext {
  readonly reservationId: string;
  /** `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow. */
  readonly status: 1 | 2 | 4 | 5 | 6 | 7 | 8;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly earliestUtc: string;
  readonly tableLabel: string | null;
}

/** `booking-not-active` (409): The booking is not expecting its party: awaiting approval, cancelled, or a no-show. */
export interface BookingNotActiveProblemContext {
  readonly reservationId: string;
  /** `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow. */
  readonly status: 1 | 2 | 4 | 5 | 6 | 7 | 8;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly earliestUtc: string;
  readonly tableLabel: string | null;
}

/** `booking-table-occupied` (409): The booked table still has another party's sitting open; staff must free it. */
export interface BookingTableOccupiedProblemContext {
  readonly reservationId: string;
  /** `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow. */
  readonly status: 1 | 2 | 4 | 5 | 6 | 7 | 8;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly earliestUtc: string;
  readonly tableLabel: string | null;
}

/** `booking-too-early` (409): The booking's table is not being held for the party yet; context says from when. */
export interface BookingTooEarlyProblemContext {
  readonly reservationId: string;
  /** `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow. */
  readonly status: 1 | 2 | 4 | 5 | 6 | 7 | 8;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly earliestUtc: string;
  readonly tableLabel: string | null;
}

/** `bookings-not-accepted` (409): A booking from the diner app at a branch that is not taking app bookings. */
export interface BookingsNotAcceptedProblemContext {
  readonly branchId: string;
}

/** `branch-not-ready` (409): The branch's menu has unfinished dishes, so table service cannot be turned on. */
export interface BranchNotReadyProblemContext {
  readonly branchId: string;
  readonly incompleteMenuItemCount: number;
}

/** `branch-unavailable` (409): The branch is not open for business: venue suspended or deleted, or branch switched off. */
export interface BranchUnavailableProblemContext {
  readonly branchId: string;
  readonly reason: string;
}

/** `concurrent-update` (409): Someone else changed the row first: re-read and retry. */
export interface ConcurrentUpdateProblemContext {
  readonly currentVersion: string;
}

/** `conflicting-state` (409): The operation is not legal in the current state; a staff order's unorderable guest, or the branch whose open tabs keep table service on, is named in context. */
export interface ConflictingStateProblemContext {
  readonly field?: string;
  readonly participantId?: string;
  /** `ParticipantStatus`: 1 PendingApproval, 2 Approved, 3 Removed. */
  readonly participantStatus?: 1 | 2 | 3;
  readonly branchId?: string;
  readonly openTabCount?: number;
}

/** `conversation-closed` (409): Writing to a guest-message thread that has closed. */
export interface ConversationClosedProblemContext {
  readonly subjectKind: string;
  readonly subjectId: string;
  readonly closedAtUtc: string;
}

/** `email-taken` (409): The email address on a diner sign-up or profile edit is somebody else's. */
export interface EmailTakenProblemContext {
  readonly field: string;
}

/** `extensions-not-offered` (409): The branch offers no hold extensions. */
export interface ExtensionsNotOfferedProblemContext {
  readonly reservationId: string;
  readonly startUtc: string;
}

/** `feature-not-enabled` (409): The platform has not allowed this feature at the branch. */
export interface FeatureNotEnabledProblemContext {
  /** `BranchFeature`: 1 AppBookings, 2 WebBookings, 3 PreOrders, 4 Takeaway, 5 TableService, 6 GuestMessages, 7 Reviews, 8 StaffPhone, 9 KitchenDisplay, 10 Reports. */
  readonly feature: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  readonly branchId: string;
}

/** `floor-plan-changed` (409): The floor plan was saved by somebody else since the editor loaded it. */
export interface FloorPlanChangedProblemContext {
  readonly currentVersion: string;
}

/** `floor-plan-invalid` (422): The floor plan cannot be applied; every reason is listed. */
export interface FloorPlanInvalidProblemContext {
  readonly errors: readonly string[];
  readonly duplicateLabels: readonly string[];
}

/** `forbidden` (403): The caller is not allowed to do this. */
export interface ForbiddenProblemContext {
  readonly operation?: string;
  /** `StaffRole`: 0 Unknown, 1 Owner, 2 Manager, 3 Waiter, 4 Kitchen, 5 PlatformAdmin, 6 GeneralManager. */
  readonly requiredRole?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly requirement?: string;
  readonly subject?: string;
}

/** `guest-already-answered` (409): "Ask: are you coming?" when the guest already said on my way or running late. */
export interface GuestAlreadyAnsweredProblemContext {
  readonly reservationId: string;
  readonly answeredAtUtc: string;
  readonly runningLateMinutes?: number;
}

/** `guests-cannot-write` (403): A guest's typed message where the venue switched guest messages off. */
export interface GuestsCannotWriteProblemContext {
  readonly branchId: string;
}

/** `hold-already-extended` (409): The booking's one hold extension is already used. */
export interface HoldAlreadyExtendedProblemContext {
  readonly reservationId: string;
  readonly startUtc: string;
}

/** `hold-not-active` (409): "Keep my table" with no table being held yet. */
export interface HoldNotActiveProblemContext {
  readonly reservationId: string;
  readonly startUtc: string;
}

/** `invalid-request` (400): The request violated a domain rule or arrived malformed; context names the field when one is to blame. */
export interface InvalidRequestProblemContext {
  readonly field: string;
  readonly value?: unknown;
}

/** `invalid-table-transition` (422): The table cannot make that transition from its current status. */
export interface InvalidTableTransitionProblemContext {
  readonly tableId: string;
  readonly tableLabel: string;
  /** `TableStatus`: 1 Free, 2 Held, 4 Occupied, 5 OutOfService. */
  readonly fromStatus: 1 | 2 | 4 | 5;
  /** `TableStatus`: 1 Free, 2 Held, 4 Occupied, 5 OutOfService. */
  readonly attemptedToStatus: 1 | 2 | 4 | 5;
  readonly allowedFromHere: readonly (1 | 2 | 4 | 5)[];
}

/** `kitchen-phone-not-allowed` (409): A phone cannot be paired to kitchen staff: the kitchen works on its tablet. */
export interface KitchenPhoneNotAllowedProblemContext {
  readonly staffMemberId: string;
}

/** `line-already-paid` (409): Removing this line would reverse money already taken; that is a refund. */
export interface LineAlreadyPaidProblemContext {
  readonly tabId: string;
  readonly lineId: string;
}

/** `menu-item-unavailable` (409): A dish on the order has sold out; context names it. */
export interface MenuItemUnavailableProblemContext {
  readonly menuItemId: string;
  readonly itemName: string;
}

/** `messages-too-fast` (429): A guest writing more than five messages a minute, or sixty in one thread. */
export interface MessagesTooFastProblemContext {
  readonly conversationId: string;
  readonly perMinute: number;
  readonly perConversation: number;
  readonly retryAfterUtc?: string;
}

/** `no-show-undo-window-closed` (409): A no-show can no longer be withdrawn: its service day ended. */
export interface NoShowUndoWindowClosedProblemContext {
  readonly undoableUntilUtc: string;
}

/** `not-found` (404): The thing addressed does not exist; a staff order's missing guest is named in context. */
export interface NotFoundProblemContext {
  readonly field: string;
  readonly participantId: string;
}

/** `on-my-way-not-open` (409): "On my way" for a booking that is not expecting anybody now. */
export interface OnMyWayNotOpenProblemContext {
  readonly reservationId: string;
  /** `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow. */
  readonly status: 1 | 2 | 4 | 5 | 6 | 7 | 8;
  readonly opensAtUtc: string;
}

/** `payment-exceeds-remaining` (409): More was offered than the tab still owes; context carries the balance. */
export interface PaymentExceedsRemainingProblemContext {
  readonly tabId: string;
  readonly requestedAmd: number;
  readonly remainingAmd: number;
}

/** `phone-has-active-booking` (409): The booker's proved number already holds as many active bookings as one number may. */
export interface PhoneHasActiveBookingProblemContext {
  readonly maxActiveBookings: number;
  readonly reservationId?: string;
  readonly code?: string;
  readonly startUtc?: string;
  readonly localDate?: string;
  readonly localStartTime?: string;
  readonly venueName?: string;
  readonly branchName?: string;
}

/** `phone-in-use` (409): The phone number on a diner sign-up already has an account; log in with a code instead. */
export interface PhoneInUseProblemContext {
  readonly field: string;
}

/** `pin-taken` (409): The PIN is already used by somebody else who signs in on the same tablet. */
export interface PinTakenProblemContext {
  readonly field: string;
}

/** `pre-order-already-sent` (409): The kitchen already has the pre-order, so it no longer changes. */
export interface PreOrderAlreadySentProblemContext {
  readonly reservationId: string;
  readonly sentAtUtc: string;
}

/** `pre-order-items-unavailable` (422): Dishes that cannot be pre-ordered, every one named with why. */
export interface PreOrderItemsUnavailableProblemContext {
  readonly items: readonly ({
      readonly menuItemId: string;
      /** `PreOrderItemRefusal`: 1 NotOnMenu, 2 SoldOut, 3 NotForPreOrder. */
      readonly reason: 1 | 2 | 3;
    })[];
}

/** `pre-order-locked` (409): The pre-order can no longer be changed by the guest: two hours before the start or later. */
export interface PreOrderLockedProblemContext {
  readonly reservationId: string;
  readonly lockedAtUtc: string;
}

/** `pre-order-not-sendable` (409): Not the time or the state to send a pre-order to the kitchen, or mark the party not coming. */
export interface PreOrderNotSendableProblemContext {
  readonly reservationId: string;
  /** `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow. */
  readonly status: 1 | 2 | 4 | 5 | 6 | 7 | 8;
  readonly sendableFromUtc: string;
  readonly endUtc: string;
}

/** `pre-orders-not-accepted` (409): The branch does not take pre-orders. */
export interface PreOrdersNotAcceptedProblemContext {
  readonly branchId: string;
}

/** `precondition-failed` (409): A queued command describes a table that has since moved; resolve it from the conflict list. */
export interface PreconditionFailedProblemContext {
  readonly tableId: string;
  readonly tableLabel: string;
  /** `TableStatus`: 1 Free, 2 Held, 4 Occupied, 5 OutOfService. */
  readonly expectedFromStatus: 1 | 2 | 4 | 5;
  /** `TableStatus`: 1 Free, 2 Held, 4 Occupied, 5 OutOfService. */
  readonly currentStatus: 1 | 2 | 4 | 5;
  /** `PreconditionFailure`: 1 StatusChanged, 2 TableChangedAndChangedBack. */
  readonly failure: 1 | 2;
  readonly clientCommandId: string;
}

/** `relocation-not-allowed` (403): Moving a branch (address or map pin) is for an owner or platform admin; nothing was saved. */
export interface RelocationNotAllowedProblemContext {
  readonly branchId: string;
}

/** `report-range-too-long` (400): The report range is longer than any report will run. */
export interface ReportRangeTooLongProblemContext {
  readonly field: string;
  readonly requestedDays: number;
  readonly maxDays: number;
}

/** `reservation-approval-expired` (409): Approving or declining a booking whose chance to be answered has gone. */
export interface ReservationApprovalExpiredProblemContext {
  readonly reservationId: string;
  /** `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow. */
  readonly status: 1 | 2 | 4 | 5 | 6 | 7 | 8;
  readonly startUtc: string;
  readonly approvalExpiresAtUtc: string | null;
}

/** `reservation-awaiting-earlier-guest` (409): Staff deciding a booking that waits on the guest before it on the table to answer. */
export interface ReservationAwaitingEarlierGuestProblemContext {
  readonly reservationId: string;
  readonly requestId: string;
  readonly expiresAtUtc: string;
}

/** `reservation-cancelled-by-block` (409): Approving or rejecting a booking its guest's no-show block cancelled. */
export interface ReservationCancelledByBlockProblemContext {
  readonly reservationId: string;
  readonly cancelledAtUtc: string | null;
}

/** `reservation-free-by-required` (422): The next booking cuts the sitting short and the booking did not accept the time to free the table by. */
export interface ReservationFreeByRequiredProblemContext {
  readonly field: string;
  readonly requiredFreeByUtc: string;
  readonly requiredFreeByLocal: string;
  readonly nextBookingStartUtc: string;
  readonly tableId: string;
  readonly tableLabel: string;
}

/** `reservation-lead-time-too-short` (422): The slot starts sooner than the branch's minimum lead time. */
export interface ReservationLeadTimeTooShortProblemContext {
  /** `ReservationRejectionReason`: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied, 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked, 16 TimeFull. */
  readonly reason: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16;
  readonly requestedStartUtc: string;
  readonly earliestStartUtc: string;
  readonly minLeadMinutes: number;
}

/** `reservation-local-time-does-not-exist` (422): The wall-clock time picked does not exist in the branch's zone (a clock change skips it). */
export interface ReservationLocalTimeDoesNotExistProblemContext {
  /** `ReservationRejectionReason`: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied, 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked, 16 TimeFull. */
  readonly reason: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16;
  readonly localDate: string;
  readonly localTime: string;
  readonly timeZoneId: string;
}

/** `reservation-lock-timeout` (503): The booking could not get the table's lock in time; retry with the same clientCommandId. */
export interface ReservationLockTimeoutProblemContext {
  readonly tableId: string;
  readonly tableLabel: string;
  readonly timeoutMilliseconds: number;
  readonly retryable: boolean;
}

/** `reservation-not-changeable` (409): A change to a booking that is no longer pending or confirmed, or has started. */
export interface ReservationNotChangeableProblemContext {
  readonly reservationId: string;
  /** `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed, 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow. */
  readonly status: 1 | 2 | 4 | 5 | 6 | 7 | 8;
  readonly startUtc: string;
}

/** `reservation-not-started` (409): A no-show recorded against a booking whose start has not come yet. */
export interface ReservationNotStartedProblemContext {
  readonly reservationId: string;
  readonly startUtc: string;
}

/** `reservation-outside-booking-window` (422): The date is further ahead than the branch takes bookings. */
export interface ReservationOutsideBookingWindowProblemContext {
  /** `ReservationRejectionReason`: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied, 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked, 16 TimeFull. */
  readonly reason: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16;
  readonly requestedDate: string;
  readonly lastBookableDate: string;
  readonly bookingWindowDays: number;
}

/** `reservation-outside-opening-hours` (422): The sitting does not fit inside one opening block of the branch's day. */
export interface ReservationOutsideOpeningHoursProblemContext {
  /** `ReservationRejectionReason`: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied, 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked, 16 TimeFull. */
  readonly reason: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16;
  readonly localDate: string;
  readonly localStartTime: string;
  readonly localEndTime: string;
}

/** `reservation-overlaps-own` (409): The sitting overlaps another of the diner's own live bookings; context names it (not on a manage link). */
export interface ReservationOverlapsOwnProblemContext {
  readonly reservationId: string;
  readonly code: string;
  readonly localDate: string;
  readonly localStartTime: string;
  readonly tableLabel: string;
  readonly venueName: string | null;
  readonly branchName: string | null;
}

/** `reservation-party-exceeds-capacity` (422): More guests than the table has seats. */
export interface ReservationPartyExceedsCapacityProblemContext {
  /** `ReservationRejectionReason`: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied, 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked, 16 TimeFull. */
  readonly reason: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly partySize: number;
  readonly seats: number;
}

/** `reservation-seat-overhang-exceeded` (422): The party would leave more seats empty than the branch allows. */
export interface ReservationSeatOverhangExceededProblemContext {
  /** `ReservationRejectionReason`: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied, 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked, 16 TimeFull. */
  readonly reason: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly partySize: number;
  readonly seats: number;
  readonly seatsLeftEmpty: number;
  readonly maxSeatOverhang: number;
}

/** `reservation-table-not-bookable` (422): The table never takes bookings: a bar stool, a counter seat. */
export interface ReservationTableNotBookableProblemContext {
  /** `ReservationRejectionReason`: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied, 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked, 16 TimeFull. */
  readonly reason: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16;
  readonly tableId: string;
  readonly tableLabel: string;
}

/** `reservation-table-out-of-service` (422): The table is withdrawn from service. */
export interface ReservationTableOutOfServiceProblemContext {
  /** `ReservationRejectionReason`: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied, 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked, 16 TimeFull. */
  readonly reason: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16;
  readonly tableId: string;
  readonly tableLabel: string;
}

/** `review-needs-visit` (403): A first review of a branch from a diner with no visit there in the window. */
export interface ReviewNeedsVisitProblemContext {
  readonly branchId: string;
  readonly windowDays: number;
}

/** `scan-turned-away` (409): A scan refused for a while after a waiter turned this phone or table away. */
export interface ScanTurnedAwayProblemContext {
  readonly retryAfterUtc: string;
}

/** `service-request-rate-limited` (429): This table has asked for staff too many times too quickly. */
export interface ServiceRequestRateLimitedProblemContext {
  readonly tabId: string;
  readonly limit: number;
  readonly windowMinutes: number;
}

/** `tab-admission-decided` (409): Admitting a tab already turned away, or turning away one already admitted. */
export interface TabAdmissionDecidedProblemContext {
  readonly tabId: string;
  /** `TabAdmission`: 1 AwaitingAdmission, 2 Admitted, 3 Rejected. */
  readonly admission: 1 | 2 | 3;
}

/** `tab-awaiting-admission` (409): The tab waits for a waiter to let it order. */
export interface TabAwaitingAdmissionProblemContext {
  readonly tabId: string;
}

/** `tab-not-accepting-orders` (409): The tab takes no more orders: the bill has been asked for, or it is closed. */
export interface TabNotAcceptingOrdersProblemContext {
  readonly tabId: string;
  /** `TabStatus`: 1 Open, 2 Closing, 3 Closed, 4 Abandoned. */
  readonly status: 1 | 2 | 3 | 4;
}

/** `tab-not-transferable` (409): A table whose bill is closed or written off, or whose party has gone, has nobody to hand over. */
export interface TabNotTransferableProblemContext {
  readonly tabId: string;
  /** `TabStatus`: 1 Open, 2 Closing, 3 Closed, 4 Abandoned. */
  readonly status: 1 | 2 | 3 | 4;
}

/** `table-already-booked` (409): The table was booked by somebody else between seeing it free and confirming. */
export interface TableAlreadyBookedProblemContext {
  /** `ReservationRejectionReason`: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied, 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked, 16 TimeFull. */
  readonly reason: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly requestedStartUtc: string;
  readonly requestedEndUtc: string;
  readonly conflictingStartUtc: string;
  readonly conflictingEndUtc: string;
  readonly conflictingReservationId: string;
  readonly availability?: components['schemas']['Yalla.Application.Reservations.BranchAvailability'];
}

/** `table-currently-occupied` (409): A party seated at the table now runs into the requested slot; it may free up early. */
export interface TableCurrentlyOccupiedProblemContext {
  /** `ReservationRejectionReason`: 1 LeadTimeTooShort, 2 OutsideBookingWindow, 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded, 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked, 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied, 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked, 16 TimeFull. */
  readonly reason: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 16;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly requestedStartUtc: string;
  readonly requestedEndUtc: string;
  readonly seatedAtUtc: string;
  readonly projectedFreeAtUtc: string;
  readonly tableSessionId: string;
  readonly availability: components['schemas']['Yalla.Application.Reservations.BranchAvailability'] | null;
}

/** `table-has-future-bookings` (409): A table with a booking still to come cannot be deleted, nor left out of a floor-plan save. */
export interface TableHasFutureBookingsProblemContext {
  readonly tables: readonly string[];
  readonly bookings: readonly string[];
}

/** `table-lock-timeout` (503): A table write waited too long for another writer; retry, nothing was decided. */
export interface TableLockTimeoutProblemContext {
  readonly tableId: string;
  readonly tableLabel: string;
  readonly timeoutMilliseconds: number;
  readonly retryable: boolean;
}

/** `table-not-seated` (409): Staff tried to open a tab on a table with nobody seated at it. */
export interface TableNotSeatedProblemContext {
  readonly tableId: string;
  readonly tableLabel: string;
  /** `TableStatus`: 1 Free, 2 Held, 4 Occupied, 5 OutOfService. */
  readonly status: 1 | 2 | 4 | 5;
}

/** `table-request-not-pending` (409): An answer to a request for the table that no longer waits. */
export interface TableRequestNotPendingProblemContext {
  readonly reservationId: string;
  readonly requestId: string;
  /** `TableShareRequestStatus`: 1 Pending, 2 Accepted, 3 Declined, 4 Expired, 5 Withdrawn. */
  readonly status: 1 | 2 | 3 | 4 | 5;
  readonly expiresAtUtc: string;
}

/** `table-sitting-changed` (409): A free that named a booking found another sitting, or none, open at the table. */
export interface TableSittingChangedProblemContext {
  readonly tableId: string;
  readonly tableLabel: string;
  readonly reservationId: string;
  /** `TableStatus`: 1 Free, 2 Held, 4 Occupied, 5 OutOfService. */
  readonly tableStatus: 1 | 2 | 4 | 5;
  readonly currentSessionId: string | null;
}

/** `table-state-conflict` (409): Somebody else changed this table first; redraw it from the current state. */
export interface TableStateConflictProblemContext {
  readonly tableId: string;
  readonly tableLabel: string;
  /** `TableStatus`: 1 Free, 2 Held, 4 Occupied, 5 OutOfService. */
  readonly attemptedFromStatus: 1 | 2 | 4 | 5;
  /** `TableStatus`: 1 Free, 2 Held, 4 Occupied, 5 OutOfService. */
  readonly currentStatus: 1 | 2 | 4 | 5;
  readonly currentSessionId: string | null;
}

/** `takeaway-busy` (409): ASAP while the kitchen has as many takeaway orders in progress as the venue allows. */
export interface TakeawayBusyProblemContext {
  readonly branchId: string;
  readonly maxInProgress: number;
}

/** `takeaway-closed` (409): Closed for takeaway now: shut, or past the last order. */
export interface TakeawayClosedProblemContext {
  readonly branchId: string;
  readonly opensAtUtc?: string;
  readonly opensAt?: string | null;
}

/** `takeaway-items-unavailable` (422): Dishes that cannot be ordered to take away, every one named with why. */
export interface TakeawayItemsUnavailableProblemContext {
  readonly items: readonly ({
      readonly menuItemId: string;
      /** `TakeawayItemRefusal`: 1 NotOnMenu, 2 SoldOut, 3 NotForTakeaway. */
      readonly reason: 1 | 2 | 3;
    })[];
}

/** `takeaway-no-show-too-early` (409): "No-show" for a takeaway order before thirty minutes past ready. */
export interface TakeawayNoShowTooEarlyProblemContext {
  readonly orderId: string;
  readonly noShowFromUtc: string;
}

/** `takeaway-not-accepted` (409): The branch does not take takeaway orders. */
export interface TakeawayNotAcceptedProblemContext {
  readonly branchId: string;
}

/** `takeaway-slot-unavailable` (409): The pickup time asked for is not one on offer; context lists the slots on offer now. */
export interface TakeawaySlotUnavailableProblemContext {
  readonly branchId: string;
  readonly at: string;
  readonly slots: readonly string[];
}

/** `takeaway-status-conflict` (409): The takeaway order is not in the state for that move; context says where it is now. */
export interface TakeawayStatusConflictProblemContext {
  readonly orderId: string;
  /** `TakeawayStatus`: 1 Sent, 2 Accepted, 3 Ready, 4 Collected, 5 Declined, 6 Cancelled, 7 NoShow. */
  readonly status: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

/** `time-full` (409): There is no room for that many guests at that time. */
export interface TimeFullProblemContext {
  readonly branchId: string;
  readonly partySize: number;
  readonly guestsLeft: number;
}

/** `too-many-attempts` (429): A one-time credential is out of attempts, or a per-identity limit is spent; ask for a new code. */
export interface TooManyAttemptsProblemContext {
  readonly retryAfterSeconds: number;
}

/** `transfer-target-ineligible` (422): The waiter named cannot take the table. */
export interface TransferTargetIneligibleProblemContext {
  readonly staffMemberId: string;
  readonly reason: string;
}

/** `unsupported-image` (409): An upload is not a JPEG, PNG or WebP, or is too large to store. */
export interface UnsupportedImageProblemContext {
  readonly detectedFormat: string;
}

/** `username-taken` (409): The username on a diner sign-up or profile edit is somebody else's. */
export interface UsernameTakenProblemContext {
  readonly field: string;
}

/** `validation-failed` (422): Field-level validation failed; every offending field is named. */
export interface ValidationFailedProblemContext {
  readonly field: string;
  readonly fields: readonly (components['schemas']['Yalla.Api.Errors.FieldViolationShape'])[];
}

/** `venue-deletion-blocked` (409): The venue has open tabs or future bookings and cannot be deleted. */
export interface VenueDeletionBlockedProblemContext {
  readonly openTabs: readonly string[];
  readonly futureReservations: readonly string[];
}

/** `verification-code-invalid` (401): A one-time code that was not accepted; context says how many tries are left. */
export interface VerificationCodeInvalidProblemContext {
  readonly attemptsRemaining: number;
}

/** `waiters-cannot-write` (403): A waiter writing to a guest where the venue keeps messages to managers. */
export interface WaitersCannotWriteProblemContext {
  readonly branchId: string;
}

/** `web-bookings-not-accepted` (409): The branch does not take bookings from its public page. */
export interface WebBookingsNotAcceptedProblemContext {
  readonly branchId: string;
}

/** Each code’s `context`; `undefined` for a code that carries none. */
export interface ProblemContexts {
  readonly 'account-inactive': undefined;
  readonly 'account-locked': AccountLockedProblemContext;
  readonly 'activity-export-too-large': ActivityExportTooLargeProblemContext;
  readonly 'ask-on-my-way-asked-recently': AskOnMyWayAskedRecentlyProblemContext;
  readonly 'ask-on-my-way-not-open': AskOnMyWayNotOpenProblemContext;
  readonly 'ask-on-my-way-too-early': AskOnMyWayTooEarlyProblemContext;
  readonly 'booking-blocked-no-shows': BookingBlockedNoShowsProblemContext;
  readonly 'booking-ended': BookingEndedProblemContext;
  readonly 'booking-not-active': BookingNotActiveProblemContext;
  readonly 'booking-not-found': undefined;
  readonly 'booking-table-occupied': BookingTableOccupiedProblemContext;
  readonly 'booking-too-early': BookingTooEarlyProblemContext;
  readonly 'bookings-not-accepted': BookingsNotAcceptedProblemContext;
  readonly 'branch-not-ready': BranchNotReadyProblemContext;
  readonly 'branch-unavailable': BranchUnavailableProblemContext;
  readonly 'client-command-id-in-use': undefined;
  readonly 'concurrent-update': ConcurrentUpdateProblemContext;
  readonly 'conflicting-state': ConflictingStateProblemContext;
  readonly 'conversation-closed': ConversationClosedProblemContext;
  readonly 'credentials-invalid': undefined;
  readonly 'device-revoked': undefined;
  readonly 'email-taken': EmailTakenProblemContext;
  readonly 'enrolment-code-expired': undefined;
  readonly 'enrolment-code-invalid': undefined;
  readonly 'extensions-not-offered': ExtensionsNotOfferedProblemContext;
  readonly 'feature-not-enabled': FeatureNotEnabledProblemContext;
  readonly 'floor-plan-changed': FloorPlanChangedProblemContext;
  readonly 'floor-plan-invalid': FloorPlanInvalidProblemContext;
  readonly 'forbidden': ForbiddenProblemContext;
  readonly 'guest-already-answered': GuestAlreadyAnsweredProblemContext;
  readonly 'guests-cannot-write': GuestsCannotWriteProblemContext;
  readonly 'hold-already-extended': HoldAlreadyExtendedProblemContext;
  readonly 'hold-not-active': HoldNotActiveProblemContext;
  readonly 'internal-error': undefined;
  readonly 'invalid-credentials': undefined;
  readonly 'invalid-request': InvalidRequestProblemContext;
  readonly 'invalid-table-transition': InvalidTableTransitionProblemContext;
  readonly 'join-token-invalid': undefined;
  readonly 'kitchen-phone-not-allowed': KitchenPhoneNotAllowedProblemContext;
  readonly 'line-already-paid': LineAlreadyPaidProblemContext;
  readonly 'menu-item-unavailable': MenuItemUnavailableProblemContext;
  readonly 'messages-too-fast': MessagesTooFastProblemContext;
  readonly 'no-show-undo-window-closed': NoShowUndoWindowClosedProblemContext;
  readonly 'not-found': NotFoundProblemContext;
  readonly 'on-my-way-not-open': OnMyWayNotOpenProblemContext;
  readonly 'pairing-code-expired': undefined;
  readonly 'pairing-code-invalid': undefined;
  readonly 'payment-exceeds-remaining': PaymentExceedsRemainingProblemContext;
  readonly 'phone-has-active-booking': PhoneHasActiveBookingProblemContext;
  readonly 'phone-in-use': PhoneInUseProblemContext;
  readonly 'phone-not-verified': undefined;
  readonly 'pin-invalid': undefined;
  readonly 'pin-taken': PinTakenProblemContext;
  readonly 'pre-order-already-sent': PreOrderAlreadySentProblemContext;
  readonly 'pre-order-items-unavailable': PreOrderItemsUnavailableProblemContext;
  readonly 'pre-order-locked': PreOrderLockedProblemContext;
  readonly 'pre-order-not-sendable': PreOrderNotSendableProblemContext;
  readonly 'pre-orders-not-accepted': PreOrdersNotAcceptedProblemContext;
  readonly 'precondition-failed': PreconditionFailedProblemContext;
  readonly 'rate-limited': undefined;
  readonly 'refresh-token-invalid': undefined;
  readonly 'refresh-token-reused': undefined;
  readonly 'relocation-not-allowed': RelocationNotAllowedProblemContext;
  readonly 'report-range-too-long': ReportRangeTooLongProblemContext;
  readonly 'reservation-approval-expired': ReservationApprovalExpiredProblemContext;
  readonly 'reservation-awaiting-earlier-guest': ReservationAwaitingEarlierGuestProblemContext;
  readonly 'reservation-cancelled-by-block': ReservationCancelledByBlockProblemContext;
  readonly 'reservation-free-by-required': ReservationFreeByRequiredProblemContext;
  readonly 'reservation-lead-time-too-short': ReservationLeadTimeTooShortProblemContext;
  readonly 'reservation-local-time-does-not-exist': ReservationLocalTimeDoesNotExistProblemContext;
  readonly 'reservation-lock-timeout': ReservationLockTimeoutProblemContext;
  readonly 'reservation-not-changeable': ReservationNotChangeableProblemContext;
  readonly 'reservation-not-started': ReservationNotStartedProblemContext;
  readonly 'reservation-outside-booking-window': ReservationOutsideBookingWindowProblemContext;
  readonly 'reservation-outside-opening-hours': ReservationOutsideOpeningHoursProblemContext;
  readonly 'reservation-overlaps-own': ReservationOverlapsOwnProblemContext;
  readonly 'reservation-party-exceeds-capacity': ReservationPartyExceedsCapacityProblemContext;
  readonly 'reservation-seat-overhang-exceeded': ReservationSeatOverhangExceededProblemContext;
  readonly 'reservation-table-not-bookable': ReservationTableNotBookableProblemContext;
  readonly 'reservation-table-out-of-service': ReservationTableOutOfServiceProblemContext;
  readonly 'reset-token-invalid': undefined;
  readonly 'review-needs-visit': ReviewNeedsVisitProblemContext;
  readonly 'scan-turned-away': ScanTurnedAwayProblemContext;
  readonly 'service-request-rate-limited': ServiceRequestRateLimitedProblemContext;
  readonly 'session-expired': undefined;
  readonly 'session-invalid': undefined;
  readonly 'session-revoked': undefined;
  readonly 'sign-in-unknown': undefined;
  readonly 'sms-unavailable': undefined;
  readonly 'tab-admission-decided': TabAdmissionDecidedProblemContext;
  readonly 'tab-awaiting-admission': TabAwaitingAdmissionProblemContext;
  readonly 'tab-not-accepting-orders': TabNotAcceptingOrdersProblemContext;
  readonly 'tab-not-transferable': TabNotTransferableProblemContext;
  readonly 'table-already-booked': TableAlreadyBookedProblemContext;
  readonly 'table-currently-occupied': TableCurrentlyOccupiedProblemContext;
  readonly 'table-has-future-bookings': TableHasFutureBookingsProblemContext;
  readonly 'table-lock-timeout': TableLockTimeoutProblemContext;
  readonly 'table-not-seated': TableNotSeatedProblemContext;
  readonly 'table-request-not-pending': TableRequestNotPendingProblemContext;
  readonly 'table-sitting-changed': TableSittingChangedProblemContext;
  readonly 'table-state-conflict': TableStateConflictProblemContext;
  readonly 'takeaway-busy': TakeawayBusyProblemContext;
  readonly 'takeaway-closed': TakeawayClosedProblemContext;
  readonly 'takeaway-items-unavailable': TakeawayItemsUnavailableProblemContext;
  readonly 'takeaway-no-show-too-early': TakeawayNoShowTooEarlyProblemContext;
  readonly 'takeaway-not-accepted': TakeawayNotAcceptedProblemContext;
  readonly 'takeaway-slot-unavailable': TakeawaySlotUnavailableProblemContext;
  readonly 'takeaway-status-conflict': TakeawayStatusConflictProblemContext;
  readonly 'telegram-verification-expired': undefined;
  readonly 'time-full': TimeFullProblemContext;
  readonly 'too-many-attempts': TooManyAttemptsProblemContext;
  readonly 'transfer-target-ineligible': TransferTargetIneligibleProblemContext;
  readonly 'unauthenticated': undefined;
  readonly 'unsupported-image': UnsupportedImageProblemContext;
  readonly 'username-taken': UsernameTakenProblemContext;
  readonly 'validation-failed': ValidationFailedProblemContext;
  readonly 'venue-deletion-blocked': VenueDeletionBlockedProblemContext;
  readonly 'verification-code-expired': undefined;
  readonly 'verification-code-invalid': VerificationCodeInvalidProblemContext;
  readonly 'waiters-cannot-write': WaitersCannotWriteProblemContext;
  readonly 'web-bookings-not-accepted': WebBookingsNotAcceptedProblemContext;
}

const ALL_CODES: ReadonlySet<string> = new Set(Object.values(ProblemCodes));

/** Whether a slug is one the backend declares. */
export function isProblemCode(code: unknown): code is ProblemCode {
  return typeof code === 'string' && ALL_CODES.has(code);
}
