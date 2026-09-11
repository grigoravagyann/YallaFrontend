import type { DinerTabView, TabRosterEntry } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { onTab, permissionDraft, roster, waitingToJoin } from './roster';

/**
 * Who is at the table, read off the tab the server sent.
 *
 * The roster used to come from the mock's `TableTab`, which carried `isYou` and
 * statuses named `active`/`pending`. The server's roster carries neither: its
 * statuses are `approved`, `pendingApproval` and `removed`, and "you" is
 * whoever `me.participantId` names. Read against the real shape, the old
 * filters found nobody on the tab and nobody waiting.
 */

function entry(participantId: string, overrides: Partial<TabRosterEntry> = {}): TabRosterEntry {
  return {
    participantId,
    displayName: participantId,
    role: 'guest',
    status: 'approved',
    ...overrides,
  };
}

function view(
  participants: readonly TabRosterEntry[],
  me = 'p-host',
): Pick<DinerTabView, 'participants' | 'me'> {
  return {
    participants,
    me: {
      participantId: me,
      displayName: 'Ani',
      role: 'host',
      status: 'approved',
      canOrder: true,
      canOrderNow: true,
      canPay: true,
      canSeeTableTotal: true,
      joinedAtUtc: '2026-09-11T09:00:00Z',
    },
  };
}

describe('the roster', () => {
  const people = roster(
    view([
      entry('p-host', { role: 'host' }),
      entry('p-davit'),
      entry('p-nare', { status: 'pendingApproval' }),
      entry('p-gone', { status: 'removed' }),
    ]),
  );

  it('marks this phone by the id the tab read names, not by a flag the server never sends', () => {
    expect(people.filter((p) => p.isYou).map((p) => p.participantId)).toEqual(['p-host']);
  });

  it('counts the approved as on the tab', () => {
    expect(onTab(people).map((p) => p.participantId)).toEqual(['p-host', 'p-davit']);
  });

  it('lists the people asking to join, and nobody taken off', () => {
    expect(waitingToJoin(people).map((p) => p.participantId)).toEqual(['p-nare']);
  });
});

describe('the permission editor for someone this phone was never told about', () => {
  it('uses what the server said when this phone has been told', () => {
    const known = { canOrder: false, canSeeTableTotal: true, canPay: true };
    expect(permissionDraft(known, true)).toEqual({ permissions: known, known: true });
  });

  it('starts from the table default otherwise, and says it is a starting point', () => {
    // The roster carries no flags. The draft is only sent when the host saves
    // all three, so nothing is changed on a guess.
    expect(permissionDraft(undefined, true)).toEqual({
      permissions: { canOrder: true, canSeeTableTotal: false, canPay: false },
      known: false,
    });
    expect(permissionDraft(undefined, false).permissions.canSeeTableTotal).toBe(true);
  });
});
