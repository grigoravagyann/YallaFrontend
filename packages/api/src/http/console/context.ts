import type { VenueUserIdentity } from '../../auth/endpoints';
import type { AuthSession, TokenPair } from '../../auth/session';
import type { ApiClient } from '../../client';
import { absolutePhotoUrl } from '../photoUrl';
import {
  StaffPermissionError,
  StaffPinTakenError,
  SlugTakenError,
  isFeatureNotEnabled,
} from '../../contracts/errors';
import { ApiError } from '../../errors';
import type { components } from '../../generated/schema';
import { parseProblem } from '../../problem';
import { venueDetailFromWire } from '../consoleMapping';
import { ProblemCodes } from '../../generated/problemCodes';

type Schemas = components['schemas'];
type WireDetail = Schemas['Yalla.Application.Platform.VenueDetail'];

/**
 * The name the sign-in response gave us, kept for the session.
 *
 * The backend has no `/me` endpoint, so after a reload the console rebuilds the
 * signed-in user from the access token's claims. Those carry the ids and the
 * role but not the display name, which is why the sign-in result is kept here
 * and read back when the token is refreshed rather than re-issued.
 */
export interface ConsoleIdentityStore {
  get(): VenueUserIdentity | null;
  set(identity: VenueUserIdentity | null): void;
}

export function createMemoryIdentityStore(): ConsoleIdentityStore {
  let value: VenueUserIdentity | null = null;
  return {
    get: () => value,
    set: (identity) => {
      value = identity;
    },
  };
}

export interface ConsoleHttpGatewayOptions {
  readonly auth: AuthSession;
  readonly identity: ConsoleIdentityStore;
}

export const PLATFORM = '/api/platform';
export const BRANCHES = '/api/branches';
export const VENUES = '/api/venues';
/** My account, for an owner, a general manager or a branch manager (`VenueStaffAccount`). */
export const VENUE_ME = '/api/venue/me';
export const RESERVATIONS = '/api/reservations';

/** A token pair in a JSON answer, as the sign-in route spells it; `null` when there is none. */
export function tokenPairFrom(data: unknown): TokenPair | null {
  if (data === null || typeof data !== 'object') return null;
  const answer = data as {
    accessToken?: unknown;
    refreshToken?: unknown;
    expiresInSeconds?: unknown;
  };
  if (typeof answer.accessToken !== 'string' || typeof answer.refreshToken !== 'string')
    return null;
  return {
    accessToken: answer.accessToken,
    refreshToken: answer.refreshToken,
    // The access token's own expiry wins in the session; this is the fallback.
    expiresInSeconds: typeof answer.expiresInSeconds === 'number' ? answer.expiresInSeconds : 900,
  };
}

/**
 * A 403 from the staff routes is the role guard, and it names the field; a 409
 * `pin-taken` is the PIN somebody on the same tablet already uses.
 *
 * Surfaced against the control that caused it rather than as a form-level
 * banner: "you cannot assign that role" belongs under the role picker, where
 * the next action is obvious, not above a form where it reads as a refusal of
 * the whole thing.
 */
export function staffRefusal(error: unknown): never {
  // PINs are unique per tablet roster: the sentence goes under the PIN field.
  if (error instanceof ApiError && error.status === 409 && error.code === ProblemCodes.PinTaken) {
    throw new StaffPinTakenError({
      url: error.url,
      detail: error.problem?.detail ?? error.message,
      requestId: error.requestId,
      problem: error.problem,
    });
  }
  if (error instanceof ApiError && error.status === 403) {
    const problem = parseProblem(error.body);
    const field = problem?.context?.['field'];
    throw new StaffPermissionError({
      url: error.url,
      detail: problem?.detail ?? error.message,
      field: typeof field === 'string' ? field : null,
    });
  }
  throw error;
}

/**
 * Reports are queried live against the operational tables and the menu one
 * anti-joins the whole menu, so they are allowed longer than an ordinary read
 * before the client gives up. Still finite: a request that will not finish
 * should say so rather than hold a spinner until somebody reloads.
 */
export const REPORT_TIMEOUT_MS = 30_000;

/**
 * What the console feature files share: the client, the session, the venue
 * read several of them answer with, and the slug refusal it can raise.
 */
export function createConsoleHttpContext(client: ApiClient, options: ConsoleHttpGatewayOptions) {
  const { auth, identity } = options;

  /**
   * A 409 on create means the slug is taken — the one conflict this surface
   * raises, and the fix is a specific field.
   */
  function translate(error: unknown, context: { slug?: string }): never {
    if (!isFeatureNotEnabled(error) && error instanceof ApiError && error.status === 409) {
      throw new SlugTakenError({ url: error.url, slug: context.slug ?? '' });
    }
    throw error;
  }

  /** A photo link the server gives relative to itself, made absolute against the API. */
  const photoLink = (url: string) => absolutePhotoUrl(client.baseUrl, url);

  async function venueDetail(path: string, context: { slug?: string } = {}) {
    try {
      const { data } = await client.get<WireDetail>(path);
      return venueDetailFromWire(data, photoLink);
    } catch (error) {
      return translate(error, context);
    }
  }

  return { client, auth, identity, translate, photoLink, venueDetail };
}

export type ConsoleHttpContext = ReturnType<typeof createConsoleHttpContext>;
