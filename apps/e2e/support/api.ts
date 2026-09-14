import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import { request, type APIRequestContext, type APIResponse } from '@playwright/test';

import { env } from './env';

/**
 * The backend, spoken to directly: to set up what a spec needs and to check what
 * the apps did. Shapes are the wire ones (camelCase, enums as integers).
 *
 * Nothing here logs a request body. A failure quotes the route, the status and
 * the server's answer, which never echoes a password back.
 */

export const SEED_VENUE_SLUG = 'yalla-demo';
export const SEED_BRANCH_SLUG = 'yerevan-centre';
const SEED_MANAGER = 'Nune Manager';

export function newApi(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: env.apiUrl,
    extraHTTPHeaders: { accept: 'application/json' },
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function body<T>(response: APIResponse, what: string): Promise<T> {
  if (!response.ok()) {
    throw new Error(`${what}: HTTP ${response.status()} ${(await response.text()).slice(0, 600)}`);
  }
  const text = await response.text();
  return (text === '' ? undefined : JSON.parse(text)) as T;
}

/** A run-unique tag for names and texts a spec looks for later. */
export function uniqueTag(): string {
  return randomBytes(3).toString('hex');
}

/**
 * A number in the test ranges the repositories already use (+374 91 000 xxx and
 * +374 99 000 xxx), never a real subscriber. 100 and up keeps clear of the
 * development reviewers at +374 99 000 051..055.
 */
export function testPhone(): string {
  const prefix = randomInt(2) === 0 ? '+37491000' : '+37499000';
  return `${prefix}${randomInt(100, 1000)}`;
}

/** A calendar date in the branch's zone, `days` from today, as `YYYY-MM-DD`. */
export function localDate(days: number, timeZone = 'Asia/Yerevan'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

// --- Diners ---------------------------------------------------------------------------

export interface Diner {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly phoneE164: string;
  readonly displayName: string;
  readonly accessToken: string;
}

interface DinerSignIn {
  readonly accessToken: string;
  readonly dinerUserId: string;
}

/** Fresh account fields that pass the app's and the server's rules; nothing real. */
export function dinerFields(displayName = `Tester ${uniqueTag()}`) {
  const username = `e2e_${uniqueTag()}${uniqueTag()}`;
  return {
    username,
    email: `${username}@yalla.test`,
    password: randomBytes(12).toString('base64url'),
    phoneE164: testPhone(),
    displayName,
  };
}

/** Registers a diner, and by default proves the number with the Development code. */
export async function registerDiner(
  api: APIRequestContext,
  options: { displayName?: string; verified?: boolean } = {},
): Promise<Diner> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const fields = dinerFields(options.displayName);
    const response = await api.post('/api/auth/diner/register', {
      data: { ...fields, localeCode: 'en' },
    });
    // A number an earlier run registered: draw another.
    if (response.status() === 409) continue;

    const signIn = await body<DinerSignIn>(response, 'POST /api/auth/diner/register');
    const accessToken =
      options.verified === false
        ? signIn.accessToken
        : (await verifyPhone(api, fields.phoneE164, signIn.accessToken)).accessToken;
    return { ...fields, id: signIn.dinerUserId, accessToken };
  }
  throw new Error('Could not find a free test phone number in six tries.');
}

/** The code Development hands back from request-code, instead of an SMS. */
export async function requestCode(api: APIRequestContext, phoneE164: string): Promise<string> {
  const issued = await body<{ developmentCode?: string | null }>(
    await api.post('/api/auth/diner/request-code', { data: { phoneE164, localeCode: 'en' } }),
    'POST /api/auth/diner/request-code',
  );
  if (!issued.developmentCode) {
    throw new Error(
      'request-code returned no developmentCode. The e2e run needs the backend in Development, ' +
        'where Auth:ReturnVerificationCodeInResponse is honoured.',
    );
  }
  return issued.developmentCode;
}

export async function verifyPhone(
  api: APIRequestContext,
  phoneE164: string,
  token: string,
): Promise<DinerSignIn> {
  const code = await requestCode(api, phoneE164);
  return body<DinerSignIn>(
    await api.post('/api/auth/diner/verify-code', {
      data: { phoneE164, code, localeCode: 'en' },
      headers: bearer(token),
    }),
    'POST /api/auth/diner/verify-code',
  );
}

