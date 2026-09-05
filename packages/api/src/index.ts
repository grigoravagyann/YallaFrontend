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

export { OutOfScopeError, SlugTakenError, VenueHasOpenTabsError } from './contracts/errors';
export type { BlockingTab } from './contracts/errors';
