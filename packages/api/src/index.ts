export { ApiClient, createApiClient } from './client';
export type { ApiClientConfig, ApiResponse, RequestOptions, TokenGetter } from './client';

export {
  ApiError,
  AuthError,
  ConcurrencyConflictError,
  ForbiddenError,
  InvalidTransitionError,
  NetworkError,
  NotFoundError,
  ServerError,
  SESSION_REVOKED_CODE,
  SessionRevokedError,
  TimeoutError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
  describeFailure,
  isConcurrencyConflict,
  isOffline,
  isRetryable,
  isSessionRevoked,
} from './errors';
export type { FailureKind, FieldViolation } from './errors';

export { parseProblem, problemContext } from './problem';
export type { ProblemDetails, WireContext } from './problem';

export { PROBLEM_CODE_STATUS, ProblemCodes, isProblemCode } from './generated/problemCodes';
export type { ProblemCode, ProblemContexts } from './generated/problemCodes';

export { newCommandId, isCommandId } from './ids';

export { createQueryClient, staleTime } from './queryClient';
export type { CreateQueryClientOptions } from './queryClient';

export {
  ApiConfigError,
  DEFAULT_BACKEND_HTTP_PORT,
  LOCAL_BACKEND_URL,
  deriveBaseUrlFromHost,
  resolveApiConfig,
  resolveDataSource,
} from './config';
export type { ApiConfig, DataSource, ResolveApiConfigInput } from './config';

// --- Auth --------------------------------------------------------------------
export { createAuthSession, webLocksExclusive } from './auth/session';
export type {
  AuthSession,
  AuthSessionConfig,
  AuthState,
  SignOutReason,
  TokenPair,
} from './auth/session';
export { createMemoryTokenStorage } from './auth/storage';
export type { TokenStorage } from './auth/storage';
export { claimString, decodeJwtPayload, jwtExpiresAtMs } from './auth/jwt';
export type { JwtPayload } from './auth/jwt';
export { createDinerAuth, createVenueUserAuth, staffRoleToUserRole } from './auth/endpoints';
export type { DinerAuth, VenueUserAuth, VenueUserIdentity } from './auth/endpoints';

export type { paths, components, operations } from './generated/schema';

// --- Reservation flow -------------------------------------------------------
export type { YallaGateway } from './gateway';
export { resolveGateway } from './resolveGateway';
export type { ResolveGatewayOptions } from './resolveGateway';

export type {
  DerivedTableState,
  FloorPlanData,
  FloorRoomGroup,
  FloorTable,
  TablePin,
} from './contracts/tableFloor';
export { byRoomThenLabel, groupByRoom } from './contracts/tableFloor';
export {
  MOCK_FLOOR_NOW,
  cafeFloorPlan,
  cafeRoomFloor,
  restaurantRoomFloor,
  roomFloor,
} from './mocks/roomFloors';
export type { MockRoom, MockRoomFloor, MockRoomSpec, MockTableSeed } from './mocks/roomFloors';
export { createMockGateway } from './mocks/mockGateway';
export type { MockGateway, MockGatewayOptions } from './mocks/mockGateway';
export { MOCK_JOURNAL_PREFIX, clearMockJournal, persistMockGateway } from './mocks/persistence';
export { browserMockStorage, resetBrowserMockWorlds } from './mocks/browserStorage';
export type { MockJournalStorage, PersistedMock, PersistedMockOptions } from './mocks/persistence';
export type { MockPersistence } from './resolveConsoleGateway';
export { createMockRegistry, mockRegistry } from './mocks/mockRegistry';
export type { MockRegistry } from './mocks/mockRegistry';
export { createMockStaffAuth } from './mocks/staffAuthMock';
export type { StaffAuthMockOptions } from './mocks/staffAuthMock';
export { createMockVenueUserAuth } from './mocks/venueAuthMock';
export type { VenueAuthMockOptions } from './mocks/venueAuthMock';
export { MOCK_STAFF_PIN, fixtureStaffFor } from './mocks/staffFixture';
export { createHttpGateway } from './http/httpGateway';
export type { GatewayAudience, HttpGatewayOptions, TabTokenStorage } from './http/httpGateway';

export type {
  AnswerTableRequestCommand,
  AvailabilityWindowDto,
  Booking,
  BookingStatus,
  BranchPolicy,
  BranchSummary,
  BookingChannel,
  BookingRules,
  CreateBookingCommand,
  DaySlot,
  DaySlots,
  IncomingTableRequest,
  KnownTableUnavailableReason,
  MyBookings,
  PhoneChallenge,
  PhoneProofChannels,
  RescheduleBookingCommand,
  SlotFloor,
  TableAvailability,
  TableUnavailableReason,
  TelegramChallenge,
  TelegramClaimResult,
  VenueSummary,
  VenueType,
  VerifiedPhone,
} from './contracts/booking';

export type {
  BranchBadge,
  BranchDetail,
  BranchListing,
  BranchOpeningBlock,
  BranchReview,
  BranchReviewPage,
  BranchSearchQuery,
  BranchRoom,
  BranchRoomPhoto,
  BranchRooms,
  BranchTableMarker,
  DinerOrder,
  DinerOrderLine,
  DinerOrderSegment,
  DinerOrderStatus,
  MarkerStatus,
  MyBranchReview,
  SubmitBranchReviewCommand,
} from './contracts/places';
export { haversineKm } from './mocks/mockGateway';
export type { MockVisit } from './mocks/mockGateway';
export { clampBranchSearch, MAX_BRANCH_SEARCH_LENGTH } from './contracts/places';

