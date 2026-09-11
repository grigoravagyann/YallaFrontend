import {
  ConcurrencyConflictError,
  ForbiddenError,
  NotTabHostError,
  type ParticipantShare,
  type TabShares,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { settlementModeFailureKey, withHost } from './settle';

function share(participantId: string): ParticipantShare {
  return {
    participantId,
    displayName: participantId,
    isHost: false,
    status: 'approved',
    ownItemsDram: 1000,
    sharedItemsDram: 0,
    absorbedFromRemovedDram: 0,
    personalDram: 1000,
    serviceChargeDram: 100,
    shareDram: 1100,
    paidDram: 0,
  };
}

describe('the settle screen', () => {
  it('marks the host from the tab read, since /shares cannot say', () => {
    const shares: TabShares = {
      kind: 'table',
      tabId: 't1',
      totals: {
        subtotalDram: 2000,
        serviceChargeDram: 200,
        totalDram: 2200,
        paidDram: 0,
        remainingDram: 2200,
      },
      absorbedFromRemovedDram: 0,
      shares: [share('p-host'), share('p-guest')],
      yourShare: share('p-guest'),
    };

    const marked = withHost(shares, 'p-host');

    if (marked.kind !== 'table') throw new Error('expected the table branch');
    expect(marked.shares.map((entry) => entry.isHost)).toEqual([true, false]);
    expect(marked.yourShare?.isHost).toBe(false);
  });

  it('says a mode change after a payment is locked, rather than saying nothing', () => {
    const url = 'https://api.test/api/tabs/t1/settlement-mode';
    expect(settlementModeFailureKey(new ConcurrencyConflictError({ url }))).toBe(
      'settle.mode.locked',
    );
    expect(settlementModeFailureKey(new NotTabHostError({ url }))).toBe('settle.mode.notHost');
    expect(settlementModeFailureKey(new ForbiddenError({ url }))).toBe('settle.mode.closing');
  });
});
