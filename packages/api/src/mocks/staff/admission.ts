import type { TabAwaitingAdmission } from '../../contracts/admission';
import type { StaffTab } from '../../contracts/ordering';
import { TabAdmissionDecidedError } from '../../contracts/errors';
import { ConcurrencyConflictError } from '../../errors';
import type { StaffGateway } from '../../staffGateway';
import { type StaffMockContext, iso } from './context';
import { ProblemCodes } from '../../generated/problemCodes';

/** Tables waiting to be let in. */
export function admissionMethods(
  ctx: StaffMockContext,
): Pick<StaffGateway, 'listTabsAwaitingAdmission' | 'admitTab' | 'rejectTab'> {
  const {
    MOCK_STAFF_ID,
    admissionCommand,
    admit,
    now,
    plan,
    pushEvent,
    record,
    requireSession,
    requireTab,
    serviceRequests,
    settle,
    tables,
    tabs,
    viewTab,
  } = ctx;
  return {
    async listTabsAwaitingAdmission(): Promise<readonly TabAwaitingAdmission[]> {
      requireSession(`/api/branches/${ctx.branchId}/tabs/awaiting-admission`);
      return settle(
        [...tabs.values()]
          .filter((tab) => tab.status === 'open' && tab.admission.status === 'awaiting')
          .sort((a, b) => a.openedAtUtc.localeCompare(b.openedAtUtc))
          .map((tab) => {
            const host = tab.participants.find((person) => person.id === tab.hostParticipantId);
            return {
              tabId: tab.id,
              tableId: tab.tableId,
              tableLabel: tab.tableLabel,
              roomName:
                plan.tables.find((table) => table.id === tab.tableId)?.floorAreaName ?? null,
              openedAtUtc: tab.openedAtUtc,
              hostDisplayName: host?.displayName ?? null,
              participantCount: tab.participants.filter((person) => person.status !== 'removed')
                .length,
              sittingSeatedByScan: tab.seatedByScan,
            };
          }),
      );
    },

    async admitTab({ tabId, clientCommandId }): Promise<StaffTab> {
      requireSession(`/api/tabs/${tabId}/admit`);
      const tab = requireTab(tabId);
      admissionCommand('admit', tabId, clientCommandId);
      if (tab.admission.status === 'rejected') {
        throw new TabAdmissionDecidedError({
          url: `/api/tabs/${tabId}/admit`,
          tabId,
          admission: 'rejected',
        });
      }
      if (tab.admission.status === 'awaiting') admit(tab, 'waiter', now());
      return settle(viewTab(tab));
    },

    async rejectTab({ tabId, clientCommandId }): Promise<StaffTab> {
      requireSession(`/api/tabs/${tabId}/reject`);
      const tab = requireTab(tabId);
      admissionCommand('reject', tabId, clientCommandId);
      if (tab.admission.status === 'admitted') {
        throw new TabAdmissionDecidedError({
          url: `/api/tabs/${tabId}/reject`,
          tabId,
          admission: 'admitted',
        });
      }
      if (tab.admission.status === 'awaiting') {
        // Orders keyed on it: somebody is there. The server refuses the reject.
        if (tab.lines.length > 0) {
          throw new ConcurrencyConflictError({
            url: `/api/tabs/${tabId}/reject`,
            problem: {
              type: '',
              title: 'Conflicting state',
              status: 409,
              detail: 'Orders were taken on this tab; admit it instead.',
              code: ProblemCodes.ConflictingState,
              traceId: 'mock',
            },
          });
        }
        const at = now();
        const state = tables.get(tab.tableId);
        const freesTable = tab.seatedByScan && state?.tabId === tab.id;
        tab.admission = {
          status: 'rejected',
          admittedBecause: null,
          decidedAtUtc: iso(at),
          decidedByStaffId: MOCK_STAFF_ID,
          tableFreed: freesTable,
        };
        tab.status = 'closed';
        tab.closedAtUtc = iso(at);
        // Its calls are answered by the waiter who turned it away.
        for (const [requestId, request] of serviceRequests) {
          if (request.tabId === tab.id && request.acknowledgedAtUtc === null) {
            serviceRequests.set(requestId, { ...request, acknowledgedAtUtc: iso(at) });
          }
        }
        pushEvent(tab, 'tabAdmissionRejected', at);
        if (state && state.tabId === tab.id) {
          const from = state.physicalStatus;
          state.tabId = null;
          if (freesTable) {
            // The scan seated it, so nobody is there: the table goes free.
            state.physicalStatus = 'free';
            state.sessionId = null;
            state.seatedAtUtc = null;
            state.partySize = null;
          }
          state.version += 1;
          record(state, from, at, {
            tabId: tab.id,
            signal: 'tabAdmissionRejected',
            reason: freesTable ? 'phantom tab rejected' : '',
          });
        }
      }
      return settle(viewTab(tab));
    },
  };
}
