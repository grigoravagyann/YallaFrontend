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
  EndpointNotWiredError,
  ExpiredCodeError,
  LeadTimeExceededError,
  NotTabHostError,
  RateLimitedError,
  TabClosedError,
  TableOutOfServiceError,
  TableTakenError,
  TooManyAttemptsError,
  UnknownTableCodeError,
  WrongCodeError,
} from '../contracts/errors';
import type { Menu } from '../contracts/menu';
import type {
  ScanResult,
  ScanTableCommand,
  TabInvite,
  TableTab,
  WaiterCall,
} from '../contracts/tab';
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

  /**
   * Scan failures are all "expected outcome" shaped: the diner did nothing
   * wrong and each one has a different next step, so each gets its own type
   * rather than a status code the screen has to re-interpret.
   */
  function translateScan(error: unknown): never {
    if (!(error instanceof ApiError)) throw error;
    const body = error.body as { code?: string; tableLabel?: string; tabId?: string } | undefined;

    switch (body?.code) {
      case 'tableOutOfService':
        throw new TableOutOfServiceError({
          url: error.url,
          tableLabel: body.tableLabel ?? '',
        });
      case 'tabClosed':
        throw new TabClosedError({ url: error.url, tabId: body.tabId ?? '' });
      case 'unknownTableCode':
        throw new UnknownTableCodeError({ url: error.url });
      default:
        // A 404 on this endpoint means the code, not the endpoint.
        if (error.status === 404) throw new UnknownTableCodeError({ url: error.url });
        throw error;
    }
  }

  /** Host-only actions share one failure worth naming. */
  function translateHostAction(error: unknown): never {
    if (error instanceof ApiError && error.status === 403) {
      throw new NotTabHostError({ url: error.url });
    }
    throw error;
  }

  /** Every host action posts, carries its command id, and returns the whole tab. */
  async function hostAction(
    path: string,
    commandId: string,
    body?: Record<string, unknown>,
  ): Promise<TableTab> {
    try {
      const { data } = await client.post<TableTab>(
        path,
        { commandId, ...body },
        {
          headers: { 'idempotency-key': commandId },
        },
      );
      return data;
    } catch (error) {
      return translateHostAction(error);
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

    // --- Scanning in and the shared tab -----------------------------------

    async scanTableCode(command: ScanTableCommand): Promise<ScanResult> {
      try {
        const { data } = await client.post<ScanResult>('/tabs/scan', command, {
          // The same key on every retry is what stops a double scan from
          // opening two tabs; the body carries the id too.
          headers: { 'idempotency-key': command.commandId },
        });
        return data;
      } catch (error) {
        return translateScan(error);
      }
    },

    async getTab(tabId) {
      const { data } = await client.get<TableTab>(`/tabs/${tabId}`);
      return data;
    },

    async leaveTab({ tabId, commandId }) {
      await client.post(
        `/tabs/${tabId}/leave`,
        { commandId },
        {
          headers: { 'idempotency-key': commandId },
        },
      );
    },

    async getBranchMenu(branchId): Promise<Menu | null> {
      const { data } = await client.get<Menu>(`/branches/${branchId}/menu`);
      return data;
    },

    async createTabInvite({ tabId, commandId }): Promise<TabInvite> {
      const { data } = await client.post<TabInvite>(
        `/tabs/${tabId}/invites`,
        { commandId },
        {
          headers: { 'idempotency-key': commandId },
        },
      );
      return data;
    },

    approveJoin({ tabId, participantId, commandId }) {
      return hostAction(`/tabs/${tabId}/participants/${participantId}/approve`, commandId);
    },

    rejectJoin({ tabId, participantId, commandId }) {
      return hostAction(`/tabs/${tabId}/participants/${participantId}/reject`, commandId);
    },

    removeParticipant({ tabId, participantId, commandId }) {
      return hostAction(`/tabs/${tabId}/participants/${participantId}/remove`, commandId);
    },

    setParticipantPermissions({ tabId, participantId, permissions, commandId }) {
      return hostAction(`/tabs/${tabId}/participants/${participantId}/permissions`, commandId, {
        permissions,
      });
    },

    setTabDefaultPermissions({ tabId, permissions, commandId }) {
      return hostAction(`/tabs/${tabId}/default-permissions`, commandId, { permissions });
    },

    // TODO(prompt-7): wire to POST /tabs/{tabId}/waiter-calls once the backend
    // ships it. Throwing a typed error is deliberate — a silent no-op here
    // would let the UI show a diner that a waiter is coming when nobody was
    // ever told, which is strictly worse than telling them to raise a hand.
    callWaiter(): Promise<WaiterCall> {
      return Promise.reject(
        new EndpointNotWiredError({ url: '/tabs/{tabId}/waiter-calls', endpoint: 'callWaiter' }),
      );
    },
  };
}