export interface DinerMe {
  readonly displayName?: string | null;
  readonly phoneE164?: string | null;
  readonly phoneVerified?: boolean;
  readonly phoneVerifiedAtUtc?: string | null;
  readonly photo?: { readonly thumbnailUrl: string } | null;
}

export async function dinerMe(api: APIRequestContext, diner: Diner): Promise<DinerMe> {
  return body(
    await api.get('/api/diner/me', { headers: bearer(diner.accessToken) }),
    'GET /api/diner/me',
  );
}

// --- Staff and platform ---------------------------------------------------------------

export async function adminToken(api: APIRequestContext): Promise<string> {
  const signIn = await body<{ accessToken: string }>(
    await api.post('/api/auth/venue/sign-in', {
      data: { email: env.adminEmail(), password: env.adminPassword() },
    }),
    'POST /api/auth/venue/sign-in (platform admin)',
  );
  return signIn.accessToken;
}

export interface VenueLogin {
  readonly email: string;
  readonly password: string;
  readonly accessToken: string;
}

let managerLogin: Promise<VenueLogin> | null = null;

/**
 * The seeded "Nune Manager", given an admin-panel sign-in the way an owner or the
 * platform does it: the platform admin issues a link, the link's token sets a
 * password, and the manager signs in with it. Issued once per worker and reused,
 * because issuing again ends the sessions of the one before.
 */
export function managerSession(api: APIRequestContext): Promise<VenueLogin> {
  managerLogin ??= (async () => {
    const admin = await adminToken(api);
    const { venueId } = await demoBranch(api);
    const staff = await body<{ id: string; fullName: string; isActive: boolean }[]>(
      await api.get(`/api/venues/${venueId}/staff`, { headers: bearer(admin) }),
      'GET /api/venues/{venueId}/staff',
    );
    const manager = staff.find((member) => member.fullName === SEED_MANAGER && member.isActive);
    if (!manager)
      throw new Error(
        `The seed has no active "${SEED_MANAGER}". Start the backend with DevSeed on.`,
      );

    const email = `e2e-manager-${uniqueTag()}${uniqueTag()}@yalla.test`;
    const link = await body<{ resetLink: string }>(
      await api.post(`/api/venues/${venueId}/staff/${manager.id}/sign-in`, {
        data: { email },
        headers: bearer(admin),
      }),
      'POST /api/venues/{venueId}/staff/{id}/sign-in',
    );
    const resetToken = new URLSearchParams(new URL(link.resetLink).hash.slice(1)).get('token');
    if (!resetToken) throw new Error('The issued sign-in link carries no #token=.');

    const password = randomBytes(24).toString('base64url');
    await body(
      await api.post('/api/auth/venue/reset-password', {
        data: { resetToken, newPassword: password },
      }),
      'POST /api/auth/venue/reset-password',
    );
    const signIn = await body<{ accessToken: string }>(
      await api.post('/api/auth/venue/sign-in', { data: { email, password } }),
      'POST /api/auth/venue/sign-in (manager)',
    );
    return { email, password, accessToken: signIn.accessToken };
  })();
  return managerLogin;
}

// --- The demo branch ------------------------------------------------------------------

export interface DemoBranch {
  readonly branchId: string;
  readonly venueId: string;
  readonly venueName: string;
  readonly branchName: string;
  readonly address: string;
}

export async function demoBranch(api: APIRequestContext): Promise<DemoBranch> {
  const venues = await body<
    { venueSlug: string; branches: { branchId: string; branchSlug: string }[] }[]
  >(await api.get('/api/public/venues'), 'GET /api/public/venues');
  const branch = venues
    .find((venue) => venue.venueSlug === SEED_VENUE_SLUG)
    ?.branches.find((entry) => entry.branchSlug === SEED_BRANCH_SLUG);
  if (!branch) {
    throw new Error(
      `No ${SEED_VENUE_SLUG}/${SEED_BRANCH_SLUG} at ${env.apiUrl}. Start the backend with DevSeed on.`,
    );
  }
  const detail = await branchDetail(api, branch.branchId);
  return {
    branchId: branch.branchId,
    venueId: detail.listing.venueId,
    venueName: detail.listing.venueName,
    branchName: detail.listing.branchName,
    address: detail.listing.address,
  };
}

