import type { ParticipantShare, TabShares } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { settleLead } from './settleLead';

function share(participantId: string, shareDram = 1100): ParticipantShare {
  return {
    participantId,
    displayName: participantId,
    isHost: false,
    status: 'approved',
    ownItemsDram: shareDram - 100,
    sharedItemsDram: 0,
    absorbedFromRemovedDram: 0,
    personalDram: shareDram - 100,
    serviceChargeDram: 100,
    shareDram,
    paidDram: 0,
  };
}

const TABLE: TabShares = {
  kind: 'table',
  tabId: 't1',
  totals: {
    subtotalDram: 2000,
    serviceChargeDram: 200,
    totalDram: 2200,
    paidDram: 500,
    remainingDram: 1700,
  },
  absorbedFromRemovedDram: 0,
  shares: [share('p-host'), share('p-guest')],
  yourShare: share('p-guest'),
};

describe('the number the settle screen leads with', () => {
  it('leads with what is still to pay when the table totals are in the body', () => {
    expect(settleLead(TABLE)).toEqual({
      amount: 1700,
      total: 2200,
      paid: 500,
      labelKey: 'bill.remaining',
    });
  });

  it('falls back to your own share when the host hid the table total', () => {
    const hidden: TabShares = {
      kind: 'yourShareOnly',
      tabId: 't1',
      absorbedFromRemovedDram: 0,
      yourShare: share('p-you', 900),
    };
    expect(settleLead(hidden)).toEqual({
      amount: 900,
      total: null,
      paid: null,
      labelKey: 'bill.yourShare',
    });
  });

  it('leads with nothing before the shares are read, or when hidden and you have no share', () => {
    expect(settleLead(undefined)).toBeNull();
    expect(settleLead(null)).toBeNull();
    expect(
      settleLead({
        kind: 'yourShareOnly',
        tabId: 't1',
        absorbedFromRemovedDram: 0,
        yourShare: null,
      }),
    ).toBeNull();
  });
});