// --- Hardening contract K0 and the 2026-09-14 addendum ------------------------
export { MAX_BOOKING_NOTE, VENUE_TYPES } from './contracts/booking';
export { MAX_FAVORITES } from './contracts/favorites';
export type { FavoriteBranch } from './contracts/favorites';
export {
  DINER_NOTIFICATION_KINDS,
  NOTIFICATION_PAGE_SIZE,
  isKnownNotificationKind,
} from './contracts/notifications';
export type {
  DinerNotification,
  DinerNotificationKind,
  DinerNotificationPage,
  KnownDinerNotificationKind,
  MarkNotificationsReadCommand,
  NotificationPageQuery,
  NotificationParams,
} from './contracts/notifications';
export {
  ANONYMOUS_AUTHOR,
  MAX_MODERATION_TEXT,
  MAX_REVIEW_REPLY,
  REVIEW_MODERATION_FILTERS,
  REVIEW_REPORT_REASONS,
  REVIEW_VISIT_WINDOW_DAYS,
  publicAuthorName,
  publicReplyAuthorName,
  summariseReviews,
} from './contracts/reviews';
export type {
  ModeratedReview,
  ModeratedReviewPage,
  PublicReviewReply,
  ReplyAuthorRole,
  ReportReviewCommand,
  ReviewModerationFilter,
  ReviewReply,
  ReviewReportReason,
  ReviewSummary,
  SetReviewVisibilityCommand,
  VenueModeratedReview,
  VenueReviewQuery,
} from './contracts/reviews';
export type { BranchReadiness } from './contracts/readiness';
export {
  BookingNotChangeableError,
  ReservationNotStartedError,
  BookingLinkAccountUnavailableError,
  BookingsNotAcceptedError,
  CannotReportOwnReviewError,
  FloorPlanChangedError,
  RelocationNotAllowedError,
  ReviewHiddenByPlatformError,
  ReviewHiddenNoReplyError,
  ReviewNeedsVisitError,
  TooManyFavoritesError,
} from './contracts/errors';
export { createMockReviewStore } from './mocks/reviewStore';
export type {
  HiddenBy,
  MockReviewStore,
  MockReviewStoreOptions,
  StoredReport,
  StoredReview,
} from './mocks/reviewStore';

export { isKnownUnavailableReason, KNOWN_UNAVAILABLE_REASONS } from './contracts/booking';

export { OPEN_ENDED_BUCKET, REPORT_MAX_DAYS, REPORT_SECTIONS } from './contracts/reports';

export {
  assignableRoles,
  branchBindingFor,
  canChooseBranch,
  canEditStaff,
  canSetStaffPin,
  canIssueSignIn,
  isAdminRole,
  outranks,
  SHIFT_HORIZON_DAYS,
  SHIFT_MAX_MINUTES,
} from './contracts/staff';
export type {
  BranchBinding,
  BranchShifts,
  CreateStaffInput,
  EnrolmentCode,
  PhonePairingCode,
  ShiftInput,
  StaffDevice,
  StaffDeviceBrowser,
  StaffDevicePerson,
  StaffDevicePlatform,
  StaffMember,
  StaffActorRef,
  StaffShift,
  StaffSignInLink,
  UpdateStaffInput,
} from './contracts/staff';
export type {
  AdjustmentLine,
  Compared,
  DailyRevenue,
  DurationBucket,
  HourBucket,
  HourlyRevenue,
  LeadTimeBucket,
  MenuItemPerformance,
  MenuReport,
  OccupancyReport,
  ReportExport,
  ReportQuery,
  ReportScope,
  ReportSection,
  ReservationReport,
  RevenueReport,
  StaffReport,
  TurnTimeDistribution,
  VoidLine,
  WeekdayBucket,
} from './contracts/reports';

export {
  BOOKING_OVERLAPS_OWN_CODE,
  BookingBusyError,
  BookingCommandInUseError,
  BookingOverlapsOwnError,
  BookingRejectedError,
  BranchUnavailableError,
  EndpointNotWiredError,
  ExpiredCodeError,
  ExtensionsNotOfferedError,
  FreeByRequiredError,
  HoldNotActiveError,
  HostCannotLeaveError,
  InviteExpiredError,
  ServiceRequestRateLimitedError,
  TabAccessEndedError,
  TabsNotEnabledError,
  BookingEndedError,
  BookingNotActiveError,
  BookingNotFoundError,
  BookingTableOccupiedError,
  BookingTooEarlyError,
  isTabAccessEnded,
  LeadTimeExceededError,
  NotTabHostError,
  RateLimitedError,
  TabClosedError,
  TableOutOfServiceError,
  TableRequestClosedError,
  SmsUnavailableError,
  TableTakenError,
  TelegramUnavailableError,
  TooManyAttemptsError,
  UnknownTableCodeError,
  WrongCodeError,
  isBookingOverlapsOwn,
  isEndpointNotWired,
  isFreeByRequired,
  isTableTaken,
} from './contracts/errors';

// --- Diner accounts ---------------------------------------------------------
export type {
  DeleteDinerAccountCommand,
  DinerPhotoFile,
  DinerProfileView,
  DinerSignInResult,
  LoginDinerCommand,
  NativeFile,
  RegisterDinerCommand,
  SetDinerPasswordCommand,
  UpdateDinerProfileCommand,
} from './contracts/dinerAccount';
export {
  EmailTakenError,
  InvalidCredentialsError,
  PhoneInUseError,
  PhoneNotVerifiedError,
  isPhoneNotVerified,
  UsernameTakenError,
  isAccountTaken,
  isInvalidCredentials,
} from './contracts/errors';
export { SEEDED_ACCOUNT as MOCK_DINER_ACCOUNT } from './mocks/accounts';

// --- Rules the phone app and the public web page both run --------------------
export {
  approvalCopy,
  availabilityWindowCopy,
  bookingFailure,
  declinedCopy,
  freeByQuestion,
  freeCancellationCopy,
  mustFreeByCopy,
  nextHalfHour,
  promisedFreeByCopy,
  tableCopy,
  tableRequestCopy,
  unavailableCopy,
  venueAnswerCopy,
  pendingReasonCopy,
  overlapIsElsewhere,
  overlapPlace,
  verificationFailureCopy,
} from './contracts/reservation';
export type {
  AvailabilityWindowCopy,
  BookingFailure,
  BookingFailureOptions,
  BookingPlace,
  CopyLine,
  TableCopy,
  VenueAnswerState,
} from './contracts/reservation';

