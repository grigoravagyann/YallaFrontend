export { ApiClient, createApiClient } from './client';
export type { ApiClientConfig, ApiResponse, RequestOptions, TokenGetter } from './client';

export {
  ApiError,
  AuthError,
  ConcurrencyConflictError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  ValidationError,
  isConcurrencyConflict,
  isRetryable,
} from './errors';

export { createQueryClient, staleTime } from './queryClient';
export type { CreateQueryClientOptions } from './queryClient';

export { resolveApiConfig, LOCAL_BACKEND_URL } from './config';
export type { ApiConfig } from './config';

// TanStack Query hooks land in a later task. This package currently ships the
// client, the typed errors and the query client factory only.
export type { paths, components, operations } from './generated/schema';

// --- Reservation flow -------------------------------------------------------
export type { YallaGateway } from './gateway';
export { resolveGateway, isUsingMockData } from './resolveGateway';
export type { ResolveGatewayOptions } from './resolveGateway';

export { createMockGateway } from './mocks/mockGateway';
export type { MockGatewayOptions } from './mocks/mockGateway';
export { createHttpGateway } from './http/httpGateway';

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
 * without a printer. Callers must gate on `__DEV__`; see the scan screen.
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
