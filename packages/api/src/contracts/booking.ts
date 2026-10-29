import type { ConversationSummary } from './messages';
import type { FloorPlanData } from './tableFloor';
import type { ApprovalTrigger, DeclineReason } from './approvals';
import type { OpenState } from './publicBranch';
import type { CancellationCause, GuestRecord } from './guestRecord';
import type { BookingPreOrderFields } from './preOrder';
import type { ReservationStatusCode } from './push';

/**
 * Domain contracts for the reservation flow.
 *
 * These are the shapes components are typed against. The mock gateway and the
 * real HTTP gateway both implement them, so swapping data sources is a change
 * of one module — never a change to a screen.
 */
export type VenueType = 'cafe' | 'restaurant' | 'bar';

/**
 * Every kind of place, in the order a filter offers them.
 *
 * `Yalla.Domain.Enums.VenueType`: 1 Cafe, 2 Restaurant, 3 Bar. One list, so a
 * select or a chip row that iterates it cannot forget the newest kind.
 */
export const VENUE_TYPES: readonly VenueType[] = ['cafe', 'restaurant', 'bar'];

/**
 * Booking policy for a branch. These four numbers drive most of the copy in the
 * reservation flow, so they come from the branch rather than being hardcoded:
 * a bakery turning tables in 45 minutes and a restaurant holding them for three
 * hours cannot share a constant.
 */
export interface BranchPolicy {
  /** Typical sitting duration. A window shorter than this is worth warning about. */
  readonly turnMinutes: number;
  /** A slot closer than this to now can no longer be booked. */
  readonly leadTimeMinutes: number;
  /** Parties larger than this need staff approval instead of instant confirmation. */
  readonly instantConfirmationMaxPartySize: number;
  /** Free cancellation up to this many minutes before the slot. */
  readonly freeCancellationMinutes: number;
}

/**
 * One branch as the browse list publishes it — `PublicBranchCard`, and nothing
 * the card does not carry.
 *
 * This used to promise a distance, today's opening and closing instants, a
 * table total and a booking policy. None of the four is on the one venue read
 * the backend publishes, and a screen that called `branch.distanceKm.toFixed(1)`
 * on a real card would have crashed. What a diner genuinely gets is below.
 */
export interface BranchSummary {
  /** The branch id — a guid on the wire, and what every branch route takes. */
  readonly id: string;
  readonly slug: string;
  /** The venue's slug, which is the venue's id on this surface. */
  readonly venueId: string;
  readonly venueName: string;
  readonly name: string;
  readonly addressLine: string;
  /** IANA zone. Every time rendered for this branch uses it, never the device's. */
  readonly timeZoneId: string;
  /**
   * Open or shut, as the server judged it against the branch's own clock.
   *
   * The public card sends only the boolean, so both instants are `null` against
   * the real backend; the mock, which derives them from a fixture week, fills
   * them. A screen shows "open until" only when it has a time to show.
   */
  readonly openState: OpenState;
  /**
   * Tables nobody is sitting at **right now**, among the bookable ones.
   *
   * Not "free tonight", and meaningless at a branch that is shut — every table
   * is free at 03:00. Read it through `branchAvailability`, which says so.
   */
  readonly freeTables: number;
}

/**
 * A venue as the browse list publishes it.
 *
 * `id` is the venue's slug: the public card carries no venue id, the slug is
 * unique, and nothing links a booking or a tab back to this route, so the slug
 * is the honest key. The web page already keys its chooser the same way.
 */
