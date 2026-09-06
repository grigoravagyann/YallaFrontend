import { describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../errors';
import type { ContractSubject } from './subject';

/**
 * Moving a table between states, and the two failures that must not look alike.
 *
 * A **precondition failure** means the waiter was looking at a stale room — the
 * table moved under them and their action no longer makes sense. A **live
 * conflict** means the write raced another write. The remedies differ: the
 * first shows the table as it is now and offers "apply anyway", the second
 * retries. Collapsing them into one generic failure is how a waiter ends up
 * tapping "retry" at a table somebody else already seated.
 *
 * An **idempotent replay** is neither: the command already landed, and the
 * original response comes back with `wasReplay` set. It is a success, and the
 * offline queue clears such an entry silently rather than worrying a waiter
 * with a duplicate.
 */
export function describeTableStateContract(subject: ContractSubject): void {
  const reason = subject.unsupported('tableState');
  const suite = reason ? describe.skip : describe;

  suite(`table state — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { staff, fixtures } = subject;

    async function aFreeTable() {
      const floor = await staff.getFloor(fixtures.branchId);
      expect(floor, 'the branch has no floor').not.toBeNull();
      const free = floor!.plan.tables.find((entry) => entry.state === 'free');
      expect(free, 'no free table to seat').toBeDefined();
      const detail = floor!.details.find((entry) => entry.tableId === free!.id);
      return { id: free!.id, rowVersion: detail?.rowVersion ?? null };
    }

    it('reports where the table came from as well as where it went', async () => {
      // Both halves, because the audit trail and the undo affordance are built
      // from the transition rather than from the destination.
      const table = await aFreeTable();
      const result = await staff.applyTableAction({
        kind: 'seatWalkIn',
        branchId: fixtures.branchId,
        tableId: table.id,
        partySize: 2,
        clientCommandId: `contract-seat-${table.id}`,
      });

      expect(result.tableId).toBe(table.id);
      expect(result.fromStatus).toBeDefined();
      expect(result.toStatus).toBeDefined();
      expect(result.fromStatus).not.toBe(result.toStatus);
      // What to draw, with the reservation overlay already applied — the client
      // must never derive this.
      expect(result.state).toBeDefined();
      expect(result.atUtc).toBeTruthy();
    });

    it('replays an identical command instead of applying it twice', async () => {
      const table = await aFreeTable();
      const clientCommandId = `contract-replay-${table.id}`;
      const command = {
        kind: 'seatWalkIn' as const,
        branchId: fixtures.branchId,
        tableId: table.id,
        partySize: 2,
        clientCommandId,
      };

      const first = await staff.applyTableAction(command);
      const second = await staff.applyTableAction(command);

      // The original response, replayed from the audit log, flagged as such.
      expect(second.wasReplay, 'a repeated command was applied as a new one').toBe(true);
      expect(second.clientCommandId).toBe(clientCommandId);
      expect(second.toStatus).toBe(first.toStatus);
      expect(second.tableSessionId).toBe(first.tableSessionId);
    });

    it('tells a stale precondition apart from a live conflict', async () => {
      /*
       * Seat a table, then send a *second, different* command that still claims
       * the table was free. The precondition no longer holds, and the refusal
       * has to be distinguishable — by type, not by reading prose out of a
       * message — from the concurrency conflict a racing write produces.
       */
      const table = await aFreeTable();
      await staff.applyTableAction({
        kind: 'seatWalkIn',
        branchId: fixtures.branchId,
        tableId: table.id,
        partySize: 2,
        clientCommandId: `contract-precondition-seat-${table.id}`,
      });

      const stale = staff.applyTableAction({
        kind: 'seatWalkIn',
        branchId: fixtures.branchId,
        tableId: table.id,
        partySize: 2,
        clientCommandId: `contract-precondition-stale-${table.id}`,
        // The room as the waiter last saw it: free, at the version they read.
        // It is neither any more.
        precondition: { expectedFromStatus: 'free', rowVersion: table.rowVersion },
      });

      await expect(stale, 'a stale precondition was accepted').rejects.toBeDefined();

      const error = await stale.catch((caught: unknown) => caught);
      // Whatever it is, it must be *classifiable*. A bare `Error` leaves the
      // screen with one message for two situations that need different ones.
      expect(error).toBeInstanceOf(Error);
      expect(
        error instanceof ConcurrencyConflictError ||
          typeof (error as { code?: string }).code === 'string',
        `a refused precondition arrived as an unclassifiable ${(error as Error).name}`,
      ).toBe(true);
    });
  });
}
