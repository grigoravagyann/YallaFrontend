import { isUsingMockData, resolveGateway, type YallaGateway } from '@yalla/api';

/**
 * The app's single data source.
 *
 * Set `EXPO_PUBLIC_API_BASE_URL` to point at a real backend; leave it unset and
 * the app runs entirely on mock data. Nothing else in the app knows which is in
 * play — every screen is typed against `YallaGateway`.
 */
const baseUrl = process.env['EXPO_PUBLIC_API_BASE_URL'];

export const gateway: YallaGateway = resolveGateway({
  baseUrl,
  // Enough delay that loading states are actually visible while developing.
  mockLatencyMs: 250,
  // Set EXPO_PUBLIC_SIMULATE_TABLE_TAKEN=1 to make the next booking lose the
  // race, so the 409 path can be walked without a second device.
  simulateTableTaken: process.env['EXPO_PUBLIC_SIMULATE_TABLE_TAKEN'] === '1',
});

/** True when the app is running on mock data. Drives the dev-only banner. */
export const usingMockData = isUsingMockData({ baseUrl });
