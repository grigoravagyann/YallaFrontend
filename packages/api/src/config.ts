/**
 * Where the backend lives, and whether to talk to it at all.
 *
 * Each app reads its own env vars (Expo needs the `EXPO_PUBLIC_` prefix, Vite
 * needs `VITE_`) and passes the raw strings in, so this package stays free of
 * any bundler-specific `import.meta` or `process.env` access. What it does in
 * return is refuse to guess: a missing or malformed base URL throws at startup
 * with the variable's name and an example, because a silent `undefined` turns
 * into requests to `/api/...` on the wrong origin that fail in confusing ways.
 */

export type DataSource = 'mock' | 'real';

export interface ApiConfig {
  readonly baseUrl: string;
  /** Swagger/OpenAPI document, used by `pnpm api:generate`. */
  readonly openApiUrl: string;
}

/** The backend's plain-http development port. Plain http so a phone needs no certificate. */
export const DEFAULT_BACKEND_HTTP_PORT = 5086;

/** The backend's development origin when it runs on this machine. */
export const LOCAL_BACKEND_URL = `http://localhost:${DEFAULT_BACKEND_HTTP_PORT}`;

/** Thrown at startup. The message is the whole point; it names the variable to set. */
export class ApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigError';
  }
}

export interface ResolveApiConfigInput {
  /** The raw environment value, however the app read it. */
  readonly baseUrl: string | undefined | null;
  /** The variable's name, for the error message. */
  readonly envVar: string;
  /** A value that would work, for the error message. */
  readonly example: string;
}

export function resolveApiConfig(input: ResolveApiConfigInput): ApiConfig {
  const raw = input.baseUrl?.trim();

  if (!raw) {
    throw new ApiConfigError(
      `${input.envVar} is not set. It must be the backend origin, e.g. ${input.example}. ` +
        `Copy .env.example to .env and fill it in, or set the data source to "mock".`,
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiConfigError(
      `${input.envVar} is not a URL: "${raw}". It must be an origin such as ${input.example}.`,
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiConfigError(
      `${input.envVar} must start with http:// or https://, got "${raw}". Example: ${input.example}.`,
    );
  }
  if (url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new ApiConfigError(
      `${input.envVar} must be an origin with no path, query or fragment, got "${raw}". ` +
        `Example: ${input.example}.`,
    );
  }

  const baseUrl = url.origin;
  return { baseUrl, openApiUrl: `${baseUrl}/swagger/v1/swagger.json` };
}

/**
 * Which data source the flag selects. **Defaults to real.** Anything other than
 * `mock` or `real` is a typo, and a typo that silently picked one of them would
 * be debugged for an afternoon.
 */
export function resolveDataSource(raw: string | undefined | null, envVar: string): DataSource {
  const value = raw?.trim().toLowerCase();
  if (!value) return 'real';
  if (value === 'mock' || value === 'real') return value;
  throw new ApiConfigError(`${envVar} must be "mock" or "real", got "${raw}".`);
}

/**
 * A base URL derived from the Expo dev server's own host.
 *
 * On a physical phone `localhost` is the phone. But the phone is already
 * talking to the laptop — it loaded the bundle from it — so the dev server's
 * host (`192.168.1.42:8081`) is the laptop's LAN address, and the backend is on
 * the same machine. Swapping the port gives a default that works on a new
 * network with no editing. `EXPO_PUBLIC_API_URL`, when set, wins.
 */
export function deriveBaseUrlFromHost(
  hostUri: string | undefined | null,
  port: number = DEFAULT_BACKEND_HTTP_PORT,
): string | undefined {
  if (!hostUri) return undefined;
  const host = hostUri
    .replace(/^[a-z]+:\/\//iu, '')
    .split('/')[0]
    ?.split(':')[0];
  if (!host) return undefined;
  return `http://${host}:${port}`;
}
