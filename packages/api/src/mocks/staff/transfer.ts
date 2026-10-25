import {
  type TransferTabCommand,
  type TabTransferResult,
  TAB_NOT_TRANSFERABLE_CODE,
  SERVING_ROLES,
  TRANSFER_TARGET_INELIGIBLE_CODE,
  type TabTransferTarget,
} from '../../contracts/activity';
import { requireClientCommandId } from '../problems';
import {
  NotFoundError,
  ConcurrencyConflictError,
  InvalidTransitionError,
  ForbiddenError,
} from '../../errors';
import { mockRosterShiftsAround } from '../staffRosterMock';
import type { StaffGateway } from '../../staffGateway';
import { type StaffMockContext, iso } from './context';

/** Handing a table to somebody else. */
export function transferMethods(
  ctx: StaffMockContext,
): Pick<StaffGateway, 'transferTab' | 'listTransferTargets'> {
  const {
    branchPeople,
    now,
    requireSession,
    serverOf,
    settle,
    tabServers,
    tables,
    tabs,
    transfers,
  } = ctx;
  return {
    async transferTab(command: TransferTabCommand): Promise<TabTransferResult> {
      const url = `/api/tabs/${command.tabId}/transfer`;
      requireSession(url);
      requireClientCommandId(url, command.clientCommandId);
      const replay = transfers.get(command.clientCommandId);
      if (replay) return settle(replay);
      const tab = tabs.get(command.tabId);
      if (!tab) throw new NotFoundError({ url });
      if (tab.status === 'closed' || tab.status === 'abandoned') {
        // As the server: 409 `tab-not-transferable`, the sitting is over.
        throw new ConcurrencyConflictError({
          url,
          problem: {
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            detail:
              'This table’s bill is closed and its party has gone; there is nothing to hand over.',
            code: TAB_NOT_TRANSFERABLE_CODE,
            traceId: 'mock',
            context: { tabId: tab.id, status: tab.status === 'closed' ? 3 : 4 },
          },
        });
      }
      const member = branchPeople().find((candidate) => candidate.id === command.toStaffMemberId);
      const reason = !member
        ? 'not-found'
        : !member.isActive
          ? 'inactive'
          : !SERVING_ROLES.includes(member.role)
            ? 'does-not-serve'
            : null;
      if (!member || reason) {
        // As the server: 422 `transfer-target-ineligible`, saying why.
        throw new InvalidTransitionError({
          url,
          problem: {
            type: 'about:blank',
            title: 'Unprocessable',
            status: 422,
            detail: 'That person cannot take tables at this branch.',
            code: TRANSFER_TARGET_INELIGIBLE_CODE,
            traceId: 'mock',
            context: { staffMemberId: command.toStaffMemberId, reason },
          },
        });
      }
      const target = member;
      const previous = serverOf(tab.id);
      if (previous?.id === target.id) {
        // Already theirs: answered as done, nothing written.
        return settle({
          tabId: tab.id,
          server: { staffMemberId: target.id, name: target.fullName },
          previousServer: { staffMemberId: previous.id, name: previous.name },
          transferredAtUtc: iso(now()),
          tableSessionId: null,
          tableLabel: tab.tableLabel,
          wasReplay: true,
        });
      }
      tabServers.set(tab.id, { id: target.id, name: target.fullName });
      const result: TabTransferResult = {
        tabId: tab.id,
        server: { staffMemberId: target.id, name: target.fullName },
        previousServer: previous ? { staffMemberId: previous.id, name: previous.name } : null,
        transferredAtUtc: iso(now()),
        tableSessionId: null,
        tableLabel: tab.tableLabel,
        wasReplay: false,
      };
      transfers.set(command.clientCommandId, result);
      return settle(result);
    },

    async listTransferTargets(tabId: string): Promise<readonly TabTransferTarget[]> {
      const url = `/api/tabs/${tabId}/transfer-targets`;
      requireSession(url);
      const tab = tabs.get(tabId);
      // As the server: a tab that does not exist is a 403, its branch scope finds nothing.
      if (!tab) throw new ForbiddenError({ url });
      const at = now();
      const current = serverOf(tab.id)?.id ?? null;
      const people = branchPeople().filter(
        (member) => SERVING_ROLES.includes(member.role) && member.id !== current,
      );
      const onShift = new Set(
        mockRosterShiftsAround(people, ctx.branchId, at)
          .filter(
            (shift) =>
              Date.parse(shift.startsAtUtc) <= at.getTime() &&
              at.getTime() < Date.parse(shift.endsAtUtc),
          )
          .map((shift) => shift.staffMemberId),
      );
      /** Live sittings each person is the waiter of: the "3 tables now". */
      const loads = new Map<string, number>();
      for (const state of tables.values()) {
        const live = state.tabId ? tabs.get(state.tabId) : undefined;
        if (!live || live.status === 'closed' || live.status === 'abandoned') continue;
        const holder = serverOf(live.id);
        if (holder) loads.set(holder.id, (loads.get(holder.id) ?? 0) + 1);
      }
      return settle(
        people
          .map((member) => ({
            staffMemberId: member.id,
            name: member.fullName,
            role: member.role,
            onShiftNow: onShift.has(member.id),
            openTables: loads.get(member.id) ?? 0,
          }))
          .sort(
            (a, b) => Number(b.onShiftNow) - Number(a.onShiftNow) || a.name.localeCompare(b.name),
          ),
      );
    },
  };
}
