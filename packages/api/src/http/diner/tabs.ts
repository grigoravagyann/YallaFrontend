import type { RequestOptions } from '../../client';
import type {
  ScanResult,
  TabInvite,
  TabParticipantChange,
  WaiterCall,
  WaiterCallReason,
} from '../../contracts/tab';
import {
  BookingEndedError,
  BookingNotActiveError,
  BookingTableOccupiedError,
  BookingNotFoundError,
  BookingTooEarlyError,
  BranchUnavailableError,
  PhoneNotVerifiedError,
  HostCannotLeaveError,
  InviteExpiredError,
  ServiceRequestRateLimitedError,
  TabClosedError,
  TableOutOfServiceError,
  TabsNotEnabledError,
  UnknownTableCodeError,
} from '../../contracts/errors';
import { ApiError, NotFoundError, UnauthorizedError } from '../../errors';
import type { YallaGateway } from '../../gateway';
import type { components } from '../../generated/schema';
import { admissionRefusal, scanTurnedAway } from '../admissionMapping';
import { dinerTab, participantChange, reservationStatus } from '../dinerMapping';
import { billRequest, billScopeCode, type RequestView } from '../staffMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import type { DinerHttpContext } from './context';

type Schemas = components['schemas'];

/** `ServiceRequestPreset`: 1 Napkins, 2 Water, 3 TheBill, 4 Other. */
const SERVICE_PRESET_CODE: Readonly<Record<WaiterCallReason, 1 | 2 | 3 | 4>> = {
  napkins: 1,
  water: 2,
  bill: 3,
  other: 4,
};

export function tabsMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  | 'scanTableCode'
  | 'openTabByBooking'
  | 'joinTab'
  | 'leaveTab'
  | 'createTabInvite'
  | 'setTabDisplayName'
  | 'approveJoin'
  | 'rejectJoin'
  | 'removeParticipant'
  | 'setParticipantPermissions'
  | 'callWaiter'