export interface VenueSummary {
  readonly id: string;
  readonly name: string;
  readonly type: VenueType;
  readonly branches: readonly BranchSummary[];
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * How long a table is actually free for, resolved by the backend.
 *
 * The product does not ask people how long they intend to stay — self-reported
 * answers are unreliable and carry no consequence. Instead the limit is *told*
 * before confirming, so a diner who needs longer can pick a different table.
 */
export interface AvailabilityWindowDto {
  /** Start of the window (the requested slot), ISO-8601 UTC. */
  readonly fromUtc: string;
  /** End of the window, or `null` when nothing is booked after this. */
  readonly untilUtc: string | null;
  /** Start of the next booking, or `null`. Usually equals `untilUtc`. */
  readonly nextBookingStartUtc: string | null;
  /** Minutes between `fromUtc` and `untilUtc`; `null` when unbounded. */
  readonly minutes: number | null;
  /**
   * True when the window is shorter than the branch's turn time. Computed by
   * the backend so the client and the venue cannot disagree about it.
   */
  readonly isShorterThanTurnTime: boolean;
}

/**
 * Why a table cannot be reserved, as the *server* said it.
 *
 * One member per distinct thing the backend refuses for
 * (`Yalla.Domain.Occupancy.ReservationRejectionReason`), because each has a
 * different next step. Collapsing them is how a diner gets told a ten-seater
 * is "too small for 2", or that a closed venue is "too soon to book" — and
 * then tries again in five minutes.
 */
export type KnownTableUnavailableReason =
  /** Somebody is physically sitting there **now**. Only ever true of a slot now. */
  | 'occupied'
  | 'held'
  | 'outOfService'
  /**
   * The slot collides with another booking.
   *
   * Distinct from `occupied`, and the distinction is the whole point: a table
   * that is free this second and booked at 20:00 is not a table with people at
   * it, and telling a diner asking about 20:00 that "someone is sitting there"
   * sends them to look at an empty table. The backend reports both as
   * `TableAlreadyBooked` and separates them by the state it derived *for the
   * requested instant*; this is that separation, made once, in the mapper.
   */
  | 'alreadyBooked'
  /** The party is bigger than the table. */
  | 'tooSmall'
  /** The party is far smaller than the table: the venue will not seat 2 at a 10-top. */
  | 'tooLarge'
  | 'notBookable'
  /** The slot is sooner than the branch's lead time. */
  | 'pastLeadTime'
  /** Further ahead than the branch takes bookings. */
  | 'tooFarAhead'
  /** The branch is shut at that time. */
  | 'closed'
  /** That wall-clock time does not exist on that date — the clocks change. */
  | 'invalidTime';

/**
 * Deliberately open at the edges.
 *
 * The backend can add a refusal rule in a release this client has not been
 * rebuilt for, and the honest thing to do with a reason we have no word for is
 * to **carry it and show it**, not to look at the table's state and guess a
 * reason we do happen to have a word for. Guessing is how a diner asking about
 * Saturday is told somebody is sitting at the table right now.
 *
 * `KNOWN_UNAVAILABLE_REASONS` is what has copy; anything else renders through
 * the `other` key with the server's own word interpolated.
 */
export type TableUnavailableReason = KnownTableUnavailableReason | (string & {});

export const KNOWN_UNAVAILABLE_REASONS: readonly KnownTableUnavailableReason[] = [
  'occupied',
  'held',
  'outOfService',
  'alreadyBooked',
  'tooSmall',
  'tooLarge',
  'notBookable',
  'pastLeadTime',
  'tooFarAhead',
  'closed',
  'invalidTime',
];

export function isKnownUnavailableReason(
  reason: TableUnavailableReason,
): reason is KnownTableUnavailableReason {
  return (KNOWN_UNAVAILABLE_REASONS as readonly string[]).includes(reason);
}

export interface TableAvailability {
  readonly tableId: string;
  readonly tableLabel: string;
  readonly floorAreaName: string | null;
  readonly seats: number;
  readonly isBookable: boolean;
  readonly unavailableReason: TableUnavailableReason | null;
  /** Present whenever the table is bookable. */
  readonly window: AvailabilityWindowDto | null;
  /**
   * Free cancellation deadline for a booking at this slot, ISO-8601 UTC — the
   * server's `cancellationDeadlineUtc`, computed by the same rule that marks a
   * cancellation late. `null` when the server could not compute one, and then
   * nothing is promised: this used to be the slot start, which told a diner
   * cancelling at 19:00 for a 19:30 table they were free to, and the server
   * recorded it as late.
   */
  readonly freeCancellationUntilUtc: string | null;
  /** True when this party size exceeds the instant-confirmation limit. */
  readonly requiresApproval: boolean;
  /**
   * Somebody booked this table shortly before the slot: it is offered as a
   * **request** — the guest before agrees to leave in time, or the floor
   * decides — and always comes with `requiresApproval`. Absent from an answer
   * older than booking times: false.
   */
  readonly isRequestable?: boolean | undefined;
  /**
   * Requestable on another day, where the guest before is the one asked ("the
   * guest before you will be asked"); tonight, at short notice, the floor
   * answers and this is false. Derived from `isRequestable` and the slot.
   */
  readonly requiresEarlierGuestConsent?: boolean | undefined;
  /**
   * A booking follows this one on the table: a diner who takes it promises to
   * free it by this instant — the next booking's start less the clearing time
   * — and says so before sending (`acceptsFreeByUtc`). `null` or absent when
   * the sitting is not cut short.
   */
  readonly mustFreeByUtc?: string | null | undefined;
}

/**
 * The room **and** its answer, for one slot, from one request.
 *
 * This type exists because the two were separate and the room came from the
 * wrong question. Both diner surfaces drew the plan from a floor-state call
 * meaning *now* and then overlaid availability meaning *the slot the diner
 * asked about*, so a table occupied by tonight's walk-ins rendered unavailable
 * for a booking three days away, and a table free this second rendered free at
 * 20:00 when it was already booked. Changing the time control moved the
 * overlay and left the room where it was.
 *
 * They are one shape now because they are one answer to one question, and
 * because `GET /api/branches/{id}/availability` has returned both since
 * Backend Prompt 7 — the geometry, the state derived *for the requested
 * instant*, the per-table refusal and the window — in a single anonymous round
 * trip. The client's job is to pass the slot and render what comes back.
 */
export interface SlotFloor {
  /** The room, with every table's state derived for {@link slotUtc}. */
  readonly plan: FloorPlanData;
  /** Per-table answer, in the same order as `plan.tables`. */
  readonly tables: readonly TableAvailability[];
  /**
   * A rule that refused the **whole request** before any table was considered:
   * the slot is in the past, beyond the booking window, or the branch is shut.
   *
   * Reported once rather than repeated on forty tables, so a surface can say
   * "we are closed at 03:00" instead of listing forty tables that are each
   * individually unavailable for the same reason. Null when the request was
   * fine — which is not the same as every table being free.
   */
  readonly rejection: TableUnavailableReason | null;
  /** The slot this answer is about, echoed back so a stale render is detectable. */
  readonly slotUtc: string;
  readonly partySize: number;
}

/**
 * One time of day on {@link DaySlots}: whether a party of that size can still
 * get a table then.
 *
 * Decided by the server with the same per-table checks as {@link SlotFloor} —
 * the backend shares them between the two reads precisely so a time the day
 * view offers is never refused by the room it opens.
 */
export interface DaySlot {
  /** `HH:mm`, the branch's wall clock. */
  readonly time: string;
  /** The same moment as an instant — what {@link SlotFloor} and a booking take. */
  readonly slotUtc: string;
  /** At least one table the party fits is free then. */
  readonly isAvailable: boolean;
  /** A booking then would wait for the venue rather than confirm at once. */
  readonly requiresApproval: boolean;
  /** How many tables would take the party then, outright — requestable ones not counted. */
  readonly freeTableCount: number;
  /**
   * Why not, when not: a request-level rule (too soon, too far ahead) or, when
   * the tables were considered, the reason most of them gave — `alreadyBooked`
   * whenever a booking is what took them. `null` when available.
   */
  readonly unavailableReason: TableUnavailableReason | null;
  /**
   * The only tables to be had then are requestable: somebody booked them
   * shortly before, and the guest before you (another day) or the floor (today)
   * decides. Offered, and labelled so. Absent from an older answer: false.
   */
  readonly requestable?: boolean | undefined;
  /** How many tables then can be had once the guest before agrees. `freeTableCount` is the rest. */
  readonly requestableTableCount?: number | undefined;
  /**
   * Every table to be had then has to be freed by a time — a booking follows —
   * and this is the latest of them. `null` or absent when one is not cut short.
   */
  readonly mustFreeByUtc?: string | null | undefined;
}

/**
 * Every bookable time on one day for one party size —
 * `GET /api/branches/{id}/availability/slots`.
 *
 * The booking screen strikes the times nobody can have, instead of letting a
 * diner pick 20:00 and then find every table taken.
 */
export interface DaySlots {
  readonly branchId: string;
  /** `YYYY-MM-DD`, the branch's calendar. */
  readonly date: string;
  readonly partySize: number;
  /** The spacing between slots, from the server: `SLOT_STEP_MINUTES`, 15. */
  readonly stepMinutes: number;
  /**
   * The whole day refused — shut, or outside the booking window. Every slot is
   * unavailable then, and `slots` may be empty; read this first.
   */
  readonly unavailableReason: TableUnavailableReason | null;
  /**
   * The times whose whole sitting fits one opening block, earliest first.
   * Times the branch is shut are left out, not listed as unavailable.
   */
  readonly slots: readonly DaySlot[];
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

/**
 * The server's `ReservationStatus`, every member kept apart.
 *
 * `pendingApproval` is not a lesser `confirmed`: a large party has a request in
 * with the venue and no table yet. `seated` is not past. And the two
 * cancellations are separate, because whether the diner or the venue cancelled
 * is the one thing somebody reading the list wants to know.
 */
export type BookingStatus = ReservationStatusCode;

/**
 * A booking, as `ReservationView` describes one — and nothing it does not.
 *
 * This used to carry a venue id, a floor area, the availability window and a
 * created-at that no reservation read has, which is why the bookings screens
 * stayed on the mock. Now every field is one the server sends, except
 * `venueName`, which the view lacks and the gateway fills from the browse list
 * when it has read it.
 *
 * The pre-order fields (`preOrder`, `preOrderEditableUntilUtc`,
 * `guestConfirmedOnWayAtUtc`) come from {@link BookingPreOrderFields}; see
 * `canEditPreOrder` for when to offer the editor.
 */
export interface Booking extends BookingPreOrderFields {
  readonly id: string;
  /** Short human code. Staff ask for it and it gets read aloud over the phone. */
  readonly code: string;
  readonly status: BookingStatus;