// --- The public branch page ---------------------------------------------------
export type { PublicGateway } from './publicGateway';
export { resolvePublicGateway } from './resolvePublicGateway';
export type { ResolvePublicGatewayOptions } from './resolvePublicGateway';
export { createPublicMockGateway, manageTokenFor } from './mocks/publicMock';
export type { PublicMockOptions } from './mocks/publicMock';
export { createPublicHttpGateway } from './http/publicHttpGateway';
export { coversSitting, openStateFrom } from './contracts/openState';
export type {
  ManagedBooking,
  RescheduleManagedBookingCommand,
  OpenState,
  PublicBranch,
  PublicBranchCard,
  PublicBranchStatus,
  PublicPageMeta,
  PublicPhoto,
  PublicRoom,
  PublicVenue,
  PublicVenueHeader,
} from './contracts/publicBranch';

// --- Scanning in and the shared tab -----------------------------------------
export type {
  JoinTabCommand,
  OpenTabByBookingCommand,
  ScanResult,
  ScanTableCommand,
  TabInvite,
  TabParticipantChange,
  TabParticipant,
  TabParticipantRole,
  TabParticipantStatus,
  TabPermissions,
  TabStatus,
  TableTab,
  WaiterCall,
  WaiterCallReason,
} from './contracts/tab';
export { WAITER_CALL_REASONS } from './contracts/tab';

export {
  DEFAULT_TAB_PERMISSIONS,
  HOST_TAB_PERMISSIONS,
  isValidTabPermissions,
  normalizeTabPermissions,
  setTabPermission,
  togglePullsAlong,
} from './contracts/permissions';
export type { TabPermissionKey } from './contracts/permissions';

export { extractScannedCode, parseScannedCode } from './contracts/scanCode';
export type { ScannedCode } from './contracts/scanCode';

// --- Notifications -----------------------------------------------------------
export { actionIsLive, canExtendHold } from './contracts/push';
export type {
  CancelReservationCommand,
  DevicePlatform,
  ExtendHoldCommand,
  ExtendHoldOutcome,
  RegisterPushDeviceCommand,
  ReservationState,
  ReservationStatusCode,
} from './contracts/push';
export { HoldAlreadyExtendedError, isHoldAlreadyExtended } from './contracts/errors';

export type { Menu, MenuItem, MenuSection } from './contracts/menu';

/**
 * Development affordance only.
 *
 * The printed code for a mock table, so the manual-entry fallback can be walked
 * without a printer. Callers must gate on `__DEV__` and on the mock data
 * source; see the scan screen.
 */
export { formatTableCode, mockTableCode, normalizeTableCode } from './mocks/tableCodes';
export { MOCK_DEMO_TABLES } from './mocks/demoTables';
export type { MockDemoTable } from './mocks/demoTables';

export {
  venueFreeTables,
  venueAvailability,
  branchAvailability,
  isBranchOpenNow,
  isVenueOpenNow,
  findBranchIn,
} from './contracts/helpers';
export type { Availability } from './contracts/helpers';

// --- The web console --------------------------------------------------------
export type { ConsoleGateway } from './consoleGateway';
export { resolveConsoleGateway } from './resolveConsoleGateway';
export type { ResolveConsoleGatewayOptions } from './resolveConsoleGateway';
export {
  createConsoleMockGateway,
  MOCK_PLATFORM_PASSWORD,
  MOCK_VENUE_PASSWORD,
} from './mocks/consoleMock';
export type { ConsoleMockOptions } from './mocks/consoleMock';
export { createConsoleHttpGateway, createMemoryIdentityStore } from './http/consoleHttpGateway';
export type { ConsoleHttpGatewayOptions, ConsoleIdentityStore } from './http/consoleHttpGateway';

