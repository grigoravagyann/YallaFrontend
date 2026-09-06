import {
  deriveBaseUrlFromHost,
  resolveApiConfig,
  resolveDataSource,
  type ApiConfig,
  type DataSource,
} from '@yalla/api';
import Constants from 'expo-constants';

/**
 * Where the diner app gets its data.
 *
 * Expo inlines only `EXPO_PUBLIC_`-prefixed variables into the bundle. Two of
 * them matter here:
 *
 * - `EXPO_PUBLIC_DATA_SOURCE` — `real` (default) or `mock`.
 * - `EXPO_PUBLIC_API_URL` — the backend origin. On a physical phone
 *   `localhost` is the phone, so this has to be the laptop's LAN address.
 *
 * When the URL is not set, it is derived from the Expo dev server's own host:
 * the phone loaded this bundle from `192.168.1.42:8081`, so the backend is at
 * `192.168.1.42:5086`. That makes a fresh checkout on a new network work with
 * no editing. Anything malformed throws here, at startup, naming the variable —
 * Expo shows it as a red screen, which is the point.
 */
export const dataSource: DataSource = resolveDataSource(
  process.env['EXPO_PUBLIC_DATA_SOURCE'],
  'EXPO_PUBLIC_DATA_SOURCE',
);

/** The dev server's host, e.g. `192.168.1.42:8081`, when running through Expo Go. */
const devServerHost: string | undefined =
  Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? undefined;

export const apiConfig: ApiConfig | null =
  dataSource === 'real'
    ? resolveApiConfig({
        baseUrl: process.env['EXPO_PUBLIC_API_URL'] ?? deriveBaseUrlFromHost(devServerHost),
        envVar: 'EXPO_PUBLIC_API_URL',
        example: 'http://192.168.1.42:5086',
      })
    : null;

/**
 * The EAS project id, for the Expo push token.
 *
 * Read from the app config rather than an env var: `expo-notifications` needs
 * the same id EAS builds under, and having two sources for it is how a build
 * ends up requesting a token for a project that will never send to it.
 *
 * `undefined` on a bare `expo start` with no EAS project, and that is a
 * supported state: `currentPushToken` returns `null`, the opt-in card says the
 * reminder will not arrive, and nothing else in the app changes. Push is the
 * one feature that cannot be honestly simulated — a token nobody will send to
 * looks exactly like a working one.
 */
export const projectId: string | undefined =
  Constants.expoConfig?.extra?.['eas']?.['projectId'] ??
  Constants.easConfig?.projectId ??
  undefined;
