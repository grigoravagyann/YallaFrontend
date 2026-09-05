import type { ApiClient } from '../client';
import { EndpointNotWiredError } from '../contracts/errors';
import type { Menu } from '../contracts/menu';
import type {
  AbandonTabResult,
  FloorChangePage,
  OrderQueueEntry,
  PaymentResult,
  ServiceRequest,
  StaffFloor,
  StaffTab,
  TabEventPage,
  TableActionCommand,
  TableActionKind,
  TableActionResult,
} from '../contracts/service';
import { NotFoundError } from '../errors';
import type { components } from '../generated/schema';
import type { StaffGateway } from '../staffGateway';
import { floorFromState } from './mapping';
import { staffFloorDetails, staffTabFromView, tableActionResult } from './staffMapping';

type Schemas = components['schemas'];

/** The path segment each action posts to. One place, so none can drift. */
const ACTION_PATHS: Readonly<Record<TableActionKind, string>> = {
  seatWalkIn: 'seat-walk-in',
  seatReservation: 'seat-reservation',
  seatHeldParty: 'seat-held-party',
  hold: 'hold',
  releaseHold: 'release-hold',
  freeTable: 'free',
  outOfService: 'out-of-service',
  returnToService: 'return-to-service',
};

/**
 * The counter screen's real data source.
 *
 * Half of this is wired and half of it is not, and the file says which without
 * needing a changelog. Everything the backend has shipped is a real request;
 * everything it has not throws {@link EndpointNotWiredError}, which the screens
 * render as *"not available yet"*.
 *
 * That is not a placeholder in the usual sense. The alternative — quietly
 * falling back to the mock for the unshipped half — would put invented order
 * lines and invented balances in front of a waiter taking real money, on a
 * screen whose entire job is to be believed. A visibly missing feature costs a
 * conversation; a plausible wrong balance costs the venue.
 */
export function createStaffHttpGateway(client: ApiClient): StaffGateway {
  /** A 404 on a route the backend never registered, said plainly. */
  function notWired(endpoint: string, error: unknown): never {
    if (error instanceof NotFoundError) {
      throw new EndpointNotWiredError({ url: error.url, endpoint });
    }
    throw error;
  }

  function missing(endpoint: string): never {
    throw new EndpointNotWiredError({ url: '', endpoint });
  }

  async function staffTab(tabId: string): Promise<StaffTab | null> {
    try {
      const { data } = await client.get<Schemas['Yalla.Application.Tabs.TabStaffView']>(
        `/api/tabs/${tabId}/participants`,
      );
      return staffTabFromView(data);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  return {
    // --- The floor ----------------------------------------------------------

    async getFloor(branchId): Promise<StaffFloor | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Floor.BranchFloorState']>(
          `/api/branches/${branchId}/tables/floor`,
        );
        return {
          plan: floorFromState(data),
          details: staffFloorDetails(data),
          // No sequence column on the server yet, so every poll is a full read
          // and the stream below reports itself unwired. Zero is the honest
          // starting point rather than a number that implies a stream exists.
          lastSequence: 0,
          asOfUtc: data.asOfUtc,
        };
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async applyTableAction(command: TableActionCommand): Promise<TableActionResult> {
      const path = `/api/branches/${command.branchId}/tables/${command.tableId}/${
        ACTION_PATHS[command.kind]
      }`;

      // Each endpoint takes only the fields its own command needs. Sending a
      // party size to `release-hold` would be rejected by model binding, so the
      // body is assembled per action rather than spread wholesale.
      const body: Record<string, unknown> = { clientCommandId: command.clientCommandId };
      if (command.reason !== undefined) body['reason'] = command.reason;
      if (command.kind === 'seatWalkIn' || command.kind === 'seatHeldParty') {
        body['partySize'] = command.partySize;
      }
      if (command.kind === 'seatReservation') {
        body['reservationId'] = command.reservationId;
        if (command.partySize !== undefined) body['partySize'] = command.partySize;
      }
      if (command.kind === 'seatHeldParty' && command.reservationId !== undefined) {
        body['reservationId'] = command.reservationId;
      }

      const { data } = await client.post<
        Schemas['Yalla.Application.Tables.TableStateChangeResult']
      >(path, body);
      return tableActionResult(data);
    },

    async getFloorChanges(): Promise<FloorChangePage> {
      // `TableStateChange` is written for every transition but carries no
      // sequence column, so there is nothing to page over. The polling stream
      // catches this and falls back to a full floor read.
      return missing('getFloorChanges');
    },

    // --- The tab ------------------------------------------------------------

    getStaffTab: staffTab,

    async getTabEvents(): Promise<TabEventPage> {
      return missing('getTabEvents');
    },

    async beginClosing({ tabId, clientCommandId }): Promise<StaffTab> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
          `/api/tabs/${tabId}/closing`,
          { clientCommandId },
        );
        return staffTabFromView(data);
      } catch (error) {
        return notWired('beginClosing', error);
      }
    },

    async openTabForTable(): Promise<StaffTab> {
      // `POST /api/tabs/open` takes a scanned table code and mints a diner
      // participant. A waiter's session has neither, and forging a code here
      // would put staff on the tab as a guest.
      return missing('openTabForTable');
    },

    // --- Ordering -----------------------------------------------------------

    async getMenu(): Promise<Menu | null> {
      // The menu exists, but only behind the owner's editor routes, which a
      // waiter's token cannot reach. A staff-readable menu is part of the same
      // backend task as ordering.
      return missing('getMenu');
    },

    async placeOrder(): Promise<{ orderId: string; wasReplay: boolean }> {
      return missing('placeOrder');
    },

    async listOrderQueue(): Promise<readonly OrderQueueEntry[]> {
      return missing('listOrderQueue');
    },

    async setOrderStatus(): Promise<OrderQueueEntry> {
      return missing('setOrderStatus');
    },

    // --- Service requests ---------------------------------------------------

    async listServiceRequests(): Promise<readonly ServiceRequest[]> {
      return missing('listServiceRequests');
    },

    async acknowledgeServiceRequest(): Promise<ServiceRequest> {
      return missing('acknowledgeServiceRequest');
    },

    // --- Money --------------------------------------------------------------

    async voidLine(): Promise<StaffTab> {
      return missing('voidLine');
    },

    async compLine(): Promise<StaffTab> {
      return missing('compLine');
    },

    async recordCashPayment(): Promise<PaymentResult> {
      return missing('recordCashPayment');
    },

    async abandonTab(): Promise<AbandonTabResult> {
      return missing('abandonTab');
    },
  };
}