> {
  const { client, auth, deviceId, tabAuth, keepTabToken, forgetTabToken, ended, hostError } = ctx;
  /**
   * The table scan and the invitation: anonymous routes, but a signed-in diner's
   * token goes with them, because the server links the tab place to the account
   * that carried one — and review eligibility (K8) counts only a linked place.
   *
   * Still `skipAuth` with the header set by hand, so a refused token can never
   * spend the rotating refresh token, and a session that cannot produce a token
   * scans anonymously rather than not at all.
   */
  async function openingAuth(): Promise<Omit<RequestOptions, 'method' | 'body'>> {
    if (auth?.getState() !== 'signedIn') return { skipAuth: true };
    const token = await auth.getAccessToken().catch(() => null);
    return token
      ? { skipAuth: true, headers: { authorization: `Bearer ${token}` } }
      : { skipAuth: true };
  }

  /**
   * Admitted to a tab: keep its token, and say which of the three it was.
   *
   * `outcome` 1 and 2 opened a tab; 3 put this device on an existing one. A
   * device that scans a tab it is already approved on comes back as 3 with
   * itself approved, and a replay of the same scan says `wasReplay` — both are
   * "already on", not a pending joiner.
   */
  function admitted(result: Schemas['Yalla.Application.Tabs.TabAccessResult']): ScanResult {
    keepTabToken(result.token.tabId, result.token.accessToken);
    const tab = dinerTab(result.tab, new Date().toISOString(), client.baseUrl);
    if (tab.me.status === 'pendingApproval') return { kind: 'joinPending', tab };
    if ((result.outcome === 1 || result.outcome === 2) && !result.wasReplay) {
      return { kind: 'tabOpened', tab };
    }
    return { kind: 'alreadyOn', tab };
  }

  /**
   * A refused scan, as the error the scan screen says something specific about.
   *
   * The out-of-service and settling refusals share the generic
   * `conflicting-state` code, so the table label is read from the server's own
   * sentence — the only place it is. Anything unrecognised is a closed tab,
   * which carries the right next step: ask a member of staff.
   */
  /**
   * A refused "I'm at my table", as the error a screen can explain.
   *
   * Every 404 on this route is about the *booking*, never about a table: what
   * was sent was a booking code, and answering it with "that code does not
   * match a table" is the exact dead end this route was added to end. The 409s
   * it shares with the scan — the table out of service, a tab being settled —
   * fall through to the scan's own reading, so one sentence covers both doors.
   */
  function rethrowBookingTab(error: unknown): never {
    if (error instanceof ApiError) {
      const context = error.problem?.context ?? {};
      const text = (value: unknown): string | undefined =>
        typeof value === 'string' ? value : undefined;
      const facts = {
        url: error.url,
        requestId: error.requestId,
        reservationId: text(context['reservationId']),
        startUtc: text(context['startUtc']),
        endUtc: text(context['endUtc']),
      };

      switch (error.problem?.code) {
        case ProblemCodes.PhoneNotVerified:
          throw new PhoneNotVerifiedError({ url: error.url, requestId: error.requestId });
        case ProblemCodes.BookingNotFound:
          throw new BookingNotFoundError({ url: error.url, requestId: error.requestId });
        case ProblemCodes.BookingTooEarly:
          throw new BookingTooEarlyError({ ...facts, earliestUtc: text(context['earliestUtc']) });
        case ProblemCodes.BookingEnded:
          throw new BookingEndedError(facts);
        case ProblemCodes.BookingTableOccupied:
          throw new BookingTableOccupiedError({
            ...facts,
            tableLabel: text(context['tableLabel']),
          });
        case ProblemCodes.BookingNotActive:
          throw new BookingNotActiveError({
            ...facts,
            // The wire sends the number; the copy needs to know *which*
            // cancellation, because "you cancelled" and "the venue cancelled"
            // are not the same news to the person reading it.
            status:
              typeof context['status'] === 'number'
                ? reservationStatus(context['status'])
                : undefined,
          });
        default:
          break;
      }

      if (error instanceof NotFoundError) {
        throw new BookingNotFoundError({ url: error.url, requestId: error.requestId });
      }
    }

    rethrowScan(error);
  }

  function rethrowScan(error: unknown): never {
    if (error instanceof NotFoundError) {
      throw new UnknownTableCodeError({ url: error.url });
    }
    // Turned away a moment ago: before the generic 409s below.
    const turnedAway = scanTurnedAway(error);
    if (turnedAway) throw turnedAway;
    if (error instanceof ApiError) {
      const code = error.problem?.code;
      if (code === ProblemCodes.FeatureNotEnabled) {
        throw new TabsNotEnabledError({ url: error.url, requestId: error.requestId });
      }
      if (code === ProblemCodes.BranchUnavailable) {
        throw new BranchUnavailableError({ url: error.url, requestId: error.requestId });
      }
      if (error.status === 409) {
        const label = /Table (.+?) is out of service/u.exec(error.problem?.detail ?? '')?.[1];
        if (label) throw new TableOutOfServiceError({ url: error.url, tableLabel: label });
        throw new TabClosedError({ url: error.url, tabId: '' });
      }
    }
    throw error;
  }

  async function participantAction(
    tabId: string,
    participantId: string,
    action: 'approve' | 'reject' | 'remove',
  ): Promise<TabParticipantChange> {
    try {
      const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabParticipantView']>(
        `/api/tabs/${tabId}/participants/${participantId}/${action}`,
        undefined,
        await tabAuth(tabId),
      );
      return participantChange(data);
    } catch (error) {
      throw hostError(error, tabId);
    }
  }

  return {
    // --- The shared tab ---------------------------------------------------------
    //
    // Real, all of it. The table scan and the invitation need no account and
    // hand back a participant token scoped to that one tab; every call on the
    // tab after that carries that token, never the phone's diner session. These
    // were all answered by the mock, which is why no real tab was ever reached.

    /**
     * `POST /api/tabs/open`: the table's QR, this device, and the scan's command
     * id — plus the diner's token when signed in, see {@link openingAuth}.
     */
    async scanTableCode(command): Promise<ScanResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabAccessResult']>(
          '/api/tabs/open',
          {
            qrToken: command.tableCode,
            deviceId: await deviceId(),
            clientCommandId: command.commandId,
            ...(command.displayName ? { displayName: command.displayName } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.OpenTabRequest'],
          await openingAuth(),
        );
        return admitted(data);
      } catch (error) {
        rethrowScan(error);
      }
    },

    /**
     * `POST /api/tabs/open-by-booking`: the diner's booking code, this device,
     * and the same command id semantics as the scan.
     *
     * The one opening that **requires** an account. The scan works without a
     * session; this route answers only to the account that made the booking,
     * so it goes out under the diner's own token — and must never be given
     * `skipAuth`, which would turn every attempt into a 401.
     */
    async openTabByBooking(command): Promise<ScanResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabAccessResult']>(
          '/api/tabs/open-by-booking',
          {
            bookingCode: command.bookingCode,
            deviceId: await deviceId(),
            clientCommandId: command.commandId,
            ...(command.displayName ? { displayName: command.displayName } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.OpenTabByBookingRequest'],
        );
        return admitted(data);
      } catch (error) {
        rethrowBookingTab(error);
      }
    },

    /** `POST /api/tabs/join`: a host's invitation — never the table scan. */
    async joinTab(command): Promise<ScanResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabAccessResult']>(
          '/api/tabs/join',
          {
            joinToken: command.joinToken,
            deviceId: await deviceId(),
            ...(command.displayName ? { displayName: command.displayName } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.JoinTabRequest'],
          await openingAuth(),
        );
        return admitted(data);
      } catch (error) {
        // Unknown, revoked or older than thirty minutes all answer 401.
        if (error instanceof UnauthorizedError || error instanceof NotFoundError) {
          throw new InviteExpiredError({ url: error.url, requestId: error.requestId });
        }
        if (error instanceof ApiError && error.status === 409) {
          throw new TabClosedError({ url: error.url, tabId: '' });
        }
        throw error;
      }
    },

    /**
     * `POST /api/tabs/{tabId}/leave`. A guest comes off the tab; a host hands it
     * to the approved guest who has been on it longest, and with nobody to hand
     * it to the server refuses with 409.
     */
    async leaveTab({ tabId }): Promise<void> {
      try {
        await client.post(`/api/tabs/${tabId}/leave`, undefined, await tabAuth(tabId));
        forgetTabToken(tabId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          throw new HostCannotLeaveError({ url: error.url, tabId, requestId: error.requestId });
        }
        throw ended(error, tabId);
      }
    },

    /**
     * `POST /api/tabs/{tabId}/join-tokens`. Each call issues a fresh invitation
     * and revokes the last, which is what "new link" is.
     */
    async createTabInvite({ tabId }): Promise<TabInvite> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabJoinTokenResult']>(
          `/api/tabs/${tabId}/join-tokens`,
          undefined,
          await tabAuth(tabId),
        );
        return {
          tabId: data.tabId,
          token: data.token,
          url: data.shareUrl,
          expiresAtUtc: data.expiresAtUtc,
        };
      } catch (error) {
        throw hostError(error, tabId);
      }
    },

    /**
     * `POST /api/tabs/{tabId}/display-name`, under this phone's participant
     * token. Not a host action: anybody on the tab names themselves. A 400 or
     * 422 for a blank or overlong name stays the client's `ValidationError`.
     */
    async setTabDisplayName(tabId, displayName): Promise<TabParticipantChange> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabParticipantView']>(
          `/api/tabs/${tabId}/display-name`,
          { displayName } satisfies Schemas['Yalla.Api.Endpoints.SetDisplayNameRequest'],
          await tabAuth(tabId),
        );
        return participantChange(data);
      } catch (error) {
        throw ended(error, tabId, [401, 403]);
      }
    },

    approveJoin: ({ tabId, participantId }) => participantAction(tabId, participantId, 'approve'),
    rejectJoin: ({ tabId, participantId }) => participantAction(tabId, participantId, 'reject'),
    removeParticipant: ({ tabId, participantId }) =>
      participantAction(tabId, participantId, 'remove'),

    async setParticipantPermissions({
      tabId,
      participantId,
      permissions,
    }): Promise<TabParticipantChange> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabParticipantView']>(
          `/api/tabs/${tabId}/participants/${participantId}/permissions`,
          {
            canOrder: permissions.canOrder,
            canSeeTableTotal: permissions.canSeeTableTotal,
            canPay: permissions.canPay,
          } satisfies Schemas['Yalla.Api.Endpoints.SetParticipantPermissionsRequest'],
          await tabAuth(tabId),
        );
        return participantChange(data);
      } catch (error) {
        throw hostError(error, tabId);
      }
    },

    /**
     * Raising a hand, for real.
     *
     * `RaiseServiceRequest` takes the preset and an optional note and nothing
     * else; the response is a `ServiceRequestView`, which carries far more than
     * a diner needs — the table label, the waiting minutes, the acknowledgement
     * — because the same view feeds the counter screen's queue. Only the four
     * fields `WaiterCall` names are read.
     */
    async callWaiter({ tabId, reason, bill }): Promise<WaiterCall> {
      // Sent only with a bill: the server refuses either on any other preset.
      const body = {
        preset: SERVICE_PRESET_CODE[reason],
        ...(bill ? { billScope: billScopeCode(bill.scope), tipPercent: bill.tipPercent } : {}),
      } satisfies Schemas['Yalla.Api.Endpoints.RaiseServiceRequest'];
      let data: RequestView;
      try {
        ({ data } = await client.post<RequestView>(
          `/api/tabs/${tabId}/service-requests`,
          body,
          await tabAuth(tabId),
        ));
      } catch (error) {
        // Not a failure to report: the table has asked several times in a short
        // window, and a waiter already knows.
        if (
          error instanceof ApiError &&
          error.problem?.code === ProblemCodes.ServiceRequestRateLimited
        ) {
          const window = error.problem.context?.['windowMinutes'];
          throw new ServiceRequestRateLimitedError({
            url: error.url,
            windowMinutes: typeof window === 'number' ? window : null,
            requestId: error.requestId,
          });
        }
        // The bill, on a tab a waiter has not let in yet: nothing is on it.
        throw admissionRefusal(error, tabId) ?? ended(error, tabId);
      }
      return {
        id: data.serviceRequestId,
        tabId: data.tabId,
        reason,
        requestedAtUtc: data.createdAtUtc,
        // The server's amounts for the scope asked about, so the sheet's
        // success state says the number the waiter is bringing.
        bill: billRequest(data),
      };
    },
  };
}