export type {
  AddBranchCommand,
  BookingStatusCounts,
  BookingSummaryDays,
  BranchBookingsSummary,
  ConsoleBranch,
  ConsoleStaffMember,
  ConsoleUser,
  ConsoleVenue,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  ManagedBranch,
  ManagedVenue,
  Page,
  StaffRole,
  UpdateVenueCommand,
  UserRole,
  UserScope,
  VenueBookingsSummary,
  VenueBranchFeatures,
  VenueReadinessIssue,
  VenueStatus,
} from './contracts/console';
export { BOOKING_SUMMARY_DAYS, USER_ROLES } from './contracts/console';
export type {
  BranchFeature,
  BranchFeaturePreset,
  VenueFeatureSummary,
} from './contracts/branchFeatures';
export {
  BASIC_FEATURES,
  BRANCH_FEATURES,
  FULL_FEATURES,
  PRE_ORDER_NEEDS,
  featurePreset,
  hasFeature,
  preOrdersWithoutBookings,
  sameFeatures,
  sortFeatures,
  venueFeatureSummary,
} from './contracts/branchFeatures';
export {
  FEATURE_NOT_ENABLED_CODE,
  FeatureNotEnabledError,
  blockedFeature,
  isFeatureNotEnabled,
} from './contracts/errors';
export type {
  ChangePlatformPasswordCommand,
  DailyBookings,
  NotReadyBranch,
  OutboxCounts,
  OutboxDeadLetter,
  OutboxHealth,
  OverviewBookings,
  PlatformActivityEntry,
  PlatformActivityQuery,
  PlatformAdminProfile,
  PlatformOverview,
  PlatformPasswordChanged,
  RecentVenue,
  VenueCount,
  VenueCounter,
} from './contracts/platformHome';
export { PLATFORM_NAME_MAX_LENGTH, PLATFORM_PASSWORD_MIN_LENGTH } from './contracts/platformHome';
export type { OtherSessionsEnded, VenueSession, VenueStaffProfile } from './contracts/venueAccount';
export { listAllConsoleVenues, venueFeatures } from './platformVenues';
export type { BranchPublicProfile, BranchPublicProfileInput } from './contracts/publicProfile';
export type { AmenityKey, VenueListing, VenueListingInput } from './contracts/listing';
export { AMENITY_KEYS, MAX_DISTRICT_LENGTH, MAX_GALLERY_PHOTOS } from './contracts/listing';
export type {
  ApprovalCountdown,
  ApprovalTrigger,
  AwaitingApproval,
  ConsoleBooking,
  CurrentSittingContext,
  DecideReservationCommand,
  DeclineReason,
  NextBookingContext,
  PreviousBookingContext,
} from './contracts/approvals';
export {
  APPROVAL_EXPIRED_CODE,
  APPROVAL_POLL_MS,
  APPROVAL_URGENT_SECONDS,
  APPROVAL_WINDOW_MINUTES,
  EARLIER_GUEST_WINDOW_MINUTES,
  MIN_LEAD_MINUTES,
  NEXT_BOOKING_GAP_MINUTES,
  REQUESTABLE_WITHIN_MINUTES,
  SHORT_NOTICE_HOURS,
  SLOT_STEP_MINUTES,
  TABLE_BLOCK_MINUTES,
  TABLE_BUFFER_MINUTES,
  approvalCountdown,
  awaitsVenueAnswer,
  earlierGuestFreeByUtc,
  isApprovalExpired,
  isShortNotice,
  waitsOnEarlierGuestInApp,
} from './contracts/approvals';
export type {
  BranchOverview,
  ConsoleBookingActionCommand,
  ConsoleBookingActionKind,
  ConsoleBookingActionResult,
  OverviewBooking,
  OverviewBookingCounts,
  OverviewHours,
  OverviewInRoom,
  OverviewLoad,
  OverviewLoadHour,
  OverviewOpenTabs,
  OverviewRevenue,
  OverviewRowState,
  ReservationChannel,
} from './contracts/branchOverview';
export { STATUS_AFTER, minutesLate, overviewRowState } from './contracts/branchOverview';

export {
  BranchNotReadyError,
  FloorPlanInvalidError,
  OutOfScopeError,
  SlugTakenError,
  ReportRangeTooLongError,
  StaffPermissionError,
  SignInUnknownError,
  StaffPinTakenError,
  VenueDeletionBlockedError,
  isFloorPlanInvalid,
} from './contracts/errors';

// --- The menu editor, opening hours and the reservation policy ---------------
export type { PhotoUpload } from './consoleGateway';
export {
  ALLERGEN_PRESETS,
  EMPTY_DRAFT,
  REQUIRED_MENU_ITEM_FIELDS,
  allergenText,
  duplicateDraft,
  incompleteCount,
  isComplete,
  itemToDraft,
  menuItemGaps,
  parseAllergens,
  NO_ALLERGENS,
  listsNoAllergens,
  reorder,
  splitList,
  storedItemGaps,
} from './contracts/menuAdmin';
export type {
  AdminMenuCategory,
  AdminMenuItem,
  AllergenPreset,
  CreateMenuItemInput,
  DisplayOrderChange,
  MenuItemDeletion,
  MenuItemDraft,
  MenuItemField,
  Photo,
  UpdateMenuItemInput,
} from './contracts/menuAdmin';

export {
  POLICY_BOUNDS,
  SPECIAL_DAY_HORIZON_DAYS,
  SPECIAL_DAY_NOTE_MAX,
  WEEK_ORDER,
  blockMinutes,
  blocksOnDate,
  closesNextDay,
  defaultPolicyFor,
  specialDayOn,
  toClock,
  toMinutes,
} from './contracts/branchSettings';
export type {
  BoundedPolicyField,
  HoursBlock,
  HoursDay,
  PolicyChangeResult,
  PolicyFieldBound,
  ReservationPolicy,
  ReservationPolicyDefaults,
  SpecialDay,
  SpecialDaysList,
  SpecialDaysSaved,
  WeekdayIndex,
  WeeklyHours,
} from './contracts/branchSettings';

export {
  CategoryInUseError,
  OverlappingHoursError,
  PolicyBoundsError,
  UnsupportedImageError,
  isPolicyBounds,
  isUnsupportedImage,
} from './contracts/errors';
export type { UnsupportedImageReason } from './contracts/errors';

export type {
  EditorFloorArea,
  EditorFloorPlan,
  EditorFloorTable,
  EditorTablePin,
  EditorTableStatus,
  FloorPlanSaveResult,
  ReplaceFloorAreaInput,
  ReplaceFloorPlanCommand,
  ReplaceFloorTableInput,
  TableDeletionResult,
} from './contracts/floorPlan';
export { MAX_ROOM_PHOTOS } from './contracts/floorPlan';

// --- The counter screen ------------------------------------------------------
export type {
  ReleaseOutcome,
  ReleaseReservationCommand,
  ReservationReleaseResult,
  UndoNoShowCommand,
  UndoNoShowResult,
  StaffGateway,
} from './staffGateway';
export { resolveStaffGateway } from './resolveStaffGateway';
export type { ResolveStaffGatewayOptions } from './resolveStaffGateway';
export { STAFF_NOTIFICATION_KINDS } from './contracts/staffPhone';
export type {
  SaveStaffNotificationSettings,
  StaffNotificationKind,
  StaffNotificationSettings,
  StaffNotificationSwitches,
  StaffPushConfig,
  StaffPushPayload,
  StaffPushSubscriptionInput,
  StaffToday,
  StaffTodayShift,
} from './contracts/staffPhone';
export { createStaffMockGateway } from './mocks/staffMock';
export type { StaffMockOptions } from './mocks/staffMock';
export { createStaffHttpGateway } from './http/staffHttpGateway';
export { tableConflictFrom } from './http/staffMapping';

