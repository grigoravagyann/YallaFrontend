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