  /** `null` when this device has not read the venue list; the branch name is always there. */
  readonly venueName: string | null;
  readonly branchId: string;
  readonly branchName: string;
  /** IANA zone of the branch. Every time on this booking renders in it. */
  readonly timeZoneId: string;

  /** None for a booking made by time only that nobody has seated: the venue chooses the table on arrival. */
  readonly tableId: string | null;
  readonly tableLabel: string | null;
  /**
   * Made at a branch that books by time only: the diner chose a time and how
   * many, not a table. It is moved by cancelling and booking again, and takes
   * no pre-order.
   */
  readonly bookedWithoutTable: boolean;
  /**
   * The room the table is in — "Hall", "Terrace" — from the table's floor area.
   * `null` when the table is in none, or the server did not say.
   */
  readonly roomId: string | null;
  readonly roomName: string | null;

  readonly partySize: number;
  /** When the table is theirs from — the server's `startUtc`. */
  readonly slotUtc: string;
  /** When the sitting is booked to end. */
  readonly endUtc: string;
  /** The server's `cancellationDeadlineUtc`: after this, a cancellation counts as late. */
  readonly freeCancellationUntilUtc: string;

  readonly cancelledAtUtc: string | null;
  readonly cancelledAfterDeadline: boolean;

  /** What the diner asked the venue, as the venue sees it (K9). `null` when they wrote nothing. */
  readonly note: string | null;