// --- Signing a tablet in, and a person in on it ------------------------------
export { createStaffAuth } from './auth/staffEndpoints';
export type { StaffAuth } from './auth/staffEndpoints';
export { createStaffSession } from './auth/staffSession';
export type {
  StaffSession,
  StaffSessionConfig,
  StaffSessionSnapshot,
  StaffSessionState,
} from './auth/staffSession';
export type {
  BoundStaffMember,
  DeviceEnrolment,
  EnrolDeviceCommand,
  EnrolledDevice,
  PairPhoneCommand,
  PhonePairing,
  PhonePairingPreview,
  PinSignInCommand,
  StaffDeviceKind,
  StaffCredentialStorage,
  StaffRosterEntry,
  StaffRosterShift,
  StaffSessionIdentity,
  StaffSessionTokens,
  StaffSignInResult,
  StaffSignOutReason,
} from './contracts/staffAuth';
export {
  ENROLMENT_CODE_ALPHABET,
  ENROLMENT_CODE_LENGTH,
  PHONE_PAIRING_MINUTES,
  PHONE_PAIRING_PATH,
  formatPairingCode,
  isOnShiftAt,
  isPhoneDevice,
  normalizeEnrolmentCode,
  pairingCodeFrom,
} from './contracts/staffAuth';
export {
  createStaffRosterMock,
  mockRosterShiftsAround,
  mockStaffRoster,
} from './mocks/staffRosterMock';
export type {
  MockRosterDevice,
  MockRosterShift,
  MockRosterShifts,
  StaffRosterMockOptions,
} from './mocks/staffRosterMock';
export {
  DeviceRevokedError,
  EnrolmentCodeExpiredError,
  EnrolmentCodeSpentError,
  KitchenPhoneNotAllowedError,
  PairingCodeExpiredError,
  PairingCodeInvalidError,
  PairingCodeUnusableError,
  LineAlreadyPaidError,
  MenuItemUnavailableError,
  OrderGuestUnavailableError,
  OrderNotVoidableError,
  PaymentExceedsRemainingError,
  PinLockedError,
  PinRejectedError,
  TabNotAcceptingOrdersError,
  TableNotSeatedError,
  isDeviceRevoked,
  isPaymentExceedsRemaining,
  isPinLocked,
  type OrderGuestState,
  type TabNotAcceptingStatus,
} from './contracts/errors';

// Shapes the shipped OpenAPI document describes.
export { SETTLEMENT_MODES, tableDetail } from './contracts/service';
export type {
  AffectedReservation,
  PreconditionFailure,
  SettlementMode,
  StaffFloor,
  StaffTabStatus,
  StaffTableDetail,
  TabParticipantStaffStatus,
  TabStaffParticipant,
  TabTotals,
  TableActionCommand,
  TableActionKind,
  TableActionResult,
  TableConflictState,
  TablePrecondition,
  TableStatus,
  TableWarning,
  TableWarningCode,
} from './contracts/service';

// Ordering, the bill and the two streams. No longer guesses: every shape is
// built from the generated schema by `http/staffMapping.ts`.
export {
  BILL_SCOPES,
  MAX_TIP_PERCENT,
  ORDER_STATUS_FLOW,
  SERVICE_REQUEST_REASONS,
  SPICE_LEVELS,
  VOID_REASONS,
  nextOrderStatus,
} from './contracts/ordering';
export type {
  AbandonTabCommand,
  AbandonTabResult,
  AcknowledgeServiceRequestCommand,
  AdjustmentKind,
  BillRequest,
  BillRequestInput,
  BillScope,
  BranchMenu,
  CallWaiterCommand,
  CompCommand,
  DinerTabAdjustment,
  DinerTabLine,
  DinerTabMe,
  DinerTabView,
  FloorChange,
  FloorChangePage,
  MenuCategoryView,
  MenuItemDetail,
  OrderLineStatus,
  OrderQueueEntry,
  OrderQueueLine,
  OrderStatus,
  ParticipantShare,
  PaymentResult,
  PlaceOrderCommand,
  OpenTabForStaffCommand,
  ReassignHostCommand,
  TabParticipantStatusCode,
  PlaceOrderLine,
  PlaceOrderResult,
  RecordCashPaymentCommand,
  ServiceRequest,
  ServiceRequestReason,
  SetOrderStatusCommand,
  SetSettlementModeCommand,
  SpiceLevel,
  StaffTab,
  TabAdjustment,
  TabBill,
  TabRosterEntry,
  TabEvent,
  TabEventActor,
  TabEventPage,
  TabEventType,
  TabLine,
  TabMoney,
  TabShares,
  VoidLineCommand,
  VoidOrderCommand,
  VoidReason,
} from './contracts/ordering';

export { slugify } from './slug';

// Tab admission (2026-10-20): tabs a waiter lets order.
export { ADMITTED, REJECT_TAB_REASON_MAX, isAwaitingAdmission } from './contracts/admission';
export type {
  AdmitTabCommand,
  FloorChangeSignal,
  RejectTabCommand,
  TabAdmission,
  TabAdmissionReason,
  TabAdmissionStatus,
  TabAwaitingAdmission,
} from './contracts/admission';
export {
  BOOKING_BLOCKED_NO_SHOWS_CODE,
  BookingBlockedNoShowsError,
  PHONE_HAS_ACTIVE_BOOKING_CODE,
  PhoneHasActiveBookingError,
  TAB_ADMISSION_DECIDED_CODE,
  TAB_AWAITING_ADMISSION_CODE,
  TabAdmissionDecidedError,
  TabAwaitingAdmissionError,
  SCAN_TURNED_AWAY_CODE,
  ScanTurnedAwayError,
  isBookingBlockedNoShows,
  isScanTurnedAway,
  isPhoneHasActiveBooking,
  isTabAdmissionDecided,
  isTabAwaitingAdmission,
  type HeldBooking,
} from './contracts/errors';

