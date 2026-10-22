import { browserMockStorage, resolveGateway, type YallaGateway } from '@yalla/api';
import { authSession } from '../auth/session';
import { apiConfig, dataSource } from '../config';
import { installDeviceId } from '../lib/deviceId';
import { tabTokenStorage } from '../lib/tabMemory';

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
  // The participant token each tab issued this install, so a reload or a tab's
  // link re-attaches instead of saying the tab closed.
  tabTokens: tabTokenStorage,
  // Enough delay that loading states are actually visible while developing.
  mockLatencyMs: 250,
  // Set EXPO_PUBLIC_SIMULATE_TABLE_TAKEN=1 to make the next booking lose the
  // race, so the 409 path can be walked without a second device. Mock only.
  simulateTableTaken: process.env['EXPO_PUBLIC_SIMULATE_TABLE_TAKEN'] === '1',
  // A short-notice booking waits for the floor. In mock mode the floor is the
  // mock: EXPO_PUBLIC_MOCK_APPROVAL_WINDOW_SECONDS shortens its fifteen
  // minutes, and EXPO_PUBLIC_MOCK_VENUE_APPROVES_AFTER_SECONDS has it approve
  // the first request that long after it is made (later ones run out).
  mockApprovalWindowMs: seconds(process.env['EXPO_PUBLIC_MOCK_APPROVAL_WINDOW_SECONDS']),
  mockVenueApprovesAfterMs: seconds(process.env['EXPO_PUBLIC_MOCK_VENUE_APPROVES_AFTER_SECONDS']),
  // Booking times, in mock mode: other guests' bookings tomorrow evening at
  // Northern Avenue (struck, requestable and cut-short times to walk) unless
  // EXPO_PUBLIC_MOCK_NEIGHBOURS=0, and EXPO_PUBLIC_MOCK_EARLIER_GUEST_ANSWERS_AFTER_SECONDS
  // has another guest say yes to a request for their table that long after.
  mockNeighbourBookings:
    process.env['EXPO_PUBLIC_MOCK_NEIGHBOURS'] !== '0' && process.env['NODE_ENV'] !== 'test',
  mockEarlierGuestAnswersAfterMs: seconds(
    process.env['EXPO_PUBLIC_MOCK_EARLIER_GUEST_ANSWERS_AFTER_SECONDS'],
  ),
  // A scan with no proved number waits for a waiter; in mock mode one comes
  // after EXPO_PUBLIC_MOCK_ADMISSION_AFTER_SECONDS (eight when unset) and lets
  // the table in — or turns it away with EXPO_PUBLIC_MOCK_ADMISSION=reject.
  mockAdmissionAfterMs: seconds(process.env['EXPO_PUBLIC_MOCK_ADMISSION_AFTER_SECONDS']),
  mockAdmissionOutcome: process.env['EXPO_PUBLIC_MOCK_ADMISSION'] === 'reject' ? 'reject' : 'admit',
  // The guest record, in mock mode: the diner's own counts from before this
  // world — EXPO_PUBLIC_MOCK_GUEST_RECORD="came/noShows/lateCancellations/unmarked",
  // "11/1/0/0" when unset and "new" for none — and, with
  // EXPO_PUBLIC_MOCK_BLOCKED_DAYS, a pause on booking that many days from now.
  mockGuestRecord: mockGuestRecord(process.env['EXPO_PUBLIC_MOCK_GUEST_RECORD']),
  mockBlockedUntilUtc: daysFromNow(process.env['EXPO_PUBLIC_MOCK_BLOCKED_DAYS']),
  // Pre-orders, in mock mode: Northern Avenue takes them (the gata excluded),
  // every other branch is off, as the server's default is. Off in tests, and
  // with EXPO_PUBLIC_MOCK_PRE_ORDERS=0.
  mockPreOrders:
    process.env['EXPO_PUBLIC_MOCK_PRE_ORDERS'] !== '0' && process.env['NODE_ENV'] !== 'test',
  // Takeaway and "I'm coming", in mock mode: Northern Avenue takes takeaway
  // (the matnakash eggs hall-only), the seeded account has an order being
  // prepared, and a booking with a pre-order forty minutes out. Off in tests,
  // and with EXPO_PUBLIC_MOCK_TAKEAWAY=0.
  mockTakeaway:
    process.env['EXPO_PUBLIC_MOCK_TAKEAWAY'] !== '0' && process.env['NODE_ENV'] !== 'test',
  mockComingBooking:
    process.env['EXPO_PUBLIC_MOCK_TAKEAWAY'] !== '0' && process.env['NODE_ENV'] !== 'test',
  // On the web build the mock world survives a full page load (QA F2); a
  // phone keeps the app alive between screens and has no localStorage.
  persist:
    dataSource === 'mock' &&
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    process.env['NODE_ENV'] !== 'test'
      ? { key: 'yalla.mock.diner', storage: browserMockStorage() }
      : undefined,
});

/** A whole number of seconds from an env flag, in milliseconds, or nothing. */
function seconds(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : undefined;
}

/** "11/1/0/0" as came, no-shows, late cancellations and unmarked; "new" for no record. */
function mockGuestRecord(value: string | undefined) {
  if (value === 'new') return undefined;
  const [came = 11, noShows = 1, lateCancellations = 0, unmarked = 0] = (value ?? '')
    .split('/')
    .map((part) => Number.parseInt(part, 10))
    .map((count) => (Number.isFinite(count) && count >= 0 ? count : undefined));
  return { came, noShows, lateCancellations, unmarked };
}

/** A whole number of days from now as an ISO instant, or nothing. */
function daysFromNow(value: string | undefined): string | undefined {
  const days = Number.parseInt(value ?? '', 10);
  return Number.isFinite(days) && days > 0
    ? new Date(Date.now() + days * 24 * 3_600_000).toISOString()
    : undefined;
}

/** True when the app is running on mock data. Drives the dev-only banner. */
export const usingMockData = dataSource === 'mock';
