import { NetworkError, NotTabHostError, type DinerTabView } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { canInvite, inviteFailure } from './invite';

/**
 * Handing out an invitation, which only the host may do.
 *
 * The server's `POST /api/tabs/{id}/join-tokens` is host-only
 * (`RequireHost(tab, actingParticipantId, "Inviting others")`). The tab screen
 * offered Invite to every approved guest, and the invite screen answered the 403
 * with "try again" and a retry that could never work. The mock minted the link
 * for anybody, which is how nobody saw it.
 */

const host: DinerTabView['me'] = {
  participantId: 'p1',
  displayName: 'Ani',
  role: 'host',
  status: 'approved',
  canOrder: true,
  canOrderNow: true,
  canPay: true,
  canSeeTableTotal: true,
  joinedAtUtc: '2026-09-11T09:00:00Z',
};

describe('who is offered Invite', () => {
  it('offers it to whoever opened the tab', () => {
    expect(canInvite({ me: host })).toBe(true);
  });

  it('does not offer it to an approved guest, whom the server refuses', () => {
    expect(canInvite({ me: { ...host, role: 'guest', canPay: false } })).toBe(false);
  });

  it('does not offer it to somebody still waiting to be let on', () => {
    expect(canInvite({ me: { ...host, role: 'guest', status: 'pendingApproval' } })).toBe(false);
  });
});

describe('an invitation that did not come back', () => {
  const url = 'https://api.test/api/tabs/t1/join-tokens';

  it('says only the host can invite, and offers no retry that cannot work', () => {
    expect(inviteFailure(new NotTabHostError({ url }))).toEqual({
      key: 'invite.notHost',
      retry: false,
    });
  });

  it('offers a retry for a failure that trying again can fix', () => {
    expect(inviteFailure(new NetworkError({ url }))).toEqual({ key: 'invite.error', retry: true });
  });
});