// The guest record (2026-10-20): what venues see of how a guest kept their
// bookings, the number rules, and the no-show block.
export {
  GOOD_RECORD_MIN_CAME,
  LIFT_REASON_MAX,
  LIFT_REASON_MIN,
  MAX_ACTIVE_BOOKINGS_PER_NUMBER,
  NEW_GUEST_RECORD,
  NO_SHOW_BLOCK,
  NO_SHOW_UNDO_UNTIL_HOUR,
  OTHER_VENUE_GAP_MINUTES,
  guestRecordStanding,
  hasGoodRecord,
  hasTakeawayNoShows,
  isBookingBlocked,
  noShowUndoableUntil,
} from './contracts/guestRecord';
export type {
  BookingBlock,
  CancellationCause,
  GuestRecord,
  GuestRecordStanding,
  LiftBookingBlockCommand,
} from './contracts/guestRecord';
export {
  NO_SHOW_UNDO_WINDOW_CLOSED_CODE,
  NoShowUndoWindowClosedError,
  isNoShowUndoWindowClosed,
  RESERVATION_CANCELLED_BY_BLOCK_CODE,
  ReservationCancelledByBlockError,
  isReservationCancelledByBlock,
} from './contracts/errors';

// Pre-orders on a booking (2026-10-21): the guest's dishes ahead, "on my
// way", the floor's rail and Send to kitchen, the console's settings.
export {
  DEFAULT_PRE_ORDER_SETTINGS,
  ON_YOUR_WAY_FEED_KIND,
  ON_YOUR_WAY_MINUTES_BEFORE,
  ON_YOUR_WAY_MINUTES_BEFORE_WITHOUT_PRE_ORDER,
  ON_YOUR_WAY_PUSH_ACTIONS,
  ON_YOUR_WAY_PUSH_CATEGORY,
  ON_YOUR_WAY_PUSH_KIND,
  PRE_ORDER_EDITABLE_HOURS_BEFORE,
  PRE_ORDER_LIMITS,
  PRE_ORDER_MINUTES_BEFORE_DEFAULT,
  PRE_ORDER_MINUTES_BEFORE_MAX,
  PRE_ORDER_MINUTES_BEFORE_MIN,
  PRE_ORDER_RAIL_SIGNALS,
  asksOnYourWay,
  canClearPreOrder,
  canEditPreOrder,
  derivePreOrderState,
  draftFromPreOrder,
  draftQuantity,
  isPreOrderable,
  onYourWayFromUtc,
  onYourWayAskedFromUtc,
  preOrderWaiting,
  preOrderActionFailure,
  preOrderDraftViolations,
  preOrderDueAtUtc,
  preOrderFailure,
  preOrderLockedAtUtc,
  preOrderMenu,
  preOrderNote,
  readsPreOrderRail,
} from './contracts/preOrder';
export type {
  BookingPreOrderFields,
  ClearManagedPreOrderCommand,
  ClearPreOrderCommand,
  DuePreOrder,
  DuePreOrders,
  KitchenPreOrder,
  OnMyWayResult,
  OnYourWayInput,
  PreOrder,
  PreOrderActionFailure,
  PreOrderDraft,
  PreOrderFailure,
  PreOrderLine,
  PreOrderLineInput,
  PreOrderResult,
  PreOrderSettings,
  PreOrderSettingsInput,
  PreOrderStaffCommand,
  PreOrderState,
  PreOrderStateInput,
  ReplaceManagedPreOrderCommand,
  ReplacePreOrderCommand,
} from './contracts/preOrder';
// The guest's editor and what a booking says about its pre-order: one copy for
// the diner app and the manage link.
export {
  addOne,
  addOneAt,
  canAddMore,
  canAddMoreAt,
  draftCommand,
  emptyDraft,
  isDirty,
  preOrderLimitLine,
  priceDraft,
  pricedLineText,
  quantityOf,
  rememberDishes,
  removeLine,
  removeOne,
  removeOneAt,
  setLineNote,
  setNote,
  startDraft,
} from './contracts/preOrderDraft';
export type {
  DraftLine,
  EditorDraft,
  PricedDraft,
  PricedLine,
  SeenDishes,
} from './contracts/preOrderDraft';
export {
  onMyWayFailureLine,
  onYourWayView,
  preOrderEditorClosedLine,
  preOrderStateTone,
  preOrderView,
} from './contracts/preOrderView';
export type { PreOrderViewState } from './contracts/preOrderView';
export {
  ON_MY_WAY_NOT_OPEN_CODE,
  OnMyWayNotOpenError,
  PRE_ORDER_ALREADY_SENT_CODE,
  PRE_ORDER_ITEMS_UNAVAILABLE_CODE,
  PRE_ORDER_LOCKED_CODE,
  PRE_ORDER_NOT_SENDABLE_CODE,
  PRE_ORDERS_NOT_ACCEPTED_CODE,
  PreOrderAlreadySentError,
  PreOrderItemsUnavailableError,
  PreOrderLockedError,
  PreOrderNotSendableError,
  PreOrdersNotAcceptedError,
  TABLE_LOCK_TIMEOUT_CODE,
  TableBusyError,
  isOnMyWayNotOpen,
  isPreOrderAlreadySent,
  isPreOrderItemsUnavailable,
  isPreOrderLocked,
  isPreOrderNotSendable,
  isPreOrdersNotAccepted,
  isTableBusy,
  type PreOrderItemUnavailableReason,
  type UnavailablePreOrderItem,
} from './contracts/errors';
export { MOCK_PRE_ORDER_BRANCHES, createMockPreOrderBook } from './mocks/preOrders';
export type { MockPreOrderBranch } from './mocks/preOrders';
export type { StaffPreOrderSeed, StaffTakeawaySeed } from './mocks/staffMock';

