import { createDinerAuth, type DinerAuth } from '../../auth/endpoints';
import type { AuthSession } from '../../auth/session';
import type { ApiClient, RequestOptions } from '../../client';
import type { DinerProfileView, DinerSignInResult } from '../../contracts/dinerAccount';
import { NotTabHostError, TabAccessEndedError } from '../../contracts/errors';
import { ApiError, ForbiddenError, UnauthorizedError } from '../../errors';
import type { components } from '../../generated/schema';
import { dinerProfile } from '../dinerMapping';
import { clampBranchSearch, type BranchSearchQuery } from '../../contracts/places';
import { venueTypeCode } from '../placesMapping';
import { ProblemCodes } from '../../generated/problemCodes';

type Schemas = components['schemas'];

/**
 * Who is holding the phone or the tablet.
 *
 * The floor endpoint is staff-only, so a diner reads the room from the
 * anonymous availability endpoint, which carries the same geometry. The staff
 * screen reads the richer floor view, which also says who was seated when.
 */
export type GatewayAudience = 'diner' | 'staff';

export interface HttpGatewayOptions {
  readonly audience: GatewayAudience;
  /** The diner session; phone verification signs it in. */
  readonly auth?: AuthSession | undefined;
  /**
   * This install's device id, which `POST /api/tabs/open` and `/join` require.
   *
   * A promise because it is read from storage once. Absent on a surface that
   * never scans a table — the web booking page — where a scan says so.
   */
  readonly deviceId?: (() => Promise<string>) | undefined;
  /** The zone to convert slots in when the caller did not pass one. */
  readonly defaultTimeZoneId?: string | undefined;
  readonly dinerAuth?: DinerAuth | undefined;
  /**
   * Where the participant tokens tabs issued this device are kept between
   * launches. Absent, they live as long as the gateway.
   */
  readonly tabTokens?: TabTokenStorage | undefined;
}

/**
 * tabId → participant token, kept where a reload finds it: the keychain on a
 * phone, localStorage on the web. Read once, written whole on every change.
 */
export interface TabTokenStorage {
  read(): Promise<Readonly<Record<string, string>>>;
  write(tokens: Readonly<Record<string, string>>): Promise<void>;
}

/**
 * A coordinate cut to three decimals — about 110 m — before it leaves the phone.
 *
 * Two reasons. The server caches browse answers by query string, and a GPS fix
 * that wobbles in the sixth decimal made every request a cache miss. And a
 * diner's exact position is more than a "nearest first" list needs to know;
 * a hundred metres sorts the same list.
 */
function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The browse query string: `q`, `category` (1 Cafe, 2 Restaurant), and `lat`
 * with `lng` — both or neither, which the server enforces with a 400, rounded
 * to three decimals. `q` is cut to the server's 100 characters, which it would
 * otherwise refuse with a 400.
 */
export function branchQuery(query: BranchSearchQuery | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const q = clampBranchSearch(query?.query);
  if (q) out['q'] = q;
  if (query?.venueType) out['category'] = venueTypeCode(query.venueType);
  const position = query?.position;
  if (position && Number.isFinite(position.latitude) && Number.isFinite(position.longitude)) {
    out['lat'] = roundCoordinate(position.latitude);
    out['lng'] = roundCoordinate(position.longitude);
  }
  return out;
}

/** Trimmed, and blank as `null` — the server's own reading of an optional note. */
export function noteOrNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed === '' ? null : trimmed;
}

/**
 * What the diner feature files share: the client and the options, the
 * participant tokens tabs issued this device, the venue names browse has
 * seen, and the one place a diner session is started.
 */
