/**
 * Where the refresh token lives between launches.
 *
 * Only the refresh token is ever stored; the access token stays in memory and
 * is re-minted from the refresh token on the next launch. Each platform
 * supplies its own adapter — `expo-secure-store` on the phone, IndexedDB on
 * the web — and neither is `localStorage`, which is readable by any script on
 * the origin and is the first place an attacker looks.
 */
export interface TokenStorage {
  read(): Promise<string | null>;
  write(refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}

/** In memory only. For tests, and for the mock data source, which has no session to keep. */
export function createMemoryTokenStorage(initial: string | null = null): TokenStorage {
  let value = initial;
  return {
    read: () => Promise.resolve(value),
    write: (refreshToken) => {
      value = refreshToken;
      return Promise.resolve();
    },
    clear: () => {
      value = null;
      return Promise.resolve();
    },
  };
}