  /**
   * Why the booking is waiting for the venue, while it is. `shortNotice` is a
   * booking for today, or within a few hours, that the floor answers in
   * minutes; the others wait without a clock.
   */
  readonly awaitingApprovalBecause: ApprovalTrigger | null;
  /**
   * When the answer window closes, for a short-notice request, or one asking
   * the guest before for their table, that is still waiting — the diner's
   * "answer within 12:40". Past it the server declines the booking itself and
   * apologises. `null` otherwise.
   */
  readonly approvalExpiresAtUtc: string | null;
  /**
   * It waits on the guest before's own answer in the app, rather than on the
   * venue ringing them. Absent from a server that does not say; false once it
   * stops waiting.
   */
  readonly awaitsEarlierGuestAnswer?: boolean | undefined;
  /**
   * Why the venue declined it: a person said no, or nobody answered in time.
   * `null` for every booking the venue did not decline — including one the
   * venue cancelled after confirming it, which is a different sentence.
   */
  readonly declinedBecause: DeclineReason | null;
  /**
   * Made without a proved phone number — possible only during the few hours
   * of 2026-10-20 when such bookings were taken (legacy rows; every new
   * booking needs a proved number). The venue may confirm it first
   * (`unverifiedPhone`), and it cannot be moved or used for "I'm at my table".
   * Absent reads as verified.
   */
  readonly phoneUnverified?: boolean | undefined;
  /**
   * Why it was cancelled, when the status alone does not say:
   * `noShowBlock` — cancelled automatically because the guest was blocked for
   * three no-shows in three days (status `cancelledByVenue`). Absent or `null`
   * for every other booking.
   */
  readonly cancelledBecause?: CancellationCause | null | undefined;

