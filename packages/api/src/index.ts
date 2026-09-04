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
  ExpiredCodeError,
  LeadTimeExceededError,
  RateLimitedError,
  TableTakenError,
  TooManyAttemptsError,
  WrongCodeError,
  isTableTaken,
} from './contracts/errors';

export {
  venueFreeTables,
  venueTotalTables,
  isVenueFullyBooked,
  nearestBranch,
  isBranchOpenNow,
  isVenueOpenNow,
  findBranchIn,
} from './contracts/helpers';
