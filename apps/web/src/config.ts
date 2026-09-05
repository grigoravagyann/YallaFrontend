import { resolveApiConfig, resolveDataSource, type ApiConfig, type DataSource } from '@yalla/api';

/**
 * Where the console gets its data.
 *
 * Vite exposes only `VITE_`-prefixed variables to the browser bundle:
 *
 * - `VITE_DATA_SOURCE` — `real` (default) or `mock`.
 * - `VITE_API_URL` — the backend origin. The browser runs on the same machine
 *   as the backend, so `http://localhost:5086` is right here — unlike the
 *   phone, which needs the LAN address.
 *
 * A function rather than module-level constants so that `main.tsx` can call
 * it inside a try/catch and render the message when it throws. A thrown error
 * at import time is a blank page; a blank page is not "loud".
 */
export interface AppConfig {
  readonly dataSource: DataSource;
  /** `null` when running on mock data. */
  readonly api: ApiConfig | null;
}

let cached: AppConfig | null = null;

export function readConfig(): AppConfig {
  if (cached) return cached;

  const dataSource = resolveDataSource(import.meta.env['VITE_DATA_SOURCE'], 'VITE_DATA_SOURCE');
  const api =
    dataSource === 'real'
      ? resolveApiConfig({
          baseUrl: import.meta.env['VITE_API_URL'],
          envVar: 'VITE_API_URL',
          example: 'http://localhost:5086',
        })
      : null;

  cached = { dataSource, api };
  return cached;
}