  /**
   * An opaque token granting sight of, and the power to cancel, **this booking
   * alone** — with no account and no session.
   *
   * Issued for a booking made from the public web page, which has no push
   * channel: the reminder, the "still coming?" nudge and one-tap cancel all
   * reach the app and none of them reach a stranger who booked from a link.
   * Without this the only way out of such a booking is not turning up, which
   * makes the page a no-show generator for the venue that printed it on a card.
   *
   * `null` for a booking made in the app, which has an account and needs no
   * bearer link — and null against a backend that does not issue them yet, in
   * which case the confirmation offers the venue's phone number instead rather
   * than a link that goes nowhere.
   */
  readonly manageToken: string | null;

  /**
   * The time the diner promised to free the table by, when a booking follows
   * theirs: chosen with "I'll free the table by 21:25" before sending, or by
   * answering yes to a later guest's request. Absent or `null` when nothing
   * was promised.
   */
  readonly promisedFreeByUtc?: string | null | undefined;
  /**
   * Somebody would like this table after the diner, on another day, and asks
   * whether the diner will have left by then. Absent or `null` when nobody is
   * asking — and once the diner has answered.
   */
  readonly incomingTableRequest?: IncomingTableRequest | null | undefined;
  /**
   * The thread with the venue (guest messages, 2026-10-23): unread count, the
   * last message and whether it is open — the Bookings card's row and the
   * booking screen's "Messages with the venue" card. Absent or `null` when
   * there is no thread and none can be opened, and from a server before
   * messages.
   */
  readonly messages?: ConversationSummary | null | undefined;
}

/**
 * "Someone would like your table at 19:45. Will you have left by 19:40?" —
 * a later guest's request, as the earlier guest's booking carries it. The later
 * guest stays anonymous: no name, no number, no party size.
 */
export interface IncomingTableRequest {
  readonly requestId: string;
  /** When the later booking would start. */
  readonly requestedStartUtc: string;
  /** What the earlier guest is asked to be gone by: the later start less clearing time. */
  readonly freeByUtc: string;
  /** Past this, the request lapses and the later guest is told no. */
  readonly expiresAtUtc: string;
}

/**
 * The earlier guest's answer — `POST /api/reservations/{id}/table-requests/{requestId}/answer`.
 *
 * Their own booking only. Yes confirms the later booking and cuts this one to
 * `freeByUtc`, recorded as a promise; no declines the later one.
 */
export interface AnswerTableRequestCommand {
  readonly bookingId: string;
  readonly requestId: string;
  readonly accept: boolean;
  /** Client-generated and reused on retry, so a double tap answers once. */
  readonly commandId: string;
}

/**
 * Upcoming and past, **as the server split them**.
 *
 * The server's rule is "the sitting has not ended and the status still holds a
 * table". A client re-splitting on `slotUtc < now` put a diner five minutes late
 * — the very moment the nudge offers to keep the table — and a seated party
 * into Past.
 */
export interface MyBookings {
  readonly upcoming: readonly Booking[];
  readonly past: readonly Booking[];
  /**
   * The diner's own record over the last twelve months at every venue — what
   * venues see beside their bookings — and `blockedUntilUtc` while blocked for
   * no-shows. The server always sends it; absent from an older one.
   */
  readonly guestRecord?: GuestRecord | null | undefined;
}

/**
 * How far ahead and how soon a branch takes bookings, from its public page.
 *
 * `BranchAvailability` carries neither, so the date and time pickers read them
 * here and offer only what the branch will take, instead of offering a day the
 * server then refuses.
 */
export interface BookingRules {
  readonly bookingWindowDays: number;
  readonly minLeadMinutes: number;
  /** The K9 gate, from the same page: false means the app cannot book here. */
  readonly acceptsAppBookings: boolean;
}

/** The longest booking note the server keeps, after trimming (K9). */
export const MAX_BOOKING_NOTE = 500;

/** Where a booking was made. The server pushes reminders only to the app. */
export type BookingChannel = 'app' | 'web';

export interface CreateBookingCommand {
  /**
   * Client-generated, stable across retries. This is what makes a flaky
   * connection unable to create two bookings: the backend treats a repeat of
   * the same id as the same command, not a new one.
   */
  readonly commandId: string;
  readonly branchId: string;
  /**
   * The table picked on the room photos; `null` at a branch that books by time
   * only (`BranchPolicy.bookingMode` `'timeOnly'`), where the venue chooses it.
   */
  readonly tableId: string | null;
  readonly slotUtc: string;
  /**
   * The branch's zone. The server takes the booking in **wall-clock** date and
   * time, so the instant is converted in this zone — never the device's.
   */
  readonly timeZoneId: string;
  readonly partySize: number;
  /** Who the venue asks for at the door. Required by the server. */
  readonly guestName: string;
  /** The verified number, so the venue can reach them. Required by the server. */
  readonly guestPhone: string;
  readonly channel: BookingChannel;
  /**
   * A note that reaches the venue with the booking (K9). Trimmed; blank is no
   * note; at most {@link MAX_BOOKING_NOTE} characters, or a 422 naming `note`.
   */
  readonly note?: string | null | undefined;
  /**
   * "I'll free the table by 21:25": the table's `mustFreeByUtc`, agreed to
   * before sending. Required when the table has one, and equal to it — the
   * server refuses a missing or different one with a 422 naming
   * `acceptsFreeByUtc` and the time it needs (`FreeByRequiredError`).
   */
  readonly acceptsFreeByUtc?: string | null | undefined;
}

/**
 * Move a booking to another time, size or table, keeping the booking itself —
 * `POST /api/reservations/{id}/reschedule`.
 *
 * The same code, the same manage link, the same id: the venue sees one booking
 * that moved, not a cancellation and a stranger. Only the diner's own booking,
 * and only while it is waiting for the venue or confirmed and has not started.
 *
 * Every rule a new booking meets applies again — the hours, the lead time, the
 * window, the table fitting the party — except that the booking does not
 * collide with itself, so keeping the same table at a nearby time works. The
 * status is decided afresh: a bigger party may go back to waiting for the venue.
 */
export interface RescheduleBookingCommand {
  readonly bookingId: string;
  /** Client-generated, stable across retries; a replay answers the booking as it stands. */
  readonly commandId: string;
  readonly tableId: string;
  readonly slotUtc: string;
  /** The branch's zone: the server takes wall-clock date and time, as for a new booking. */
  readonly timeZoneId: string;
  readonly partySize: number;
  /** As on a new booking: the new table's must-free-by time, agreed to. */
  readonly acceptsFreeByUtc?: string | null | undefined;
}

// ---------------------------------------------------------------------------
// Phone verification
// ---------------------------------------------------------------------------

/**
 * Which ways of proving a phone number this backend has on,
 * `GET /api/auth/diner/phone-proof`. A deployment fact, the same for every
 * caller: read it before offering a choice, so a diner is never handed a
 * button that cannot work.
 */
export interface PhoneProofChannels {
  /**
   * A one-time code by SMS can be sent. False when no SMS provider is
   * configured (outside Development); `requestPhoneCode` then rejects with
   * `SmsUnavailableError`, and Telegram is the only way.
   */
  readonly sms: boolean;
  /** The Telegram bot is on. False: `startTelegramVerification` rejects with `TelegramUnavailableError`. */
  readonly telegram: boolean;
}

export interface PhoneChallenge {
  readonly challengeId: string;
  readonly phoneE164: string;
  readonly expiresAtUtc: string;
  readonly resendAvailableAtUtc: string;
  /** How many tries this code allows, from the server. */
  readonly maxAttempts: number;
  /**
   * Development only. The real backend returns this only outside production so
   * the flow is testable without an SMS provider. The UI must additionally gate
   * rendering on `__DEV__`, so a production bundle cannot show it even if a
   * misconfigured server sent one.
   */
  readonly devCode?: string | undefined;
}

export interface VerifiedPhone {
  readonly verificationToken: string;
  readonly phoneE164: string;
}

/**
 * Verification through the Telegram bot, started.
 *
 * The client never learns the number until the bot has: it opens
 * `deepLinkUrl`, the diner shares their contact with the bot, and the client
 * polls {@link TelegramClaimResult} every `pollAfterMs` until the state is
 * terminal or `expiresAtUtc` has passed.
 */
export interface TelegramChallenge {
  readonly challengeId: string;
  /** `https://t.me/<bot>?start=<nonce>` — opens the bot in Telegram. */
  readonly deepLinkUrl: string;
  readonly expiresAtUtc: string;
  /** How often to poll the claim, from the server. */
  readonly pollAfterMs: number;
}

/**
 * One poll of a Telegram challenge. `verified` carries the same proof a
 * passed code does, so every screen downstream takes either without knowing
 * which door was used.
 */
export type TelegramClaimResult =
  { readonly state: 'pending' } | { readonly state: 'verified'; readonly verified: VerifiedPhone };
