import { resolveGateway, type YallaGateway } from '@yalla/api';
import { authSession } from '../auth/session';
import { apiConfig, dataSource } from '../config';
import { installDeviceId } from '../lib/deviceId';

/**
 * The app's single data source.
 *
 * `EXPO_PUBLIC_DATA_SOURCE=mock` runs the whole app on the in-memory mock;
 * anything else talks to the backend at `EXPO_PUBLIC_API_URL`. Nothing else in
 * the app knows which is in play — every screen is typed against
 * `YallaGateway` and reaches it through `GatewayProvider`.
 */
export const gateway: YallaGateway = resolveGateway({
  dataSource,
  baseUrl: apiConfig?.baseUrl,
  auth: authSession,
  audience: 'diner',
  // One id per install, kept in the secure store. Opening or joining a tab
  // requires it: it is how the server knows a re-scan is the same phone.
  deviceId: installDeviceId,
  // Enough delay that loading states are actually visible while developing.
  mockLatencyMs: 250,
  // Set EXPO_PUBLIC_SIMULATE_TABLE_TAKEN=1 to make the next booking lose the
  // race, so the 409 path can be walked without a second device. Mock only.
  simulateTableTaken: process.env['EXPO_PUBLIC_SIMULATE_TABLE_TAKEN'] === '1',
});

/** True when the app is running on mock data. Drives the dev-only banner. */
export const usingMockData = dataSource === 'mock';