// "I'm coming" on a booking (2026-10-22): running late, the venue's ask, and
// the rules the booking screen and the tablet decide their buttons by.
export {
  ON_MY_WAY_WINDOW_HOURS,
  RUNNING_LATE_MINUTES,
  STAFF_ASK_INTERVAL_MINUTES,
  askOnMyWayBlock,
  canAnswerOnMyWay,
  guestAnswered,
  guestAnsweredAtUtc,
  isRunningLateMinutes,
  onMyWayOpensAtUtc,
  venueIsAsking,
} from './contracts/onMyWay';
export type {
  AskOnMyWayBlock,
  AskOnMyWayInput,
  AskOnMyWayResult,
  BookingAnswerFields,
  OnMyWayAnswerInput,
  ReportManagedRunningLateCommand,
  ReportRunningLateCommand,
  RunningLateMinutes,
  RunningLateResult,
} from './contracts/onMyWay';
export {
  ASK_ON_MY_WAY_ASKED_RECENTLY_CODE,
  ASK_ON_MY_WAY_NOT_OPEN_CODE,
  ASK_ON_MY_WAY_TOO_EARLY_CODE,
  AskOnMyWayAskedRecentlyError,
  AskOnMyWayNotOpenError,
  AskOnMyWayTooEarlyError,
  GUEST_ALREADY_ANSWERED_CODE,
  GuestAlreadyAnsweredError,
  isAskOnMyWayAskedRecently,
  isAskOnMyWayNotOpen,
  isAskOnMyWayTooEarly,
  isGuestAlreadyAnswered,
} from './contracts/errors';

// Takeaway (2026-10-22): order from the menu, pick up and pay at the counter.
export {
  DEFAULT_TAKEAWAY_SETTINGS,
  NO_TAKEAWAY,
  TAKEAWAY_ACCEPT_WINDOW_MINUTES,
  TAKEAWAY_FEED_KINDS,
  TAKEAWAY_LIMITS,
  TAKEAWAY_NO_SHOW_AFTER_MINUTES,
  TAKEAWAY_PUSH_KINDS,
  TAKEAWAY_READY_STEP_MINUTES,
  TAKEAWAY_SETTINGS_BOUNDS,
  TAKEAWAY_SLOT_STEP_MINUTES,
  canMarkTakeawayNoShow,
  defaultTakeawayReadyAtUtc,
  isTakeawayActive,
  isTakeawayInProgress,
  isTakeawayNotificationKind,
  isTakeawayable,
  readsTakeawayCounter,
  stepTakeawayReadyAtUtc,
  takeawayItemCount,
  takeawayNoShowFromUtc,
  takeawayNote,
  takeawayOrderViolations,
  takeawaySettingsViolations,
} from './contracts/takeaway';
export type {
  AcceptTakeawayOrderCommand,
  BranchTakeawayOrders,
  CollectTakeawayOrderCommand,
  DeclineTakeawayOrderCommand,
  DinerTakeawaySummary,
  KitchenTakeaway,
  PlaceTakeawayOrderCommand,
  PublicTakeawayInfo,
  StaffTakeawayOrder,
  TakeawayAvailability,
  TakeawayDeclineCause,
  TakeawayFeedKind,
  TakeawayLine,
  TakeawayLineInput,
  TakeawayOrder,
  TakeawayPaymentMethod,
  TakeawayPickup,
  TakeawaySettings,
  TakeawaySettingsBounds,
  TakeawaySettingsInput,
  TakeawayStatus,
} from './contracts/takeaway';
export {
  TAKEAWAY_BUSY_CODE,
  TAKEAWAY_CLOSED_CODE,
  TAKEAWAY_ITEMS_UNAVAILABLE_CODE,
  TAKEAWAY_NOT_ACCEPTED_CODE,
  TAKEAWAY_NO_SHOW_TOO_EARLY_CODE,
  TAKEAWAY_SLOT_UNAVAILABLE_CODE,
  TAKEAWAY_STATUS_CONFLICT_CODE,
  TakeawayBusyError,
  TakeawayClosedError,
  TakeawayItemsUnavailableError,
  TakeawayNoShowTooEarlyError,
  TakeawayNotAcceptedError,
  TakeawaySlotUnavailableError,
  TakeawayStatusConflictError,
  isTakeawayBusy,
  isTakeawayClosed,
  isTakeawayItemsUnavailable,
  isTakeawayNoShowTooEarly,
  isTakeawayNotAccepted,
  isTakeawaySlotUnavailable,
  isTakeawayStatusConflict,
  type TakeawayItemUnavailableReason,
  type UnavailableTakeawayItem,
} from './contracts/errors';
export { MOCK_TAKEAWAY_BRANCHES, createMockTakeawayBook } from './mocks/takeaway';
export type { MockTakeawayBranch, MockTakeawayPlace } from './mocks/takeaway';

