import type { FloorPlanData } from './contracts/tableFloor';
import type {
  AnswerTableRequestCommand,
  Booking,
  BookingRules,
  CreateBookingCommand,
  DaySlots,
  MyBookings,
  PhoneChallenge,
  PhoneProofChannels,
  RescheduleBookingCommand,
  SlotFloor,
  TableAvailability,
  TelegramChallenge,
  TelegramClaimResult,
  VenueSummary,
  VerifiedPhone,
} from './contracts/booking';

import type {
  DinerPhotoFile,
  DinerProfileView,
  DinerSignInResult,
  LoginDinerCommand,
  RegisterDinerCommand,
  SetDinerPasswordCommand,
  UpdateDinerProfileCommand,
} from './contracts/dinerAccount';
import type { DeleteDinerAccountCommand } from './contracts/dinerAccount';
import type { FavoriteBranch } from './contracts/favorites';
import type {
  DinerNotificationPage,
  MarkNotificationsReadCommand,
  NotificationPageQuery,
} from './contracts/notifications';
import type { ReportReviewCommand } from './contracts/reviews';
import type {
  ClearPreOrderCommand,
  OnMyWayResult,
  PreOrderResult,
  ReplacePreOrderCommand,
} from './contracts/preOrder';
import type { ReportRunningLateCommand, RunningLateResult } from './contracts/onMyWay';
import type {
  PlaceTakeawayOrderCommand,
  TakeawayAvailability,
  TakeawayOrder,
} from './contracts/takeaway';
import type { Photo } from './contracts/menuAdmin';
import type {
  ConversationSubjectRef,
  MarkConversationReadCommand,
  DinerConversation,
  DinerUnreadMessages,
  SendMessageCommand,
  SentMessage,
} from './contracts/messages';
import type {
  BranchDetail,
  BranchListing,
  BranchReviewPage,
  BranchSearchQuery,
  BranchRooms,
  DinerOrder,
  DinerOrderSegment,
  MyBranchReview,
  SubmitBranchReviewCommand,
} from './contracts/places';
import type {
  CancelReservationCommand,
  ExtendHoldCommand,
  ExtendHoldOutcome,
  RegisterPushDeviceCommand,
  ReservationState,
} from './contracts/push';
import type {
  BillRequestInput,
  BranchMenu,
  DinerTabView,
  PlaceOrderCommand,
  PlaceOrderResult,
  SetSettlementModeCommand,
  TabEventPage,
  TabShares,
} from './contracts/ordering';
import type {
  JoinTabCommand,
  OpenTabByBookingCommand,
  ScanResult,
  ScanTableCommand,
  TabInvite,
  TabParticipantChange,
  TabPermissions,
  WaiterCall,
  WaiterCallReason,
} from './contracts/tab';

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
  /**
   * Every published venue, from `GET /api/public/venues`.
   *
   * Keyed by slug; see {@link VenueSummary}. A suspended venue or an inactive
   * branch is simply absent, exactly as it is from the public list.
   */
  listVenues(): Promise<readonly VenueSummary[]>;
  /** One venue by the id the list gave it, or `null` when it is no longer listed. */
  getVenue(venueId: string): Promise<VenueSummary | null>;

  /**
   * How far ahead and how soon a branch takes bookings.
   *
   * @returns `null` when no published branch has those slugs.
   */
  getBookingRules(input: { venueSlug: string; branchSlug: string }): Promise<BookingRules | null>;

  /** Current floor state for a branch. */
  getFloorPlan(branchId: string): Promise<FloorPlanData | null>;

  /**
   * The branch's IANA zone.
   *
   * For a branch reached with neither its browse card nor a tab in hand — a
   * bare deep link to its floor. The browse card and the tab each carry the
   * zone themselves; this reads it from the anonymous availability endpoint
   * rather than guessing one, because a guessed zone turns a slot into the
   * wrong wall-clock time.
   *
   * Cached hard by the caller. A branch does not move.
   */
  getBranchTimeZone(branchId: string): Promise<string | null>;

  /**
   * Per-table availability for a specific slot and party size.
   *
   * Separate from `getFloorPlan` because availability depends on *when* and
   * *how many*, while the floor itself does not. The backend derives both the
   * window and the "too small / occupied" reasons — the client must not.
   *
   * `timeZoneId` is the branch's zone. The backend asks in wall-clock terms,
   * so the UTC slot is converted in that zone and never in the device's.
   */
  getTableAvailability(input: {
    branchId: string;
    slotUtc: string;
    partySize: number;
    timeZoneId?: string | undefined;
  }): Promise<readonly TableAvailability[]>;

  /**
   * The room **as it will be at a slot**, with the answer for every table.
   *
   * This is what the two booking surfaces render, and it replaces the pair they
   * used to call: `getFloorPlan` for the geometry and state, plus
   * `getTableAvailability` for the overlay. `getFloorPlan` asks about *now*, so
   * a diner picking Saturday at 20:00 was shown tables greyed out for tonight's
   * walk-ins and shown as free the ones already booked at 20:00 — the exact
   * question this product exists to answer, answered about the wrong moment.
   *
   * One request, not two. The endpoint already returns the geometry alongside
   * the answer, and two calls could disagree about the room in between.
   *
   * @returns `null` when there is no such branch. A slot the branch refuses
   * outright — in the past, beyond the booking window, outside opening hours —
   * is **not** null: it comes back with `rejection` set and the room intact, so
   * a surface can say why instead of showing an empty room.
   *
   * `excludeBookingId` is the booking being changed: it is ignored, so the
   * diner moving their own booking sees their own table free.
   */
  getSlotFloor(input: {
    branchId: string;
    slotUtc: string;
    partySize: number;
    timeZoneId?: string | undefined;
    excludeBookingId?: string | undefined;
  }): Promise<SlotFloor | null>;

  /**
   * Every time on one day, each with whether the party can still get a table —
   * `GET /api/branches/{id}/availability/slots`. Anonymous.
   *
   * What the booking screen strikes its time chips from. Decided by the same
   * per-table rules as {@link getSlotFloor}, so a time offered here opens a
   * room with a free table in it.
   *
   * `date` is `YYYY-MM-DD` in the branch's calendar. `excludeBookingId` as for
   * {@link getSlotFloor}.
   *
   * @returns `null` when there is no such branch. A day the branch refuses
   * whole — shut, beyond the window — is not null: `unavailableReason` says why.
   */
  getDaySlots(input: {
    branchId: string;
    date: string;
    partySize: number;
    excludeBookingId?: string | undefined;
  }): Promise<DaySlots | null>;

  // --- Places: the Explore list, search, details, reviews -------------------
  /**
   * Every listed branch, `GET /api/public/branches`. Anonymous.
   *
   * With a `position` the answer carries `distanceKm` and comes nearest first;
   * without one it comes best rated first. `query` and `venueType` narrow it
   * exactly as {@link searchBranches} does.
   */
  listBranches(query?: BranchSearchQuery): Promise<readonly BranchListing[]>;

  /** `GET /api/public/branches/search`: name, venue, cuisine, address and district, case-insensitive. */
  searchBranches(query: BranchSearchQuery): Promise<readonly BranchListing[]>;

  /**
   * One branch with its hours, gallery, newest reviews and photo markers, and
   * `acceptsAppBookings` — whether the Book button may be offered (K9).
   *
   * @returns `null` for a branch that is unknown, inactive or suspended.
   */
  getBranchDetail(
    branchId: string,
    position?: BranchSearchQuery['position'],
  ): Promise<BranchDetail | null>;

  /**
   * A page of 20 reviews, newest **first written** first, each marked `edited`
   * when revised. Hidden reviews are left out of the page and the aggregate.
   * `null` for an unknown branch.
   */
  getBranchReviews(input: { branchId: string; page?: number }): Promise<BranchReviewPage | null>;

  /**
   * The rooms a diner picks from, each photo with its live table pins.
   * `null` for an unknown branch.
   */
  getBranchRooms(branchId: string): Promise<BranchRooms | null>;

  /**
   * The signed-in diner's own review of a branch, or `null` when they have not
   * written one.
   *
   * @throws {UnauthorizedError} nobody is signed in.
   */
  getMyBranchReview(branchId: string): Promise<MyBranchReview | null>;

  /**
   * Write or revise the diner's review — one per diner per branch, so a second
   * save replaces the first. Saving the same stars and text again changes
   * nothing, `updatedAtUtc` included.
   *
   * @throws {ReviewNeedsVisitError} a first review with no visit in 180 days
   * (K8). Revising an existing review is never refused for this.
   * @throws {PhoneNotVerifiedError} the account's number is not confirmed.
   * @throws {ValidationError} rating outside 1–5 or text over 1000 characters.
   * @throws {NotFoundError} the branch is not published.
   * @throws {TooManyRequestsError} more than ten writes a minute.
   * @throws {UnauthorizedError} nobody is signed in.
   */
  saveMyBranchReview(command: SubmitBranchReviewCommand): Promise<MyBranchReview>;

  /**
   * Report somebody else's review, `POST /api/diner/reviews/{reviewId}/report`.
   * One report per diner per review: a second is accepted and changes nothing.
   *
   * @throws {CannotReportOwnReviewError} it is the diner's own review.
   * @throws {NotFoundError} no such review, or it is already hidden.
   * @throws {ValidationError} an unknown reason, or a note over 500 characters.
   * @throws {UnauthorizedError} nobody is signed in.
   */
  reportReview(command: ReportReviewCommand): Promise<void>;

  // --- Favourites (K11) ---------------------------------------------------------
  /**
   * The signed-in diner's saved places, newest first. A branch that has since
   * gone inactive is left out. With a `position`, each listing carries
   * `distanceKm`. Unverified accounts may keep favourites.
   *
   * @throws {UnauthorizedError} nobody is signed in.
   */
  listFavorites(position?: BranchSearchQuery['position']): Promise<readonly FavoriteBranch[]>;

  /**
   * Save a place. Idempotent: saving it again is a success.
   *
   * @throws {NotFoundError} the branch is unknown or inactive.
   * @throws {TooManyFavoritesError} the account already keeps the maximum.
   */
  addFavorite(branchId: string): Promise<void>;

  /** Unsave a place. Idempotent: a place that was not saved is a success. */
  removeFavorite(branchId: string): Promise<void>;

  /**
   * Upload the hearts made while signed out, once, on sign-in. Adds what is
   * missing and never removes; answers the whole list as {@link listFavorites}.
   *
   * @throws {ValidationError} more than 500 ids in one call.
   * @throws {TooManyFavoritesError} the merged list would exceed the maximum.
   */
  mergeFavorites(
    branchIds: readonly string[],
    position?: BranchSearchQuery['position'],
  ): Promise<readonly FavoriteBranch[]>;

  // --- The notifications feed (K12) ---------------------------------------------
  /**
   * One page of the feed, newest first, with the unread count across all of it.
   *
   * @throws {UnauthorizedError} nobody is signed in.
   */
  listNotifications(query?: NotificationPageQuery): Promise<DinerNotificationPage>;

  /** The unread count for a badge — the feed's `unreadCount`, read with the smallest page. */
  getUnreadNotificationCount(): Promise<number>;

  /**
   * Mark read: everything up to one notification, or exactly the ids given.
   * Ids that are not the diner's are ignored, never revealed.
   */
  markNotificationsRead(command: MarkNotificationsReadCommand): Promise<void>;

  // --- The diner's orders -----------------------------------------------------
  /**
   * Orders this diner is on, newest first, at most 100.
   *
   * @throws {UnauthorizedError} nobody is signed in.
   */
  listDinerOrders(segment?: DinerOrderSegment): Promise<readonly DinerOrder[]>;

  /** One order, or `null` when it is unknown or somebody else's. */
  getDinerOrder(orderId: string): Promise<DinerOrder | null>;

  // --- Takeaway (2026-10-22) ------------------------------------------------

  /**
   * Whether the branch takes takeaway now and the pickup times it offers —
   * `GET /api/diner/branches/{branchId}/takeaway`, for the checkout screen.
   * The place page's button reads `BranchDetail.takeaway`; this says whether
   * it is open now ("Takeaway from opening, 10:00" otherwise), busy, and the
   * slots. Read it again before sending: slots run out.
   *
   * @throws {NotFoundError} no such branch, or not one diners can see.
   */
  getTakeawayAvailability(branchId: string): Promise<TakeawayAvailability>;

  /**
   * Send a takeaway order — `POST /api/diner/takeaway-orders`. Paid at the
   * counter, never in the app. Idempotent on `clientCommandId`: a retry
   * answers the order the first try made (`wasReplay`).
   *
   * @throws {PhoneNotVerifiedError} the account's number was never proved.
   * @throws {TakeawayNotAcceptedError} the branch does not take takeaway.
   * @throws {TakeawayClosedError} shut now, or past the last order.
   * @throws {TakeawayBusyError} ASAP while the kitchen is full — pick a slot.
   * @throws {TakeawaySlotUnavailableError} the slot is not on offer (any more).
   * @throws {TakeawayItemsUnavailableError} dishes not on the menu, sold out
   * or "only in the hall", every one named; nothing was saved.
   * @throws {ValidationError} the shape (`lines`, `lines[i].quantity`, `note`,
   * `pickup`, `pickup.at`); see `takeawayOrderViolations`.
   * @throws {BookingCommandInUseError} somebody else's `clientCommandId`.
   */
  placeTakeawayOrder(command: PlaceTakeawayOrderCommand): Promise<TakeawayOrder>;

  /**
   * One takeaway order — the status screen; poll while active, in the
   * foreground. `null` when it is unknown or somebody else's.
   */
  getTakeawayOrder(orderId: string): Promise<TakeawayOrder | null>;

  /**
   * Cancel it — `POST /api/diner/takeaway-orders/{id}/cancel`, only while
   * sent (`canCancel`); after that it is a phone call. A second tap answers
   * it cancelled, `wasReplay`.
   *
   * @throws {TakeawayStatusConflictError} the venue answered already
   * (`orderStatus` is where it is now — redraw it).
   * @throws {NotFoundError} not the diner's order.
   */
  cancelTakeawayOrder(orderId: string): Promise<TakeawayOrder>;

  // --- Messages with the venue (2026-10-23) ----------------------------------

  /**
   * One thread — `GET /api/diner/reservations/{id}/conversation` or
   * `/api/diner/takeaway-orders/{id}/conversation`. Poll every ten seconds
   * while the screen is in front. A subject with no thread yet answers
   * `conversationId: null` and no messages.
   *
   * @returns `null` for somebody else's subject, an unknown one, or a thread
   * closed more than thirty days ago (each a 404).
   */
  getConversation(subject: ConversationSubjectRef): Promise<DinerConversation | null>;

  /**
   * Send a text — `POST …/conversation/messages`. Idempotent on
   * `clientCommandId`: a retry answers the first send's message, `wasReplay`.
   *
   * @throws {ConversationClosedError} the thread closed.
   * @throws {GuestsCannotWriteError} the venue takes no guest texts; answer
   * with the buttons or call.
   * @throws {MessagesTooFastError} five a minute, or sixty in the thread.
   * @throws {ValidationError} `text` blank or over 500 after trim.
   * @throws {NotFoundError} not the diner's booking or order.
   */
  sendGuestMessage(command: SendMessageCommand): Promise<SentMessage>;

  /**
   * "Read" — `POST …/conversation/read`, on opening the thread and on new
   * messages: up to `upToUtc` (the newest message the screen showed), else now.
   */
  markConversationRead(command: MarkConversationReadCommand): Promise<void>;

  /**
   * The diner's threads that are open or have unread venue messages —
   * `GET /api/diner/messages/unread`: the nav's dot and the Bookings rows.
   */
  getUnreadMessages(): Promise<DinerUnreadMessages>;

  // --- Phone verification -------------------------------------------------
  /**
   * Which ways of proving a number this backend has on. Anonymous, and the
   * same for everybody: a fact about the deployment, not about the diner. A
   * screen reads it before offering a choice — with no SMS provider, Telegram
   * is the only way (decided 2026-10-20, until one is chosen).
   */
  getPhoneProofChannels(): Promise<PhoneProofChannels>;

  /**
   * Send a 6-digit code.
   *
   * `localeCode` is the diner's language, so the SMS arrives in it.
   *
   * @throws {RateLimitedError} when too many codes were requested for a number.
   * @throws {SmsUnavailableError} the backend has no SMS provider; prove the
   * number with Telegram instead.
   */
  requestPhoneCode(
    phoneE164: string,
    options?: { readonly localeCode?: string | undefined },
  ): Promise<PhoneChallenge>;

  /**
   * Exchange a code for a verification token. Against the real backend this
   * is the diner sign-in: it also starts the token session.
   *
   * @throws {WrongCodeError} wrong digits; carries attempts remaining.
   * @throws {ExpiredCodeError} the challenge aged out.
   * @throws {TooManyAttemptsError} the challenge is burned.
   */
  verifyPhoneCode(input: {
    challengeId: string;
    code: string;
    localeCode?: string | undefined;
  }): Promise<VerifiedPhone>;

  /**
   * Start verifying through the Telegram bot: a deep link to open and a
   * challenge to poll. No number is asked for — the bot learns it.
   *
   * @throws {TelegramUnavailableError} the backend has Telegram switched off.
   * @throws {RateLimitedError} too many challenges started.
   */
  startTelegramVerification(options?: {
    readonly localeCode?: string | undefined;
  }): Promise<TelegramChallenge>;

  /**
   * One poll of a Telegram challenge. On `verified` the diner is signed in,
   * exactly as {@link verifyPhoneCode} signs them in.
   *
   * @throws {ExpiredCodeError} the challenge aged out or was never issued.
   * @throws {RateLimitedError} polled too often.
   */
  claimTelegramVerification(
    challengeId: string,
    options?: { readonly localeCode?: string | undefined },
  ): Promise<TelegramClaimResult>;

  // --- The account --------------------------------------------------------
  /**
   * Sign up with a username, an email, a password and a phone number.
   *
   * Starts the token session exactly as {@link verifyPhoneCode} does — the
   * diner is signed in when this resolves. The number is **not** verified by
   * registering; `phoneVerified` on the profile stays false until they pass an
   * SMS code once, which the profile screen offers.
   *
   * @throws {ValidationError} a field broke a rule; `field` names it.
   * @throws {UsernameTakenError} somebody has that username.
   * @throws {EmailTakenError} somebody signed up with that email.
   * @throws {PhoneInUseError} the number already has an account — offer
   * "Log in with your phone number instead", which signs that account in.
   * @throws {RateLimitedError} too many sign-ups from this address.
   */
  registerDiner(command: RegisterDinerCommand): Promise<DinerSignInResult>;

  /**
   * Sign in with a username or an email and the password. Starts the token
   * session like {@link verifyPhoneCode}.
   *
   * @throws {InvalidCredentialsError} no match — wrong identifier, wrong
   * password, an account with no password yet, an inactive account: one
   * answer for all four, on purpose.
   * @throws {TooManyAttemptsError} ten misses in fifteen minutes for this
   * identifier or this address; wait, or use a code.
   */
  loginDiner(command: LoginDinerCommand): Promise<DinerSignInResult>;

  /**
   * The signed-in diner's own profile, `GET /api/diner/me`.
   *
   * @throws {UnauthorizedError} nobody is signed in.
   */
  getDinerProfile(): Promise<DinerProfileView>;

  /**
   * Change the name, username or email — only the fields present. Same rules
   * and the same refusals as {@link registerDiner}.
   *
   * @throws {ValidationError}
   * @throws {UsernameTakenError}
   * @throws {EmailTakenError}
   */
  updateDinerProfile(command: UpdateDinerProfileCommand): Promise<DinerProfileView>;

  /**
   * Set or change the password. An SMS-made account with none yet sends no
   * `currentPassword`; one that has a password must.
   *
   * @throws {InvalidCredentialsError} the current password was wrong.
   * @throws {ValidationError} the new one breaks the rule.
   */
  setDinerPassword(command: SetDinerPasswordCommand): Promise<void>;

  /**
   * Replace the avatar. One multipart `file` part: on React Native hand over
   * the picker's `{ uri, name, type }`, on the web a `Blob` or `File` — see
   * {@link DinerPhotoFile}. The links on the answer are already absolute.
   *
   * Same sniffing and size cap as a menu photo, so the same refusal.
   *
   * @throws {UnsupportedImageError} not a JPEG, PNG or WebP, too big, or too
   * small; `reason` says which.
   */
  uploadDinerPhoto(file: DinerPhotoFile): Promise<Photo>;

  /** Take the avatar off. Idempotent: an account with no photo answers success. */
  removeDinerPhoto(): Promise<void>;

  /**
   * Delete the account, `DELETE /api/diner/me` (K2).
   *
   * An account with a password confirms with it; one without confirms with a
   * code from {@link requestPhoneCode} for its own number — or with nothing at
   * all when its session proved the phone in the last ten minutes (a code or a
   * Telegram sign-in stamps the token with `phone_proved_at`), which is the
   * only proof there is where SMS is off. A phone proof never replaces a
   * password. On success the
   * server has already ended every session: the next diner call rejects with
   * `SessionRevokedError`, so the caller signs out locally straight after.
   * Reviews, the photo, favourites and notifications go; bookings and orders
   * stay with the venue, no longer linked to anybody.
   *
   * @throws {ValidationError} the password (or the code, with no fresh phone
   * proof) is missing; `field` names it.
   * @throws {InvalidCredentialsError} the password or the code is wrong.
   * @throws {TooManyAttemptsError} too many wrong tries; wait.
   * @throws {PhoneNotVerifiedError} the number was never confirmed.
   */
  deleteDinerAccount(command: DeleteDinerAccountCommand): Promise<void>;

  // --- Booking ------------------------------------------------------------
  /**
   * Create a booking. Idempotent on `commandId`: replaying the same command
   * returns the same booking rather than making a second one.
   *
   * A party over the branch's instant-confirmation limit yields a booking with
   * status `pendingApproval` — a normal result, not an error.
   *
   * @throws {TableTakenError} someone else got there first — or somebody sat
   * down there — with the room from the 409 when it came.
   * @throws {LeadTimeExceededError} the slot became too soon while deciding.
   * @throws {BookingRejectedError} a rule refused it; carries the reason.
   * @throws {BookingBusyError} the table was locked; tap again, same command.
   * @throws {BookingsNotAcceptedError} an app booking at a branch whose
   * `acceptsAppBookings` is false (K9).
   * @throws {ValidationError} a `note` over 500 characters; `field` is `note`.
   * @throws {FreeByRequiredError} a booking follows on the table and
   * `acceptsFreeByUtc` was missing or not the time it needs; carries that time.
   */
  createBooking(command: CreateBookingCommand): Promise<Booking>;

  /** The caller's bookings, split upcoming and past by the server's own rule. */
  listBookings(): Promise<MyBookings>;
  getBooking(bookingId: string): Promise<Booking | null>;

  /**
   * Cancel a booking. Lateness is a message, not a block: cancelling late is
   * far better for the venue than a no-show. Only a booking that no longer
   * holds a table — seated, finished, already cancelled — has nothing to
   * cancel, and an already-cancelled one is reported as the success it is.
   */
  cancelBooking(bookingId: string): Promise<Booking>;

  /**
   * Move a booking to another time, party size or table, keeping its code —
   * see {@link RescheduleBookingCommand}. Idempotent on `commandId`.
   *
   * The status comes back decided afresh: a change may need the venue's
   * approval where the original did not, which is a normal result.
   *
   * @throws {BookingNotChangeableError} it is not waiting or confirmed any more,
   * or it has started.
   * @throws {NotFoundError} no booking of the diner's has that id. Somebody
   * else's answers the same, on purpose.
   * @throws {TableTakenError} the new table is booked or sat at then.
   * @throws {LeadTimeExceededError} the new time is too soon.
   * @throws {BookingRejectedError} a rule refused it; carries the reason.
   * @throws {BookingBusyError} the table was locked; tap again, same command.
   * @throws {ConcurrencyConflictError} the booking changed underneath — read it again.
   * @throws {PhoneNotVerifiedError} the account's number is not confirmed.
   * @throws {FreeByRequiredError} as for a new booking.
   */
  rescheduleBooking(command: RescheduleBookingCommand): Promise<Booking>;

  /**
   * The earlier guest's answer to a later guest's request for their table —
   * see {@link AnswerTableRequestCommand}. Their own booking only. Answers with
   * their booking as it now stands: on yes, cut to the time and carrying the
   * promise; either way with no request left on it.
   *
   * @throws {TableRequestClosedError} it lapsed, the later guest let it go, or
   * it was already answered.
   * @throws {NotFoundError} no booking of the diner's has that id.
   */
  answerTableRequest(command: AnswerTableRequestCommand): Promise<Booking>;

  // --- Pre-orders (2026-10-21) --------------------------------------------

  /**
   * Save the pre-order of the diner's own booking, whole —
   * `PUT /api/reservations/{reservationId}/pre-order`. Offer it while
   * `canEditPreOrder(booking)`; at booking time, book first and then save
   * (a booking made less than two hours ahead cannot have one). Idempotent
   * on `clientCommandId`: a replay answers the pre-order as it stands.
   * The menu is {@link getBranchMenuDetail} narrowed by `preOrderMenu`.
   *
   * @throws {PreOrderLockedError} two hours before the start or later.
   * @throws {PreOrderAlreadySentError} a waiter sent it to the kitchen.
   * @throws {PreOrdersNotAcceptedError} the branch does not take pre-orders.
   * @throws {PreOrderItemsUnavailableError} dishes not on the menu, sold out
   * or excluded — every one named; nothing saved.
   * @throws {BookingNotChangeableError} not pending or confirmed, or started.
   * @throws {ValidationError} a bound (`lines`, `lines[i].quantity`,
   * `lines[i].note`, `note`); see `preOrderDraftViolations`.
   * @throws {BookingCommandInUseError} the command id was used for something else.
   * @throws {ConcurrencyConflictError} two saves at once — read again and retry.
   * @throws {NotFoundError} not the diner's booking.
   */
  replacePreOrder(command: ReplacePreOrderCommand): Promise<PreOrderResult>;

  /**
   * Remove the pre-order — `POST /api/reservations/{id}/pre-order/clear`.
   * Under the same window as saving, whether or not the branch still takes
   * pre-orders; a booking with none answers with none. Same refusals as
   * {@link replacePreOrder}, less the branch switch and the dishes.
   */
  clearPreOrder(command: ClearPreOrderCommand): Promise<PreOrderResult>;

  /**
   * "Yes, on my way" — `POST /api/reservations/{id}/on-my-way`. Recorded
   * once: a second tap answers the first time, `wasReplay`. "Can't come" is
   * {@link cancelBooking}.
   *
   * @throws {OnMyWayNotOpenError} not confirmed or seated, or over.
   * @throws {NotFoundError} not the diner's booking.
   */
  confirmOnMyWay(reservationId: string): Promise<OnMyWayResult>;

  /**
   * "I'm running late" — 10, 15 or 30 minutes (2026-10-22),
   * `POST /api/reservations/{id}/running-late`. The same window as on my way,
   * a confirmed booking only; a later answer overwrites an earlier one. It
   * does not hold the table any longer: the grace is the policy's.
   *
   * @throws {OnMyWayNotOpenError} not confirmed, more than two hours before
   * the start, or over.
   * @throws {ValidationError} `minutes` other than 10, 15 or 30.
   * @throws {NotFoundError} not the diner's booking.
   */
  reportRunningLate(command: ReportRunningLateCommand): Promise<RunningLateResult>;

  // --- Notifications ------------------------------------------------------

  /**
   * Register this phone for push.
   *
   * Idempotent on the token, server-side: the app calls it on launch and on
   * every rotation, and a row per launch would mean one diner with a hundred
   * devices and a hundred copies of every message.
   */
  registerPushDevice(command: RegisterPushDeviceCommand): Promise<{ deviceId: string }>;

  /**
   * The current state of one booking, read when a notification lands on it.
   *
   * Deliberately narrower than {@link getBooking} — see {@link ReservationState}
   * for why the rich contract cannot be built from the wire. This one is real.
   */
  getReservationState(reservationId: string): Promise<ReservationState | null>;

  /**
   * Cancel, from the reminder's own action button.
   *
   * The whole reason the reminder exists: cancelling has to be easier than not
   * showing up. A booking that is already cancelled is reported as success —
   * see {@link CancelReservationCommand}.
   */
  cancelReservation(command: CancelReservationCommand): Promise<ReservationState>;

  /**
   * Keep the table a little longer, from the late nudge's action button.
   *
   * @throws {HoldAlreadyExtendedError} the one extension is spent.
   * @throws {HoldNotActiveError} the booking has not started, so there is no
   * held table to keep yet. Nothing was spent.
   * @throws {ExtensionsNotOfferedError} the branch does not hold tables late.
   */
  extendReservationHold(command: ExtendHoldCommand): Promise<ExtendHoldOutcome>;

  // --- Scanning in and the shared tab -------------------------------------
  /**
   * Exchange a scanned (or typed) table code for a tab.
   *
   * Needs no account and no verified phone — someone walked in off the street,
   * sat down and scanned. Idempotent on `command.commandId`, which is what stops
   * a double scan or a retry after a timeout from opening two tabs on one table.
   *
   * Opening a new tab makes you the host; landing on an existing one makes you
   * a pending joiner. Both are successes and both come back in {@link ScanResult}.
   *
   * @throws {TableOutOfServiceError} the table exists but is not in service.
   * @throws {UnknownTableCodeError} nothing matches the code.
   * @throws {TabClosedError} the tab on that table was already closed and paid.
   */
  scanTableCode(command: ScanTableCommand): Promise<ScanResult>;

  /**
   * "I'm at my table": open (or join) the tab on the table this diner booked,
   * from the code on their own booking.
   *
   * The one door into a tab that needs the diner's session, because a booking
   * is the one thing here with an account behind it. Everything after the code
   * is resolved is the scan — the same table, the same host, the same
   * {@link ScanResult}, idempotent on the same `commandId`.
   *
   * @throws {BookingNotFoundError} no booking of theirs has that code. A
   * stranger's code answers identically, on purpose.
   * @throws {BookingTooEarlyError} the table is not being held for it yet;
   * `earliestUtc` says from when.
   * @throws {BookingEndedError} the sitting is over.
   * @throws {BookingNotActiveError} awaiting the venue, cancelled or a no-show.
   * @throws {BookingTableOccupiedError} another party is still seated at the
   * booked table; the booker is never put on their tab.
   * @throws {TableOutOfServiceError} the booked table is out of service.
   * @throws {TabClosedError} the tab on that table is settling or closed.
   */
  openTabByBooking(command: OpenTabByBookingCommand): Promise<ScanResult>;

  /**
   * Join with a host's invitation — the QR on their screen or the shared link.
   *
   * @throws {InviteExpiredError} the invitation is unknown, revoked or old.
   * @throws {TabClosedError} the tab is being settled or closed.
   */
  joinTab(command: JoinTabCommand): Promise<ScanResult>;

  /**
   * Leave. A guest comes off the tab; a host hands it to the approved guest
   * who has been on it longest.
   *
   * @throws {HostCannotLeaveError} the host has nobody approved to hand it to.
   */
  leaveTab(input: { tabId: string }): Promise<void>;

  /**
   * Mint a fresh invite for a tab, revoking the last one.
   *
   * The QR and the share link carry the same token. `commandId` keys the
   * caller's cache so a refetch reuses the invite; the server has no command
   * id here, and each call to it issues a new token.
   */
  createTabInvite(input: { tabId: string; commandId: string }): Promise<TabInvite>;

  /**
   * Put a name on this phone's place at the tab, so the host sees "Tigran"
   * rather than "Guest 3" — `POST /api/tabs/{tabId}/display-name`. Optional
   * for a walk-in, and answered with this participant as it now stands.
   *
   * @throws {ValidationError} a blank name, or one over the server's length.
   * @throws {TabAccessEndedError} the tab closed, or this phone is no longer on it.
   */
  setTabDisplayName(tabId: string, displayName: string): Promise<TabParticipantChange>;

  // --- Host controls ------------------------------------------------------
  /**
   * Each host action answers with the one participant it changed. The screens
   * refetch the tab for the roster; the flags on this answer are the only
   * place a host sees another person's permissions, because the roster on the
   * tab carries none.
   *
   * There is no "table default" action: the only table-level default the
   * server has is hiding the total, and that is chosen when the tab is opened.
   *
   * @throws {NotTabHostError} the caller is not the host.
   */
  approveJoin(input: {
    tabId: string;
    participantId: string;
    commandId: string;
  }): Promise<TabParticipantChange>;
  rejectJoin(input: {
    tabId: string;
    participantId: string;
    commandId: string;
  }): Promise<TabParticipantChange>;
  removeParticipant(input: {
    tabId: string;
    participantId: string;
    commandId: string;
  }): Promise<TabParticipantChange>;

  /**
   * Set one participant's three flags together.
   *
   * The server rejects `canPay` without `canSeeTableTotal`; the client must
   * never send that pair. See `normalizeTabPermissions`.
   */
  setParticipantPermissions(input: {
    tabId: string;
    participantId: string;
    permissions: TabPermissions;
    commandId: string;
  }): Promise<TabParticipantChange>;

  /**
   * Raise a hand, in software. Presets only, no free text, no reply expected.
   *
   * With `reason: 'bill'` the pay sheet adds `bill` — whose bill and what tip —
   * and the answer carries the amounts the server worked out from them.
   *
   * @throws {ValidationError} `bill` with any other reason (`billScope`), a tip
   * outside 0–25 (`tipPercent`), or nothing left to pay for that scope
   * (`billScope`).
   * @throws {ServiceRequestRateLimitedError} the table has asked several times
   * in a short window; a waiter already knows.
   */
  callWaiter(input: {
    tabId: string;
    reason: WaiterCallReason;
    commandId: string;
    bill?: BillRequestInput | undefined;
  }): Promise<WaiterCall>;

  // --- Ordering and the bill ----------------------------------------------

  /**
   * The menu with everything a diner needs before ordering.
   *
   * Separate from {@link getBranchMenu}, which is the price-only shape the
   * pending-approval screen has used since scanning shipped. This one carries
   * the ingredients, allergens, portion size, spice level and prep time that the
   * backend made required fields precisely so nobody has to ask a waiter.
   *
   * @throws {TabAccessEndedError} the tab closed, or this phone is no longer on it.
   */
  getBranchMenuDetail(branchId: string): Promise<BranchMenu | null>;

  /**
   * The tab as this participant is allowed to see it.
   *
   * The permission rule lives on the server and arrives applied: a participant
   * whose host has hidden the total gets their own lines and no aggregate at
   * all, which {@link TabMoney} makes unrepresentable as a zero.
   *
   * @throws {TabAccessEndedError} the tab closed, or this phone is no longer on it.
   */
  getDinerTab(tabId: string): Promise<DinerTabView | null>;

  /**
   * Everything that happened on the tab after `afterSequence`.
   *
   * Drives the live bill through `@yalla/realtime`'s sequence stream. An event
   * says *that* something changed; the money is refetched, never reconstructed
   * from payloads, because the arithmetic on the server is the one that is right.
   *
   * @throws {TabAccessEndedError} the tab closed, or this phone is no longer on it.
   */
  getTabEvents(input: { tabId: string; afterSequence: number }): Promise<TabEventPage>;

  /**
   * Place one order for everything in the tray.
   *
   * One call, not one per item: five items arriving as five tickets is a mess in
   * the kitchen and unreadable on the counter panel. Idempotent on
   * `clientCommandId`, so a retry after a lost response cannot double the round.
   *
   * @throws {TabAccessEndedError} the tab closed, or this phone is no longer on it.
   */
  placeOrder(command: PlaceOrderCommand): Promise<PlaceOrderResult>;

  /**
   * Who owes what, with shared items and the service charge apportioned.
   *
   * @throws {TabAccessEndedError} the tab closed, or this phone is no longer on it.
   */
  getTabShares(tabId: string): Promise<TabShares | null>;

  /**
   * The host picks how the bill will be split. Changeable until the first
   * payment lands, which the server enforces.
   *
   * @throws {NotTabHostError} the caller is not the host.
   * @throws {TabAccessEndedError} the tab closed, or this phone is no longer on it.
   */
  setSettlementMode(command: SetSettlementModeCommand): Promise<DinerTabView>;
}