export function createDinerHttpContext(client: ApiClient, options: HttpGatewayOptions) {
  const { audience, auth } = options;
  const dinerAuth = options.dinerAuth ?? createDinerAuth(client);
  const defaultZone = options.defaultTimeZoneId ?? 'Asia/Yerevan';
  const deviceId =
    options.deviceId ??
    (() => Promise.reject(new Error('This surface has no device id, so it cannot open a tab.')));

  /**
   * tabId → the participant token that tab issued this device.
   *
   * Kept apart from the diner's `AuthSession` on purpose. Every call on a tab
   * carries this token and `skipAuth`, so the client's refresh-on-401 — which
   * spends the diner's rotating refresh token — can never fire for a tab whose
   * participant token was refused.
   *
   * Mirrored to `options.tabTokens` when there is one, so a reload or a deep
   * link to an open tab re-attaches with the token the scan earned instead of
   * meeting "the tab has closed". The server's refusal is what drops one.
   */
  const tabTokens = new Map<string, string>();
  const tabTokenStore = options.tabTokens;
  const tabTokensLoaded: Promise<void> = tabTokenStore
    ? tabTokenStore
        .read()
        .then((stored) => {
          for (const [tabId, token] of Object.entries(stored)) {
            // A token this gateway was handed since launch is newer.
            if (!tabTokens.has(tabId)) tabTokens.set(tabId, token);
          }
        })
        .catch(() => undefined)
    : Promise.resolve();

  function persistTabTokens(): void {
    if (!tabTokenStore) return;
    void tabTokenStore.write(Object.fromEntries(tabTokens)).catch(() => undefined);
  }

  function keepTabToken(tabId: string, token: string): void {
    tabTokens.set(tabId, token);
    persistTabTokens();
  }

  function forgetTabToken(tabId: string): void {
    if (tabTokens.delete(tabId)) persistTabTokens();
  }

  async function tabAuth(tabId: string): Promise<Omit<RequestOptions, 'method' | 'body'>> {
    await tabTokensLoaded;
    const token = tabTokens.get(tabId);
    if (!token) {
      throw new TabAccessEndedError({ url: `/api/tabs/${tabId}`, tabId, notOnDevice: true });
    }
    return { skipAuth: true, headers: { authorization: `Bearer ${token}` } };
  }

  /**
   * A refused participant token, said as what it means.
   *
   * The server answers a token for a closed tab, or for somebody taken off it,
   * with a bare 401 or 403 and nothing to tell the cases apart — so this does
   * not try. Reads treat both as "this tab is over for you"; changes treat only
   * 401 that way, because a 403 there is a rule (not the host, bill asked for).
   */
  function ended(error: unknown, tabId: string, statuses: readonly number[] = [401]): unknown {
    if (error instanceof TabAccessEndedError) return error;
    if (error instanceof ApiError && statuses.includes(error.status) && !error.problem?.code) {
      forgetTabToken(tabId);
      return new TabAccessEndedError({ url: error.url, tabId, status: error.status });
    }
    if (error instanceof UnauthorizedError) {
      forgetTabToken(tabId);
      return new TabAccessEndedError({ url: error.url, tabId, status: 401 });
    }
    return error;
  }

  /** A host action refused because the caller is not the host. */
  function hostError(error: unknown, tabId: string): unknown {
    if (error instanceof ForbiddenError && error.problem?.code === ProblemCodes.Forbidden) {
      return new NotTabHostError({ url: error.url });
    }
    return ended(error, tabId);
  }

  /**
   * Branch id to venue name, from the last browse read.
   *
   * `ReservationView` names the branch and not the venue. Rather than invent
   * one, a booking carries the venue name this device has actually seen, and
   * `null` until it has seen one.
   */
  const venueNames = new Map<string, string>();

  /** `GET /api/diner/me`: the account behind the session. */
  async function readProfile(): Promise<DinerProfileView> {
    const { data } =
      await client.get<Schemas['Yalla.Application.Diners.DinerProfileView']>('/api/diner/me');
    return dinerProfile(data, client.baseUrl);
  }

  /**
   * Signed in: start the token session from what the server issued, and hand
   * the caller the same facts.
   *
   * The one place the diner session is started. Verify-code, register and
   * login all answer `DinerSignInResult`, and all three land here — so a fourth
   * door, or a change to what "signed in" means, is a change to one function.
   */
  async function signedIn(
    result: Schemas['Yalla.Application.Auth.DinerSignInResult'],
  ): Promise<DinerSignInResult> {
    await auth?.signIn({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresInSeconds: result.expiresInSeconds,
    });
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresInSeconds: result.expiresInSeconds,
      dinerUserId: result.dinerUserId,
      isNewAccount: result.isNewAccount,
    };
  }

  return {
    client,
    audience,
    auth,
    dinerAuth,
    defaultZone,
    deviceId,
    tabAuth,
    keepTabToken,
    forgetTabToken,
    ended,
    hostError,
    venueNames,
    readProfile,
    signedIn,
  };
}

export type DinerHttpContext = ReturnType<typeof createDinerHttpContext>;