export interface PublicListing {
  readonly branchId: string;
  readonly venueId: string;
  readonly venueSlug: string;
  readonly branchSlug: string;
  readonly venueName: string;
  readonly branchName: string;
  readonly address: string;
  readonly cuisine?: string;
  readonly reviewCount: number;
}

export interface PublicDetail {
  readonly listing: PublicListing;
  readonly amenities: readonly string[];
  readonly recentReviews: readonly PublicReview[];
}

export interface PublicReview {
  readonly reviewId: string;
  readonly authorName: string;
  readonly rating: number;
  readonly text?: string;
}

export async function publicBranches(api: APIRequestContext): Promise<PublicListing[]> {
  return body(await api.get('/api/public/branches'), 'GET /api/public/branches');
}

export async function branchDetail(
  api: APIRequestContext,
  branchId: string,
): Promise<PublicDetail> {
  return body(await api.get(`/api/public/branches/${branchId}`), 'GET /api/public/branches/{id}');
}

export async function publicReviews(
  api: APIRequestContext,
  branchId: string,
): Promise<PublicReview[]> {
  const page = await body<{ reviews: PublicReview[] }>(
    await api.get(`/api/public/branches/${branchId}/reviews?page=1`),
    'GET /api/public/branches/{id}/reviews',
  );
  return page.reviews;
}

export interface TableMarkers {
  readonly photo?: { readonly photoId: string };
  readonly tables: readonly {
    tableId: string;
    label: string;
    photoX: number;
    photoY: number;
    state: number;
  }[];
}

export async function tableMarkers(
  api: APIRequestContext,
  branchId: string,
): Promise<TableMarkers> {
  return body(
    await api.get(`/api/public/branches/${branchId}/table-markers`),
    'GET /api/public/branches/{id}/table-markers',
  );
}

export interface FloorTable {
  readonly id: string;
  readonly label: string;
  readonly seats: number;
  readonly isActive: boolean;
  readonly isBookable: boolean;
  readonly qrToken: string;
}

/** A table of the demo floor by its label, with its QR token (staff-only field). */
export async function tableByLabel(
  api: APIRequestContext,
  branchId: string,
  label: string,
): Promise<FloorTable> {
  const admin = await adminToken(api);
  const plan = await body<{ tables: FloorTable[] }>(
    await api.get(`/api/branches/${branchId}/floor-plan`, { headers: bearer(admin) }),
    'GET /api/branches/{id}/floor-plan',
  );
  const table = plan.tables.find((entry) => entry.label === label && entry.isActive);
  if (!table) throw new Error(`The demo floor has no active table "${label}".`);
  return table;
}

// --- Tabs, bookings, reviews ----------------------------------------------------------

/** Scans a table's QR as this diner: opens its tab, which counts as a visit for reviews. */
export async function openTab(
  api: APIRequestContext,
  diner: Diner,
  qrToken: string,
): Promise<{ tabId: string }> {
  const access = await body<{ tab: { tabId?: string; id?: string } }>(
    await api.post('/api/tabs/open', {
      data: {
        qrToken,
        deviceId: randomUUID(),
        clientCommandId: randomUUID(),
        displayName: diner.displayName,
        partySize: 2,
      },
      headers: bearer(diner.accessToken),
    }),
    'POST /api/tabs/open',
  );
  const tabId = access.tab.tabId ?? access.tab.id;
  if (!tabId) throw new Error('POST /api/tabs/open answered without a tab id.');
  return { tabId };
}

export interface Reservation {
  readonly id: string;
  readonly code: string;
  readonly status: number;
  readonly note?: string | null;
  readonly localDate: string;
  readonly tableLabel: string;
}

/** Books through the API on the App channel, trying later hours if a slot is taken. */
export async function bookTable(
  api: APIRequestContext,
  diner: Diner,
  input: {
    branchId: string;
    tableId: string;
    date: string;
    hours: readonly number[];
    partySize?: number;
    note?: string;
  },
): Promise<Reservation> {
  let last = '';
  for (const hour of input.hours) {
    const response = await api.post('/api/reservations', {
      data: {
        branchId: input.branchId,
        tableId: input.tableId,
        date: input.date,
        time: `${String(hour).padStart(2, '0')}:00:00`,
        partySize: input.partySize ?? 2,
        guestName: diner.displayName,
        guestPhone: diner.phoneE164,
        clientCommandId: randomUUID(),
        channel: 1,
        note: input.note ?? null,
      },
      headers: bearer(diner.accessToken),
    });
    if (response.status() === 409) {
      last = await response.text();
      continue;
    }
    return body<Reservation>(response, 'POST /api/reservations');
  }
  throw new Error(`No free slot for the booking: ${last.slice(0, 400)}`);
}