// Guest messages (2026-10-23): a venue and a guest write inside one booking or one takeaway order.
export {
  CONVERSATION_OPEN_AFTER_HOURS,
  CONVERSATION_READABLE_DAYS,
  DEFAULT_MESSAGE_SETTINGS,
  GUEST_MESSAGES_PER_CONVERSATION,
  GUEST_MESSAGES_PER_MINUTE,
  MESSAGE_MAX_LENGTH,
  MESSAGE_SETTINGS_LIMITS,
  STAFF_LIST_RECENT_HOURS,
  VENUE_ASK_BUTTONS_PUSH_CATEGORY,
  VENUE_ASK_PUSH_CATEGORY,
  VENUE_MESSAGE_FEED_KIND,
  VENUE_MESSAGE_PUSH_CATEGORIES,
  VENUE_MESSAGE_PUSH_CATEGORY,
  VENUE_MESSAGE_PUSH_KIND,
  VENUE_MESSAGE_READONLY_PUSH_CATEGORY,
  compareConversationItems,
  conversationClosesAtUtc,
  filterConversations,
  hasUnansweredAsk,
  isConversationOpen,
  isConversationReadable,
  isVenueMessageNotificationKind,
  messageSettingsViolations,
  messageText,
  messageViolations,
  needsReminder,
  newestShownMessageUtc,
  normalizeMessageTemplates,
  sameSubject,
  seenByGuest,
  seenByVenue,
  staffMayWrite,
  venueMessageFeedSubject,
  venueMessagePushTarget,
} from './contracts/messages';
export type {
  BranchConversations,
  ConversationFilter,
  ConversationMessage,
  ConversationSubject,
  ConversationSubjectKind,
  ConversationSubjectRef,
  ConversationSummary,
  DinerConversation,
  DinerUnreadMessages,
  FloorMessages,
  MarkConversationReadCommand,
  MessageAnswer,
  MessageAnswerKind,
  MessageAuthor,
  MessageKind,
  MessageSettings,
  MessageSettingsInput,
  MessageStatus,
  MessageWriterRole,
  SendMessageCommand,
  SentMessage,
  StaffConversation,
  StaffConversationLastMessage,
  StaffConversationListItem,
  StaffConversationSubject,
  StaffConversationThreadSubject,
  UnreadConversation,
} from './contracts/messages';
// Message history (2026-10-24): every guest thread of a branch, in the console, read only.
export {
  MESSAGE_HISTORY_DEFAULT_DAYS,
  MESSAGE_HISTORY_KEPT_DAYS,
  MESSAGE_HISTORY_KINDS,
  MESSAGE_HISTORY_MAX_RANGE_DAYS,
  MESSAGE_HISTORY_PAGE_MAX,
  MESSAGE_HISTORY_PAGE_SIZE,
  MESSAGE_HISTORY_QUERY_MAX,
  addLocalDays,
  compareHistoryItems,
  defaultHistoryFrom,
  defaultMessageHistoryFilters,
  historySearchText,
  isLocalDate,
  localDaysBetween,
  matchesHistorySearch,
  messageHistoryRange,
  messageHistoryViolations,
  oldestHistoryDate,
} from './contracts/messageHistory';
export type {
  ConversationOutcome,
  MessageHistoryFilters,
  MessageHistoryItem,
  MessageHistoryKind,
  MessageHistoryPage,
  MessageHistoryQuery,
  MessageHistorySubject,
} from './contracts/messageHistory';
export {
  CONVERSATION_CLOSED_CODE,
  ConversationClosedError,
  GUESTS_CANNOT_WRITE_CODE,
  GuestsCannotWriteError,
  MESSAGES_TOO_FAST_CODE,
  MessagesTooFastError,
  WAITERS_CANNOT_WRITE_CODE,
  WaitersCannotWriteError,
  isConversationClosed,
  isGuestsCannotWrite,
  isMessagesTooFast,
  isWaitersCannotWrite,
} from './contracts/errors';
export { messageFailure } from './contracts/messageFailure';
export type { MessageFailure } from './contracts/messageFailure';
export { createMockConversationBook } from './mocks/messages';
export type {
  MockConversationBook,
  MockConversationSubjectInfo,
  MockSeedMessage,
} from './mocks/messages';
export {
  ACTIVITY_ACTIONS,
  ACTIVITY_CATEGORIES,
  ACTIVITY_KEPT_DAYS,
  ACTIVITY_MONEY_KEPT_DAYS,
  ACTIVITY_PAGE_MAX,
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_QUERY_MAX,
  ACTIVITY_TIMELINE_SUBJECTS,
  PERFORMANCE_PERIODS,
  SERVING_ROLES,
  STAFF_RECENT_LISTS,
  STAFF_RECENT_PAGE_SIZE,
  TAB_NOT_TRANSFERABLE_CODE,
  TRANSFER_TARGET_INELIGIBLE_CODE,
  activitySearchText,
  activityViolations,
  compareActivityEntries,
  defaultActivityFilters,
  hasTimeline,
  isKnownActivityAction,
  matchesActivitySearch,
  medianSeconds,
  oldestActivityDate,
  performanceRange,
  timelineLinesAmd,
  timelineSubjectOf,
  transferRefusalOf,
} from './contracts/activity';
export type {
  ActivityAction,
  ActivityActor,
  ActivityActorKind,
  ActivityBookingHeader,
  ActivityCategory,
  ActivityCategoryFilter,
  ActivityDevice,
  ActivityDeviceKind,
  ActivityEntry,
  ActivityFilters,
  ActivityLine,
  ActivityPage,
  ActivityParams,
  ActivityPerson,
  ActivityQuery,
  ActivityServerTurn,
  ActivitySubject,
  ActivitySubjectType,
  ActivityTabHeader,
  ActivityTabStatus,
  ActivityTakeawayHeader,
  ActivityTimeline,
  ActivityTimelineLine,
  ActivityValue,
  ActivityWho,
  ClaimServiceRequestCommand,
  DailySales,
  MyPerformanceQuery,
  MyResults,
  MyResultsQuery,
  PerformanceFigures,
  PerformancePeriod,
  PerformanceRange,
  StaffMemberPerformance,
  StaffPerformance,
  StaffPerformanceRow,
  StaffPerformanceTotals,
  StaffRecentList,
  StaffRecentPage,
  StaffRecentQuery,
  TabTransferResult,
  TabTransferTarget,
  TransferIneligibleReason,
  TransferTabCommand,
} from './contracts/activity';
export { createMockActivity } from './mocks/activity';
export type { MockActivity, MockActivityOptions } from './mocks/activity';
