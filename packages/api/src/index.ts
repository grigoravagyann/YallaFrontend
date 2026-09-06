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
  TimeoutError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
  describeFailure,
  isConcurrencyConflict,
  isOffline,
  isRetryable,
} from './errors';
export type { FailureKind } from './errors';

export { parseProblem } from './problem';
export type { ProblemDetails } from './problem';

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
export { createAuthSession } from './auth/session';
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

export { createMockGateway } from './mocks/mockGateway';
export type { MockGatewayOptions } from './mocks/mockGateway';
export { createHttpGateway } from './http/httpGateway';
export type { GatewayAudience, HttpGatewayOptions } from './http/httpGateway';

export type {
  AvailabilityWindowDto,
  Booking,
  BookingStatus,
  BranchPolicy,
  BranchSummary,
  CreateBookingCommand,
  PhoneChallenge,
  TableAvailability,
  TableUnavailableReason,
  VenueSummary,
  VenueType,
  VerifiedPhone,
} from './contracts/booking';

export {
  EndpointNotWiredError,
  ExpiredCodeError,
  LeadTimeExceededError,
  NotTabHostError,
  RateLimitedError,
  TabClosedError,
  TableOutOfServiceError,
  TableTakenError,
  TooManyAttemptsError,
  UnknownTableCodeError,
  WrongCodeError,
  isEndpointNotWired,
  isTableTaken,
} from './contracts/errors';

// --- Rules the phone app and the public web page both run --------------------
export {
  approvalCopy,
  availabilityWindowCopy,
  bookingFailure,
  freeCancellationCopy,
  nextHalfHour,
  tableCopy,
  unavailableCopy,
  verificationFailureCopy,
} from './contracts/reservation';
export type {
  AvailabilityWindowCopy,
  BookingFailure,
  CopyLine,
  TableCopy,
} from './contracts/reservation';

// --- The public branch page ---------------------------------------------------
export type { PublicGateway } from './publicGateway';
export { resolvePublicGateway } from './resolvePublicGateway';
export type { ResolvePublicGatewayOptions } from './resolvePublicGateway';
export { createPublicMockGateway, manageTokenFor } from './mocks/publicMock';
export type { PublicMockOptions } from './mocks/publicMock';
export { createPublicHttpGateway } from './http/publicHttpGateway';
export { openStateFrom } from './mocks/openState';
export type {
  ManagedBooking,
  OpenState,
  PublicBranch,
  PublicBranchCard,
  PublicBranchStatus,
  PublicPageMeta,
  PublicPhoto,
  PublicVenue,
  PublicVenueHeader,
} from './contracts/publicBranch';

// --- Scanning in and the shared tab -----------------------------------------
export type {
  ScanResult,
  ScanTableCommand,
  TabInvite,
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

export { extractScannedCode } from './contracts/scanCode';

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
  venueTotalTables,
  isVenueFullyBooked,
  nearestBranch,
  isBranchOpenNow,
  isVenueOpenNow,
  findBranchIn,
} from './contracts/helpers';

// --- The web console --------------------------------------------------------
export type { ConsoleGateway } from './consoleGateway';
export { resolveConsoleGateway } from './resolveConsoleGateway';
export type { ResolveConsoleGatewayOptions } from './resolveConsoleGateway';
export { createConsoleMockGateway } from './mocks/consoleMock';
export type { ConsoleMockOptions } from './mocks/consoleMock';
export { createConsoleHttpGateway, createMemoryIdentityStore } from './http/consoleHttpGateway';
export type { ConsoleHttpGatewayOptions, ConsoleIdentityStore } from './http/consoleHttpGateway';

export type {
  ConsoleBranch,
  ConsoleStaffMember,
  ConsoleUser,
  ConsoleVenue,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  Page,
  StaffRole,
  SubscriptionTier,
  UserRole,
  UserScope,
  VenueStatus,
} from './contracts/console';
export { SUBSCRIPTION_TIERS, USER_ROLES } from './contracts/console';

export {
  FloorPlanInvalidError,
  OutOfScopeError,
  SlugTakenError,
  VenueHasOpenTabsError,
  isFloorPlanInvalid,
} from './contracts/errors';
export type { BlockingTab } from './contracts/errors';

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
  WEEK_ORDER,
  blockMinutes,
  closesNextDay,
  defaultPolicyFor,
  toClock,
  toMinutes,
} from './contracts/branchSettings';
export type {
  BoundedPolicyField,
  HoursBlock,
  HoursDay,
  PolicyChangeResult,
  ReservationPolicy,
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
  FloorPlanSaveResult,
  ReplaceFloorAreaInput,
  ReplaceFloorPlanCommand,
  ReplaceFloorTableInput,
  TableDeletionResult,
} from './contracts/floorPlan';

// --- The counter screen ------------------------------------------------------
export type {
  ReleaseOutcome,
  ReleaseReservationCommand,
  ReservationReleaseResult,
  StaffGateway,
} from './staffGateway';
export { resolveStaffGateway } from './resolveStaffGateway';
export type { ResolveStaffGatewayOptions } from './resolveStaffGateway';
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
  DeviceEnrolment,
  EnrolDeviceCommand,
  EnrolledDevice,
  PinSignInCommand,
  StaffCredentialStorage,
  StaffSessionIdentity,
  StaffSessionTokens,
  StaffSignInResult,
  StaffSignOutReason,
} from './contracts/staffAuth';
export {
  DeviceRevokedError,
  EnrolmentCodeSpentError,
  LineAlreadyPaidError,
  MenuItemUnavailableError,
  PaymentExceedsRemainingError,
  PinLockedError,
  PinRejectedError,
  TabNotAcceptingOrdersError,
  isDeviceRevoked,
  isPaymentExceedsRemaining,
  isPinLocked,
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
  BranchMenu,
  CallWaiterCommand,
  CompCommand,
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
  VoidReason,
} from './contracts/ordering';
