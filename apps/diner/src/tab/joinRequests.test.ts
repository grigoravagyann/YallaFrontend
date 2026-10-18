import type { TabRosterEntry } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  joinBanner,
  joinLine,
  joinTitle,
  joinToast,
  newlyWaiting,
  stillAnswered,
  waitingIds,
} from './joinRequests';
import type { RosterPerson } from './roster';

/**
 * The host's join banner, as pure decisions: who it is about, what it says,
 * and when the phone gives a tap — once per person who starts waiting, never
 * once per poll.
 */

function person(
  participantId: string,
  displayName: string,
  overrides: Partial<TabRosterEntry> & { isYou?: boolean } = {},
): RosterPerson {
  return {
    participantId,
    displayName,
    role: 'guest',
    status: 'pendingApproval',
    photo: null,
    isYou: false,
    ...overrides,
  };
}

const HOST = person('p-host', 'Aram', { role: 'host', status: 'approved', isYou: true });
const ANNA = person('p-anna', 'Anna');
const GOR = person('p-gor', 'Gor');
// The roster carries an empty name for somebody who gave none.
const UNNAMED = person('p-guest', '');
const ON_TAB = person('p-nare', 'Nare', { status: 'approved' });

describe('who the banner is about', () => {
  it('is nobody when nobody is waiting', () => {
    expect(joinBanner([HOST, ON_TAB])).toBeNull();
  });

  it('is the one person waiting, by themselves', () => {
    expect(joinBanner([HOST, ON_TAB, ANNA])).toEqual({ kind: 'one', person: ANNA });
  });

  it('is everyone waiting, once there are several', () => {
    expect(joinBanner([HOST, ANNA, GOR, UNNAMED])).toEqual({
      kind: 'several',
      people: [ANNA, GOR, UNNAMED],
    });
  });

  it('leaves out whoever the host just answered, before the tab read catches up', () => {
    // The server said yes; the roster on screen still says "waiting" until the
    // refetch lands. The banner moves on at once rather than offering Approve
    // a second time.
    expect(joinBanner([HOST, ANNA, GOR], new Set(['p-anna']))).toEqual({
      kind: 'one',
      person: GOR,
    });
    expect(joinBanner([HOST, ANNA], new Set(['p-anna']))).toBeNull();
  });
});

describe('when the phone taps', () => {
  it('stays still on the first look: whoever was already waiting is not news', () => {
    expect(newlyWaiting(null, waitingIds([HOST, ANNA]))).toEqual([]);
  });

  it('taps for somebody who started waiting since the last render', () => {
    const before = waitingIds([HOST]);
    expect(newlyWaiting(before, waitingIds([HOST, ANNA]))).toEqual(['p-anna']);
  });

  it('does not tap again on a poll that brings back the same people', () => {
    const before = waitingIds([HOST, ANNA]);
    expect(newlyWaiting(before, waitingIds([HOST, ANNA]))).toEqual([]);
  });

  it('taps for the newcomer only, while somebody else is still waiting', () => {
    const before = waitingIds([HOST, ANNA]);
    expect(newlyWaiting(before, waitingIds([HOST, ANNA, GOR]))).toEqual(['p-gor']);
  });

  it('does not tap when somebody stops waiting', () => {
    const before = waitingIds([HOST, ANNA, GOR]);
    expect(newlyWaiting(before, waitingIds([HOST, GOR]))).toEqual([]);
  });

  it('counts only the people waiting, not the people on the tab', () => {
    expect([...waitingIds([HOST, ON_TAB, ANNA])]).toEqual(['p-anna']);
  });
});

describe('forgetting an answer', () => {
  it('keeps an answer while the read still shows them waiting, and drops it after', () => {
    const answered = new Set(['p-anna']);
    expect([...stillAnswered(answered, waitingIds([HOST, ANNA]))]).toEqual(['p-anna']);

    // Approved on the next read: the answer has done its job. Kept, it would
    // hide them for good if they ever came back to ask again.
    const approved = person('p-anna', 'Anna', { status: 'approved' });
    expect([...stillAnswered(answered, waitingIds([HOST, approved]))]).toEqual([]);
  });

  it('hands back the same set when nothing changed, so React does not re-render', () => {
    const answered = new Set(['p-anna']);
    expect(stillAnswered(answered, waitingIds([HOST, ANNA]))).toBe(answered);
  });
});

describe('what the banner says', () => {
  it('names the one person waiting', () => {
    expect(joinTitle({ kind: 'one', person: ANNA })).toEqual({
      key: 'tab.joinRequest.one',
      params: { name: 'Anna' },
    });
  });

  it('says "a guest" for somebody who gave no name', () => {
    expect(joinTitle({ kind: 'one', person: UNNAMED })).toEqual({
      key: 'tab.joinRequest.oneUnnamed',
    });
    // A name of spaces is no name.
    expect(joinTitle({ kind: 'one', person: person('p-x', '   ') })).toEqual({
      key: 'tab.joinRequest.oneUnnamed',
    });
  });

  it('counts several people', () => {
    expect(joinTitle({ kind: 'several', people: [ANNA, GOR, UNNAMED] })).toEqual({
      key: 'tab.joinRequest.several',
      params: { count: 3 },
    });
  });

  const line = {
    namesMore: (names: string, more: number) => `${names} +${more}`,
    waitingOne: 'Waiting for your answer',
    waitingSeveral: 'They are waiting for your answer',
  };

  it('says under one person that they are waiting on the host', () => {
    expect(joinLine({ kind: 'one', person: ANNA }, line)).toBe('Waiting for your answer');
  });

  it('names the first two of several and folds the rest into "+n", as the people card does', () => {
    expect(joinLine({ kind: 'several', people: [ANNA, GOR] }, line)).toBe('Anna, Gor');
    expect(joinLine({ kind: 'several', people: [ANNA, GOR, UNNAMED] }, line)).toBe('Anna, Gor +1');
    // An unnamed guest is folded, never listed as "Guest".
    expect(joinLine({ kind: 'several', people: [UNNAMED, ANNA] }, line)).toBe('Anna +1');
  });

  it('says they are waiting when not one of several gave a name', () => {
    expect(joinLine({ kind: 'several', people: [UNNAMED, person('p-y', '')] }, line)).toBe(
      'They are waiting for your answer',
    );
  });
});

describe('what the host is told after answering', () => {
  it('names the person let on', () => {
    expect(joinToast('approved', [ANNA])).toEqual({
      key: 'tab.joinRequest.approved',
      params: { name: 'Anna' },
    });
    expect(joinToast('approved', [UNNAMED])).toEqual({ key: 'tab.joinRequest.approvedUnnamed' });
  });

  it('counts everyone let on at once', () => {
    expect(joinToast('approved', [ANNA, GOR, UNNAMED])).toEqual({
      key: 'tab.joinRequest.approvedAll',
      params: { count: 3 },
    });
  });

  it('says plainly when somebody was not let on', () => {
    expect(joinToast('rejected', [ANNA])).toEqual({ key: 'tab.joinRequest.rejected' });
  });
});
