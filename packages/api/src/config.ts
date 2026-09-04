/**
 * Where the backend lives.
 *
 * Each app reads its own env var (Expo needs the `EXPO_PUBLIC_` prefix, Vite
 * needs `VITE_`) and passes the result in, so this package stays free of any
 * bundler-specific `import.meta` or `process.env` access.
 */
export interface ApiConfig {
  readonly baseUrl: string;
  /** Swagger/OpenAPI document, used by `pnpm api:generate`. */
  readonly openApiUrl: string;
}

/** ASP.NET Core's default HTTPS dev port for the Yalla backend. */
export const LOCAL_BACKEND_URL = 'https://localhost:7188';

export function resolveApiConfig(baseUrl: string | undefined | null): ApiConfig {
  const resolved = baseUrl?.trim() || LOCAL_BACKEND_URL;
  const withoutTrailingSlash = resolved.replace(/\/+$/u, '');
  return {
    baseUrl: withoutTrailingSlash,
    openApiUrl: `${withoutTrailingSlash}/swagger/v1/swagger.json`,
  };
}
