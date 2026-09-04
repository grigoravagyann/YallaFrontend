import type { FloorPlanData } from '@yalla/floorplan/types';
import type { ApiClient } from '../client';
import type {
  Booking,
  CreateBookingCommand,
  PhoneChallenge,
  TableAvailability,
  VenueSummary,
  VerifiedPhone,
} from '../contracts/booking';
import {
  ExpiredCodeError,
  LeadTimeExceededError,
  RateLimitedError,
  TableTakenError,
  TooManyAttemptsError,
  WrongCodeError,
} from '../contracts/errors';
import { ApiError } from '../errors';
import type { YallaGateway } from '../gateway';

/**
 * The real data source, over HTTP.
 *
 * Endpoint paths are the shapes the .NET backend is expected to expose. Until
 * `pnpm api:generate` has run against a live swagger document the response
 * types here are asserted rather than generated — that is the one place in this
 * package where the contract is taken on trust, and it collapses to nothing the
 * moment the generated schema lands.
 */
export function createHttpGateway(client: ApiClient): YallaGateway {
  /**
   * Translate the endpoint-specific meanings of 409/422/429 into the domain
   * errors screens actually branch on. Every call site funnels through here so
   * a conflict can never surface as a generic failure.
   */
  function translate(error: unknown, context: { tableId?: string; tableLabel?: string }): never {
    if (error instanceof ApiError && error.status === 409) {
      const body = error.body as
        { tableId?: string; tableLabel?: string; floor?: FloorPlanData } | undefined;
      throw new TableTakenError({
        url: error.url,
        tableId: body?.tableId ?? context.tableId ?? '',
        tableLabel: body?.tableLabel ?? context.tableLabel ?? '',
        // A 409 without a floor payload is a backend bug; an empty plan is
        // still better than a crash, and the screen refetches on mount.
        floor:
          body?.floor ??
          ({
            branchId: '',
            canvasWidth: 0,
            canvasHeight: 0,
            timeZoneId: 'UTC',
            tables: [],
          } satisfies FloorPlanData),
      });
    }

    if (error instanceof ApiError && error.status === 422) {
      const body = error.body as
        { code?: string; leadTimeMinutes?: number; earliestSlotUtc?: string } | undefined;
      if (body?.code === 'leadTimeExceeded') {
        throw new LeadTimeExceededError({
          url: error.url,
          leadTimeMinutes: body.leadTimeMinutes ?? 0,
          earliestSlotUtc: body.earliestSlotUtc ?? new Date().toISOString(),
        });
      }
    }

    throw error;
  }

  function translateVerification(error: unknown): never {
    if (!(error instanceof ApiError)) throw error;
    const body = error.body as
      { code?: string; attemptsRemaining?: number; retryAtUtc?: string } | undefined;

    switch (body?.code) {
      case 'wrongCode':
        throw new WrongCodeError({
          url: error.url,
          attemptsRemaining: body.attemptsRemaining ?? 0,
        });
      case 'expiredCode':
        throw new ExpiredCodeError({ url: error.url });
      case 'tooManyAttempts':
        throw new TooManyAttemptsError({ url: error.url });
      case 'rateLimited':
        throw new RateLimitedError({
          url: error.url,
          retryAtUtc: body.retryAtUtc ?? new Date(Date.now() + 60_000).toISOString(),
        });
      default:
        throw error;
    }
  }

  return {
    async listVenues() {
      const { data } = await client.get<readonly VenueSummary[]>('/venues');
      return data;
    },

    async getVenue(venueId) {
      const { data } = await client.get<VenueSummary>(`/venues/${venueId}`);
      return data;
    },

    async getFloorPlan(branchId) {
      const { data } = await client.get<FloorPlanData>(`/branches/${branchId}/floor`);
      return data;
    },

    async getTableAvailability({ branchId, slotUtc, partySize }) {
      const { data } = await client.get<readonly TableAvailability[]>(
        `/branches/${branchId}/availability`,
        { query: { slotUtc, partySize } },
      );
      return data;
    },

    async requestPhoneCode(phoneE164) {
      try {
        const { data } = await client.post<PhoneChallenge>('/auth/phone/code', { phoneE164 });
        return data;
      } catch (error) {
        return translateVerification(error);
      }
    },

    async verifyPhoneCode({ challengeId, code }) {
      try {
        const { data } = await client.post<VerifiedPhone>('/auth/phone/verify', {
          challengeId,
          code,
        });
        return data;
      } catch (error) {
        return translateVerification(error);
      }
    },

    async createBooking(command: CreateBookingCommand) {
      try {
        const { data } = await client.post<Booking>('/bookings', command, {
          // The same header on every retry is what makes this idempotent
          // server-side; the body carries it too for backends that prefer it.
          headers: { 'idempotency-key': command.commandId },
        });
        return data;
      } catch (error) {
        return translate(error, { tableId: command.tableId });
      }
    },

    async listBookings() {
      const { data } = await client.get<readonly Booking[]>('/bookings');
      return data;
    },

    async getBooking(bookingId) {
      const { data } = await client.get<Booking>(`/bookings/${bookingId}`);
      return data;
    },

    async cancelBooking(bookingId) {
      const { data } = await client.post<Booking>(`/bookings/${bookingId}/cancel`);
      return data;
    },
  };
}
