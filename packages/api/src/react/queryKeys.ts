import type { BookingSummaryDays, ListVenuesQuery } from '../contracts/console';
import type { ConversationSubjectKind } from '../contracts/messages';
import type { MessageHistoryFilters } from '../contracts/messageHistory';
import type { ActivityFilters } from '../contracts/activity';
import type { VenueReviewQuery } from '../contracts/reviews';
import type { ReportQuery, ReportSection } from '../contracts/reports';
import type { PlatformActivityQuery } from '../contracts/platformHome';

// --- Keys -------------------------------------------------------------------

export const queryKeys = {
  venues: ['venues'] as const,
  venue: (venueId: string) => ['venue', venueId] as const,
  floor: (branchId: string) => ['floor', branchId] as const,
  availability: (branchId: string, slotUtc: string, partySize: number) =>
    ['availability', branchId, slotUtc, partySize] as const,
  // Under `availability` on purpose: every mutation that already invalidates
  // `['availability', branchId]` invalidates the slot-aware room with it, and
  // one that forgot would leave the drawn room stale after a booking landed.
  // The booking being changed is in the key: the same slot asked without it
  // is a different answer, with that booking's own table taken.
  slotFloor: (
    branchId: string,
    slotUtc: string,
    partySize: number,
    timeZoneId: string,
    excludeBookingId?: string | undefined,
  ) =>
    [
      'availability',
      branchId,
      'slotFloor',
      slotUtc,
      partySize,
      timeZoneId,
      excludeBookingId ?? null,
    ] as const,
  /** A day of slots. Under `availability` for the same reason as `slotFloor`. */
  daySlots: (
    branchId: string,
    date: string,
    partySize: number,
    excludeBookingId?: string | undefined,
  ) => ['availability', branchId, 'daySlots', date, partySize, excludeBookingId ?? null] as const,
  /*
   * The diner's own bookings. The diner app spreads these in under the same
   * names from `apps/diner/src/data/bookingKeys.ts`, so a booking mutation here
   * and the bookings screens there read and invalidate one cache entry.
   */
  bookings: ['bookings'] as const,
  booking: (bookingId: string) => ['booking', bookingId] as const,
  reservationState: (reservationId: string) => ['reservationState', reservationId] as const,
  consoleVenues: (query: ListVenuesQuery) => ['console', 'venues', query] as const,
  /**
   * The whole platform, deleted venues included: the redesigned list filters
   * and sorts in place. Under `['console', 'venues']`, so every venue command's
   * invalidation reaches it.
   */
  allConsoleVenues: ['console', 'venues', 'all'] as const,
  /** Under the venue, so a venue command's invalidation of the venue reaches it too. */
  venueBookingsSummary: (venueId: string, days: BookingSummaryDays) =>
    ['console', 'venue', venueId, 'bookingsSummary', days] as const,
  consoleVenue: (venueId: string) => ['console', 'venue', venueId] as const,
  // Its own key, not `consoleVenue`'s: the two reads answer different shapes
  // for different callers, and `useVenueCommand` writes a `ConsoleVenueDetail`
  // into `consoleVenue` on every platform command — a shared key would hand
  // the venue section a platform body the next time the admin suspended one.
  managedVenue: (venueId: string) => ['console', 'managedVenue', venueId] as const,
  editorFloorPlan: (branchId: string) => ['console', 'floorPlan', branchId] as const,
  /** Which ways of proving a phone this backend has on. See `usePhoneProofChannels`. */
  phoneProofChannels: ['phoneProofChannels'] as const,
  /** One poll of a Telegram verification challenge. See `useTelegramVerification`. */
  telegramClaim: (challengeId: string) => ['telegramClaim', challengeId] as const,
  staffFloor: (branchId: string) => ['staff', 'floor', branchId] as const,
  staffTab: (tabId: string) => ['staff', 'tab', tabId] as const,
  orderQueue: (branchId: string) => ['staff', 'orders', branchId] as const,
  serviceRequests: (branchId: string) => ['staff', 'serviceRequests', branchId] as const,
  /** Bookings waiting for the floor's yes or no. */
  awaitingApproval: (branchId: string) => ['staff', 'awaitingApproval', branchId] as const,
  /**
   * Bookings made by time only that nobody has seated (2026-10-29). Invalidate
   * on the change stream's `bookingChanged`, a floor decision and a seat.
   */
  bookingsWithoutTable: (branchId: string) => ['staff', 'withoutTable', branchId] as const,
  /** A manager's Today board; `''` for the session's own branch. */
  staffToday: (branchId: string) => ['staff', 'today', branchId] as const,
  /** My results: the signed-in person's own page, by range and recent list. */
  myPerformance: (branchId: string, from: string, to: string, list: string, limit: number) =>
    ['staff', 'myPerformance', branchId, from, to, list, limit] as const,
  /** My results in one read: the figures, the chart and every list, by range and page size. */
  myResults: (branchId: string, from: string, to: string, limit: number) =>
    ['staff', 'myResults', branchId, from, to, limit] as const,
  /** Who a table can be handed to, read when the transfer chooser opens. */
  transferTargets: (tabId: string) => ['staff', 'transferTargets', tabId] as const,
  /** This device's push switches: the device's own, not a branch's. */
  staffNotificationSettings: ['staff', 'device', 'notificationSettings'] as const,
  staffPushConfig: ['staff', 'pushConfig'] as const,
  /**
   * The floor's pre-order cards (2026-10-21). Invalidate on the change
   * stream's `preOrderChanged` and `bookingChanged`.
   */
  duePreOrders: (branchId: string) => ['staff', 'preOrders', branchId] as const,
  /**
   * The counter's takeaway orders, active and finished today (2026-10-22).
   * Invalidate on the change stream's `takeawayChanged` (2026-10-26); polled
   * slowly as the fallback.
   */
  takeawayOrders: (branchId: string) => ['staff', 'takeaway', branchId] as const,
  /** Whether a branch takes takeaway now, and its pickup slots: the checkout. */
  takeawayAvailability: (branchId: string) => ['takeaway', 'availability', branchId] as const,
  /** One takeaway order: the guest's status screen. */
  takeawayOrder: (orderId: string) => ['takeaway', 'order', orderId] as const,
  /*
   * Guest messages (2026-10-23). The guest's are all under `['messages']` —
   * the diner's own, reset with the session — and the floor's under
   * `['staff', …]`.
   */
  /** One thread, as the guest reads it. */
  dinerConversation: (kind: ConversationSubjectKind, id: string) =>
    ['messages', 'conversation', kind, id] as const,
  /** The guest's unread summary: the nav's dot and the Bookings cards' rows. */
  unreadMessages: ['messages', 'unread'] as const,
  /** The floor's inbox: the Messages tab, its badge and the Now rail's section. */
  staffConversations: (branchId: string) => ['staff', 'conversations', branchId] as const,
  /** Every thread the floor has open: the prefix of {@link staffConversation}. */
  staffConversationsAll: ['staff', 'conversation'] as const,
  /** One thread, as the floor reads it. */
  staffConversation: (kind: ConversationSubjectKind, id: string) =>
    ['staff', 'conversation', kind, id] as const,
  /** The branch's message settings: the Policy page's card. */
  messageSettings: (branchId: string) => ['console', 'messageSettings', branchId] as const,
  /** Every history list of a branch: the prefix of {@link messageHistory}. */
  messageHistoryAll: (branchId: string) => ['console', 'messageHistory', branchId] as const,
  /** The console's message history (2026-10-24), one key per set of filters; pages inside. */
  messageHistory: (branchId: string, filters: MessageHistoryFilters) =>
    [
      'console',
      'messageHistory',
      branchId,
      filters.from,
      filters.to,
      filters.kind,
      filters.q.trim(),
      filters.unansweredOnly,
    ] as const,
  /**
   * One thread as the console's history reads it: under `console`, with the
   * console's session, apart from the floor's `staffConversation` — the
   * tablet's cache is another person's view of the same thread.
   */
  historyConversation: (kind: ConversationSubjectKind, id: string) =>
    ['console', 'messageHistoryThread', kind, id] as const,
  /** Every activity list of a branch: the prefix of {@link activity}. */
  activityAll: (branchId: string) => ['console', 'activity', branchId] as const,
  /** The console's History feed (2026-10-24), one key per set of filters; pages inside. */
  activity: (branchId: string, filters: ActivityFilters) =>
    [
      'console',
      'activity',
      branchId,
      filters.date,
      filters.who.kind === 'staff' ? filters.who.staffMemberId : filters.who.kind,
      filters.category,
      filters.q.trim(),
    ] as const,
  /** One bill's, booking's or order's timeline. */
  activityTimeline: (branchId: string, type: string, id: string) =>
    ['console', 'activityTimeline', branchId, type, id] as const,
  /** Staff → Results over one range. */
  staffPerformance: (branchId: string, from: string, to: string) =>
    ['console', 'staffPerformance', branchId, from, to] as const,
  /** One person's page over one range. */
  staffMemberPerformance: (branchId: string, staffMemberId: string, from: string, to: string) =>
    ['console', 'staffMemberPerformance', branchId, staffMemberId, from, to] as const,
  /** One of a person's lists, a page at a time. */
  staffRecent: (branchId: string, staffMemberId: string, from: string, to: string, list: string) =>
    ['console', 'staffRecent', branchId, staffMemberId, from, to, list] as const,
  /** Tables a scan seated with no proved number, waiting for a waiter to let them order. */
  tabsAwaitingAdmission: (branchId: string) =>
    ['staff', 'tabsAwaitingAdmission', branchId] as const,
  staffMenu: (branchId: string) => ['staff', 'menu', branchId] as const,
  tabLines: (tabId: string) => ['staff', 'tabLines', tabId] as const,
  adminMenu: (branchId: string) => ['console', 'menu', branchId] as const,
  publicVenue: (venueSlug: string) => ['public', 'venue', venueSlug] as const,
  /** The chooser's photos and districts, from the listing. */
  publicVenueListings: (venueSlug: string) => ['public', 'venueListings', venueSlug] as const,
  publicBranch: (venueSlug: string, branchSlug: string) =>
    ['public', 'branch', venueSlug, branchSlug] as const,
  publicMenu: (branchId: string) => ['public', 'menu', branchId] as const,
  /** The branch's listing half: cuisine, price, rating, about, gallery, newest reviews. */
  publicBranchDetail: (branchId: string) => ['public', 'branchDetail', branchId] as const,
  /** Every published review, a page at a time, for "see all". */
  publicReviews: (branchId: string) => ['public', 'reviews', branchId] as const,
  managedBooking: (token: string) => ['public', 'booking', token] as const,
  openingHours: (branchId: string) => ['console', 'hours', branchId] as const,
  specialDays: (branchId: string) => ['console', 'specialDays', branchId] as const,
  reservationPolicy: (branchId: string) => ['console', 'policy', branchId] as const,
  reservationPolicyDefaults: (branchId: string) => ['console', 'policyDefaults', branchId] as const,
  publicProfile: (branchId: string) => ['console', 'publicProfile', branchId] as const,
  branchListing: (branchId: string) => ['console', 'listing', branchId] as const,
  pendingReservations: (branchId: string) => ['console', 'pendingReservations', branchId] as const,
  /** Whether the branch takes pre-orders, when the card appears, which dishes are excluded. */
  preOrderSettings: (branchId: string) => ['console', 'preOrderSettings', branchId] as const,
  /** The branch's takeaway settings (2026-10-22). */
  takeawaySettings: (branchId: string) => ['console', 'takeawaySettings', branchId] as const,
  /** A branch's today: Overview's cards, chart and bookings. */
  branchOverview: (branchId: string) => ['console', 'branchOverview', branchId] as const,
  /*
   * `['console', 'readiness', …]` is the prefix the staff and device mutations
   * already invalidate, so a checklist reading this key refreshes when a person
   * or a tablet is added, and so does every save below that feeds a line.
   */
  readiness: (branchId: string) => ['console', 'readiness', branchId] as const,
  platformReviews: (branchId: string, query: VenueReviewQuery) =>
    ['console', 'platformReviews', branchId, query] as const,
  venueReviews: (branchId: string, query: VenueReviewQuery) =>
    [
      'console',
      'venueReviews',
      branchId,
      query.filter ?? 'all',
      query.page ?? 1,
      query.pageSize ?? null,
    ] as const,
  staff: (venueId: string) => ['console', 'staff', venueId] as const,
  devices: (branchId: string, kind?: 'tablet' | 'phone') =>
    kind
      ? (['console', 'devices', branchId, kind] as const)
      : (['console', 'devices', branchId] as const),
  shifts: (branchId: string) => ['console', 'shifts', branchId] as const,
  platformOverview: ['console', 'platformOverview'] as const,
  outboxHealth: ['console', 'outboxHealth'] as const,
  /** Guests blocked for no-shows (platform admin). */
  bookingBlocks: ['console', 'bookingBlocks'] as const,
  platformActivity: (query: PlatformActivityQuery) =>
    ['console', 'platformActivity', query.limit ?? null, query.venueId ?? null] as const,
  platformProfile: ['console', 'platformProfile'] as const,
  venueProfile: ['console', 'venueProfile'] as const,
  venueSessions: ['console', 'venueSessions'] as const,
  /*
   * One key per section, and the section name is in it.
   *
   * Five keys rather than one keyed on the range, because the five sections
   * load, fail and retry independently — a single key would make the slowest
   * report (the menu one, which anti-joins the whole menu) the arrival time of
   * the whole screen, and one erroring section would blank the page.
   */
  report: (section: ReportSection, query: ReportQuery) =>
    [
      'console',
      'report',
      section,
      query.branchId,
      query.from,
      query.to,
      query.rollUpVenue ?? false,
    ] as const,
};
