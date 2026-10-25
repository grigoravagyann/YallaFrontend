import type {
  StaffTab,
  TabLine,
  OpenTabForStaffCommand,
  ReassignHostCommand,
} from '../../contracts/ordering';
import { NotFoundError } from '../../errors';
import { TableNotSeatedError } from '../../contracts/errors';
import { ADMITTED } from '../../contracts/admission';
import type { StaffGateway } from '../../staffGateway';
import { type StaffMockContext, iso, type MockTab } from './context';

/** The tab: reading it, opening one for a party, asking for the bill, the host. */
export function tabMethods(
  ctx: StaffMockContext,
): Pick<
  StaffGateway,
  'getStaffTab' | 'getTabLines' | 'openTabForStaff' | 'beginClosing' | 'reassignHost'
> {
  const {
    MOCK_STAFF_ID,
    id,
    label,
    now,
    openedTabs,
    pushEvent,
    requireTab,
    settle,
    tables,
    tabs,
    viewTab,
    wireLines,
  } = ctx;
  return {
    // --- The tab ------------------------------------------------------------

    async getStaffTab(tabId): Promise<StaffTab | null> {
      const tab = tabs.get(tabId);
      return settle(tab ? viewTab(tab) : null);
    },

    async getTabLines({ tabId }): Promise<readonly TabLine[]> {
      const tab = tabs.get(tabId);
      return settle(tab ? wireLines(tab) : []);
    },

    async openTabForStaff(command: OpenTabForStaffCommand): Promise<StaffTab> {
      const url = `/api/branches/${command.branchId}/tables/${command.tableId}/open-tab`;
      const replayed = openedTabs.get(command.clientCommandId);
      if (replayed) return settle(viewTab(requireTab(replayed)));

      const state = tables.get(command.tableId);
      if (!state) throw new NotFoundError({ url });
      // A tab hangs off a sitting, exactly as on the server: a free or held
      // table has nobody to bill.
      if (state.physicalStatus !== 'occupied') {
        throw new TableNotSeatedError({ url, tableId: command.tableId });
      }
      // Occupied with no sitting: the party paid in full and is still there.
      // The new bill gets a sitting of its own, for the same people.
      if (!state.sessionId) state.sessionId = id('session');

      // Somebody scanned first, or this is the second tap: that tab.
      const existing = state.tabId ? tabs.get(state.tabId) : undefined;
      if (existing) {
        openedTabs.set(command.clientCommandId, existing.id);
        return settle(viewTab(existing));
      }

      // Nobody on it and no host — staff are not participants.
      const tab: MockTab = {
        id: id('tab'),
        tableId: command.tableId,
        tableLabel: label(command.tableId),
        status: 'open',
        openedAtUtc: iso(now()),
        closedAtUtc: null,
        paidDram: 0,
        tipDram: 0,
        lines: [],
        adjustments: [],
        participants: [],
        hostParticipantId: null,
        settlementModeLocked: false,
        sequence: 1,
        events: [],
        // A waiter opened it, standing at the table: admitted on the spot.
        admission: {
          ...ADMITTED,
          admittedBecause: 'openedByStaff',
          decidedAtUtc: iso(now()),
          decidedByStaffId: MOCK_STAFF_ID,
        },
        seatedByScan: false,
      };
      tabs.set(tab.id, tab);
      state.tabId = tab.id;
      openedTabs.set(command.clientCommandId, tab.id);
      return settle(viewTab(tab));
    },

    async beginClosing({ tabId }): Promise<StaffTab> {
      const tab = requireTab(tabId);
      if (tab.status === 'open') tab.status = 'closing';
      pushEvent(tab, 'tabClosing', now());
      return settle(viewTab(tab));
    },

    async reassignHost(command: ReassignHostCommand): Promise<StaffTab> {
      const tab = requireTab(command.tabId);
      if (!tab.participants.some((person) => person.id === command.newHostParticipantId)) {
        throw new NotFoundError({ url: `/api/tabs/${command.tabId}/reassign-host` });
      }
      tab.hostParticipantId = command.newHostParticipantId;
      tab.participants = tab.participants.map((person) => ({
        ...person,
        isHost: person.id === command.newHostParticipantId,
      }));
      pushEvent(tab, 'hostReassigned', now());
      return settle(viewTab(tab));
    },
  };
}
