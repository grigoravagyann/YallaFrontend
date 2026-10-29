import type {
  ScanTableCommand,
  ScanResult,
  OpenTabByBookingCommand,
  TabInvite,
  TabParticipantChange,
  TabPermissions,
  WaiterCallReason,
  WaiterCall,
} from '../../contracts/tab';
import { requireClientCommandId, invalidRequest } from '../problems';
import {
  ScanTurnedAwayError,
  BookingNotFoundError,
  BookingEndedError,
  BookingNotActiveError,
  BookingTooEarlyError,
  BookingTableOccupiedError,
  TabAccessEndedError,
  TabAwaitingAdmissionError,
} from '../../contracts/errors';
import type { BillRequestInput } from '../../contracts/ordering';
import {
  type DinerMockContext,
  DISPLAY_NAME_MAX,
  normaliseBookingCode,
  URL_TAG,
  WALK_IN_HOLDBACK_MINUTES,
  type MockGateway,
} from './context';

/** Scanning in and the shared tab, and the waiter's admission answer. */
export function tabsMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'admitTabAsWaiter'
  | 'rejectTabAsWaiter'
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
  const {
    SERVICE_PRESET,
    TURNED_AWAY_MS,
    admissionOf,
    admitOnOpen,
    admitTab,
    billRequestFor,
    bookings,
    changeOf,
    dinerViewOf,
    linkParticipant,
    now,
    orders,
    readableTab,
    requireVerifiedPhone,
    serveFloor,
    turnAway,
    wait,
    world,
  } = ctx;
  return {
    admitTabAsWaiter(tabId) {
      admitTab(tabId, 'waiter');
    },

    rejectTabAsWaiter(tabId) {
      turnAway(tabId);
    },

    // --- Scanning in and the shared tab -----------------------------------

    async scanTableCode(command: ScanTableCommand): Promise<ScanResult> {
      await wait();
      requireClientCommandId(`${URL_TAG}/api/tabs/open`, command.commandId);
      // A waiter just turned this phone away: half an hour before it may scan again.
      if (ctx.turnedAwayAt !== null && now().getTime() - ctx.turnedAwayAt < TURNED_AWAY_MS) {
        throw new ScanTurnedAwayError({
          url: `${URL_TAG}/api/tabs/open`,
          retryAfterUtc: new Date(ctx.turnedAwayAt + TURNED_AWAY_MS).toISOString(),
        });
      }
      serveFloor();
      const result = world.scan(command);
      // A tab this scan opened waits for a waiter unless the scanner proved
      // their number. Joining somebody's tab changes nothing about it.
      if (result.kind === 'tabOpened') admitOnOpen(result.tab.id, 'scan');
      linkParticipant(result.tab);
      return { kind: result.kind, tab: dinerViewOf(result.tab) };
    },

    /**
     * "I'm at my table" — the booking code where the table's token goes.
     *
     * The rules are the server's, in the server's order: whose booking it is,
     * what state it is in, whether the table is being held for it yet. Only
     * then is it the scan, on the table the booking names.
     */
    async openTabByBooking(command: OpenTabByBookingCommand): Promise<ScanResult> {
      await wait();

      const url = `${URL_TAG}/api/tabs/open-by-booking`;
      requireVerifiedPhone(url);
      // After the policy, as there: VerifiedDiner answers before the body is bound.
      requireClientCommandId(url, command.commandId);
      serveFloor();
      const wanted = normaliseBookingCode(command.bookingCode);
      /*
       * Over this diner's own bookings — which *is* the ownership rule, not an
       * approximation of it. Everything in here was made by this device, so a
       * stranger's code is simply absent and gets the answer a code nobody
       * holds gets. That sameness is the point: six characters read out at a
       * door must never confirm that somebody else's booking exists.
       */
      const booking = [...bookings.values()].find((b) => b.code === wanted);
      if (!booking) throw new BookingNotFoundError({ url });

      const facts = {
        url,
        reservationId: booking.id,
        startUtc: booking.slotUtc,
        endUtc: booking.endUtc,
      };

      if (booking.status === 'completed') throw new BookingEndedError(facts);
      if (booking.status !== 'confirmed' && booking.status !== 'seated') {
        throw new BookingNotActiveError({ ...facts, status: booking.status });
      }

      // A seated party is not clock-checked: the venue already put them at the
      // table, and the sitting holds it until staff free it.
      if (booking.status === 'confirmed') {
        const t = now().getTime();
        const earliest = Date.parse(booking.slotUtc) - WALK_IN_HOLDBACK_MINUTES * 60_000;
        if (t < earliest) {
          throw new BookingTooEarlyError({
            ...facts,
            earliestUtc: new Date(earliest).toISOString(),
          });
        }
        // Late is not ended: until the sitting is over the table is theirs.
        if (t >= Date.parse(booking.endUtc)) throw new BookingEndedError(facts);
      }

      // The mock's branches all choose tables, so its bookings always have one.
      if (booking.tableId === null) throw new Error('A mock booking always has a table.');

      // Never a stranger's tab: another party still seated there is refused,
      // and a member of staff frees the table. A replay is the booker's own.
      if (world.occupiedByAnotherParty(booking.tableId, booking.id)) {
        throw new BookingTableOccupiedError({ ...facts, tableLabel: booking.tableLabel });
      }

      const result = world.openAtTable({
        tableId: booking.tableId,
        commandId: command.commandId,
        reservationId: booking.id,
        ...(command.displayName ? { displayName: command.displayName } : {}),
      });

      /*
       * Seated *as the booking*, which is the difference between a floor that
       * knows the party arrived and one that goes on treating a table of people
       * eating as a no-show waiting to happen.
       */
      bookings.set(booking.id, { ...booking, status: 'seated' });

      // The booker is let in: on a tab they opened, and on one a scan opened
      // at their sitting that was waiting for a waiter.
      if (result.kind === 'tabOpened') admitOnOpen(result.tab.id, 'booker');
      else admitTab(result.tab.id, 'booker');

      linkParticipant(result.tab);
      return { kind: result.kind, tab: dinerViewOf(result.tab) };
    },

    async joinTab(command): Promise<ScanResult> {
      await wait();
      serveFloor();
      const result = world.join(command);
      linkParticipant(result.tab);
      return { kind: result.kind, tab: dinerViewOf(result.tab) };
    },

    async leaveTab({ tabId }) {
      await wait();
      world.leave(tabId);
    },

    async createTabInvite(input): Promise<TabInvite> {
      await wait();
      return world.invite(input);
    },

    async setTabDisplayName(tabId, displayName): Promise<TabParticipantChange> {
      await wait();
      const url = `${URL_TAG}/api/tabs/${tabId}/display-name`;
      const tab = readableTab(tabId);
      if (!tab) throw new TabAccessEndedError({ url, tabId, status: 403 });
      // `Guard.NotBlank(displayName, FieldLengths.DisplayName)`: a 400 naming it.
      const name = displayName.trim();
      if (name === '' || name.length > DISPLAY_NAME_MAX) {
        throw invalidRequest(url, 'displayName', `A name is 1 to ${DISPLAY_NAME_MAX} characters.`);
      }
      const updated = world.setDisplayName({ tabId, displayName: name });
      return changeOf(updated, updated.yourParticipantId);
    },

    async approveJoin(input): Promise<TabParticipantChange> {
      await wait();
      return changeOf(world.approve(input), input.participantId);
    },

    async rejectJoin(input): Promise<TabParticipantChange> {
      await wait();
      return changeOf(world.reject(input), input.participantId);
    },

    async removeParticipant(input): Promise<TabParticipantChange> {
      await wait();
      return changeOf(world.remove(input), input.participantId);
    },

    async setParticipantPermissions(input: {
      tabId: string;
      participantId: string;
      permissions: TabPermissions;
      commandId: string;
    }): Promise<TabParticipantChange> {
      await wait();
      return changeOf(world.setPermissions(input), input.participantId);
    },

    async callWaiter(input: {
      tabId: string;
      reason: WaiterCallReason;
      commandId: string;
      bill?: BillRequestInput | undefined;
    }): Promise<WaiterCall> {
      await wait();
      // A repeated command id is the same request, answered as it was — not
      // priced again against a bill that may have moved since.
      const replayed = world.findCall(input.commandId);
      if (replayed) return replayed;
      // Water and napkins, yes — the waiter coming over is how the table gets
      // let in. Never the bill: nothing is on a tab nobody admitted.
      if (input.reason === 'bill' && admissionOf(input.tabId).status === 'awaiting') {
        throw new TabAwaitingAdmissionError({
          url: `${URL_TAG}/api/tabs/${input.tabId}/service-requests`,
          tabId: input.tabId,
        });
      }
      const bill = input.bill ? billRequestFor(input.tabId, input.reason, input.bill) : null;
      const tab = world.get(input.tabId);
      const call = world.call({
        tabId: input.tabId,
        reason: input.reason,
        commandId: input.commandId,
        bill,
        ...(tab ? { participantId: tab.yourParticipantId } : {}),
      });
      // On the tab's stream as the server puts it there: who asked and what
      // for, and no amounts — those reach the floor, not the other phones.
      if (tab) {
        orders.record(tab, 'serviceRequested', 'diner', {
          serviceRequestId: call.id,
          preset: SERVICE_PRESET[input.reason],
          note: null,
          requestedByParticipantId: tab.yourParticipantId,
          billScope: bill ? (bill.scope === 'whole' ? 1 : 2) : null,
          tipPercent: bill?.tipPercent ?? null,
        });
      }
      return call;
    },
  };
}