/** `GET /api/reservations/mine`: the server splits it into upcoming and past; both, flattened. */
export async function myReservations(api: APIRequestContext, diner: Diner): Promise<Reservation[]> {
  const mine = await body<{ upcoming?: Reservation[]; past?: Reservation[] }>(
    await api.get('/api/reservations/mine', { headers: bearer(diner.accessToken) }),
    'GET /api/reservations/mine',
  );
  return [...(mine.upcoming ?? []), ...(mine.past ?? [])];
}

/** A manager approves a booking that was waiting for a human: a `booking-confirmed` feed entry. */
export async function approveBooking(
  api: APIRequestContext,
  staffToken: string,
  reservationId: string,
): Promise<void> {
  await body(
    await api.post(`/api/reservations/${reservationId}/approve`, {
      data: { reason: null },
      headers: bearer(staffToken),
    }),
    'POST /api/reservations/{id}/approve',
  );
}

/** The venue lets a confirmed booking go (outcome 2, CancelledByVenue): a feed entry for the diner. */
export async function releaseByVenue(
  api: APIRequestContext,
  staffToken: string,
  reservationId: string,
): Promise<void> {
  await body(
    await api.post(`/api/reservations/${reservationId}/release`, {
      data: { outcome: 2, clientCommandId: randomUUID(), reason: 'Table out of service (e2e run)' },
      headers: bearer(staffToken),
    }),
    'POST /api/reservations/{id}/release',
  );
}

export async function postReview(
  api: APIRequestContext,
  diner: Diner,
  branchId: string,
  review: { rating: number; text: string },
): Promise<{ reviewId: string }> {
  return body(
    await api.post(`/api/diner/branches/${branchId}/review`, {
      data: review,
      headers: bearer(diner.accessToken),
    }),
    'POST /api/diner/branches/{id}/review',
  );
}

/** A diner's report (K8 extension): 204, and a repeat is a no-op. */
export async function reportReview(
  api: APIRequestContext,
  diner: Diner,
  reviewId: string,
  reason: 'spam' | 'offensive' | 'not-a-visit' | 'personal-info' | 'other',
): Promise<void> {
  await body(
    await api.post(`/api/diner/reviews/${reviewId}/report`, {
      data: { reason, note: null },
      headers: bearer(diner.accessToken),
    }),
    'POST /api/diner/reviews/{id}/report',
  );
}

export interface ModerationItem {
  readonly reviewId: string;
  readonly text?: string | null;
  readonly hidden: boolean;
  readonly reportCount: number;
}

export async function venueReviews(
  api: APIRequestContext,
  staffToken: string,
  branchId: string,
  filter: 'all' | 'reported' | 'hidden',
): Promise<ModerationItem[]> {
  const page = await body<{ items: ModerationItem[] }>(
    await api.get(`/api/branches/${branchId}/reviews?filter=${filter}&page=1&pageSize=100`, {
      headers: bearer(staffToken),
    }),
    'GET /api/branches/{id}/reviews',
  );
  return page.items;
}

export async function favorites(api: APIRequestContext, diner: Diner): Promise<string[]> {
  const list = await body<{ items: { branchId: string }[] }>(
    await api.get('/api/diner/favorites', { headers: bearer(diner.accessToken) }),
    'GET /api/diner/favorites',
  );
  return list.items.map((item) => item.branchId);
}

export interface FeedPage {
  readonly items: readonly {
    notificationId: string;
    kind: string;
    reservationId?: string;
    read: boolean;
  }[];
  readonly unreadCount: number;
}

export async function notificationFeed(api: APIRequestContext, diner: Diner): Promise<FeedPage> {
  return body(
    await api.get('/api/diner/notifications', { headers: bearer(diner.accessToken) }),
    'GET /api/diner/notifications',
  );
}
