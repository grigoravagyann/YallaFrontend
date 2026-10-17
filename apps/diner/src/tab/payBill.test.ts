import {
  ServiceRequestRateLimitedError,
  TabAccessEndedError,
  ValidationError,
  type ParticipantShare,
  type TabShares,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIP_PERCENT,
  TIP_PERCENTS,
  billRequestFailure,
  othersHaveShares,
  payPreview,
  payScopes,
  pickScope,
  tipOn,
  type PayPreview,
} from './payBill';

/**
 * The pay sheet's numbers. Every row comes from the shares read; the tip is
 * the one figure worked out here, as a preview of what the server will
 * confirm. The rows must add up to what is asked for, or the sheet tells a
 * table one number and the waiter brings another.
 */

function share(overrides: Partial<ParticipantShare> = {}): ParticipantShare {
  return {
    participantId: 'p-me',
    displayName: 'Anna',
    isHost: true,
    status: 'approved',
    ownItemsDram: 9000,
    sharedItemsDram: 600,
    absorbedFromRemovedDram: 0,
    personalDram: 9600,
    serviceChargeDram: 960,
    shareDram: 10560,
    paidDram: 0,
    ...overrides,
  };
}

function table(
  totals: Partial<Extract<TabShares, { kind: 'table' }>['totals']> = {},
  yourShare: ParticipantShare | null = share(),
): TabShares {
  return {
    kind: 'table',
    tabId: 't1',
    totals: {
      subtotalDram: 14000,
      serviceChargeDram: 1400,
      totalDram: 15400,
      paidDram: 0,
      remainingDram: 15400,
      ...totals,
    },
    absorbedFromRemovedDram: 0,
    shares: yourShare ? [yourShare] : [],
    yourShare,
  };
}

function hidden(yourShare: ParticipantShare | null = share()): TabShares {
  return { kind: 'yourShareOnly', tabId: 't1', absorbedFromRemovedDram: 0, yourShare };
}

/** The rows, signed as drawn, summed: what the sheet claims the amount is. */
function rowsSum(preview: PayPreview): number {
  return preview.lines
    .filter((line) => line.kind !== 'tip')
    .reduce(
      (sum, line) =>
        sum + (line.kind === 'paid' || line.kind === 'discount' ? -1 : 1) * line.amountDram,
      0,
    );
}

describe('what the pay sheet offers', () => {
  it('offers the whole bill and my share to somebody shown the total, whole first', () => {
    expect(payScopes(table())).toEqual(['whole', 'mine']);
    expect(pickScope(payScopes(table()), null)).toBe('whole');
  });

  it('offers only my share when the host keeps the table total hidden', () => {
    expect(payScopes(hidden())).toEqual(['mine']);
    expect(pickScope(payScopes(hidden()), 'whole')).toBe('mine');
  });

  it('leaves my share out when the read gives me none, or nothing is left on it', () => {
    expect(payScopes(table({}, null))).toEqual(['whole']);
    expect(payScopes(table({}, share({ shareDram: 0, personalDram: 0 })))).toEqual(['whole']);
    expect(payScopes(table({}, share({ paidDram: 10560 })))).toEqual(['whole']);
  });

  it('offers nothing once the bill is settled, or before the read lands', () => {
    expect(
      payScopes(table({ paidDram: 15400, remainingDram: 0 }, share({ paidDram: 10560 }))),
    ).toEqual([]);
    expect(payScopes(hidden(null))).toEqual([]);
    expect(payScopes(undefined)).toEqual([]);
    expect(pickScope([], 'mine')).toBeNull();
  });

  it('notes that the others pay from their phones only when somebody else has a share', () => {
    const alone = table();
    const together: TabShares = {
      ...table(),
      shares: [share(), share({ participantId: 'p-gor', displayName: 'Gor', isHost: false })],
    } as TabShares;

    expect(othersHaveShares(alone)).toBe(false);
    expect(othersHaveShares(together)).toBe(true);
    expect(othersHaveShares(hidden())).toBe(true);
    expect(othersHaveShares(undefined)).toBe(false);
  });

  it('keeps a choice while it is still offered', () => {
    expect(pickScope(['whole', 'mine'], 'mine')).toBe('mine');
  });

  it('offers the design’s tips, five percent chosen to begin with', () => {
    expect(TIP_PERCENTS).toEqual([0, 5, 10, 15]);
    expect(DEFAULT_TIP_PERCENT).toBe(5);
  });
});

describe('the whole bill', () => {
  it('is the items and the service charge, with the tip on the items before service', () => {
    const preview = payPreview(table(), 'whole', 5)!;

    expect(preview.lines).toEqual([
      { kind: 'subtotal', amountDram: 14000 },
      { kind: 'service', amountDram: 1400 },
      { kind: 'tip', amountDram: 700 },
    ]);
    expect(preview.amountDram).toBe(15400);
    expect(preview.tipDram).toBe(700);
    expect(preview.totalDram).toBe(16100);
  });

  it('takes off what has been paid, and asks only for what remains', () => {
    const preview = payPreview(table({ paidDram: 5000, remainingDram: 10400 }), 'whole', 0)!;

    expect(preview.lines).toEqual([
      { kind: 'subtotal', amountDram: 14000 },
      { kind: 'service', amountDram: 1400 },
      { kind: 'paid', amountDram: 5000 },
    ]);
    expect(rowsSum(preview)).toBe(preview.amountDram);
    expect(preview.totalDram).toBe(10400);
  });

  it('draws no tip row at zero percent', () => {
    const preview = payPreview(table(), 'whole', 0)!;
    expect(preview.lines.some((line) => line.kind === 'tip')).toBe(false);
    expect(preview.totalDram).toBe(preview.amountDram);
  });

  it('is not available from a read that hides the table total', () => {
    expect(payPreview(hidden(), 'whole', 5)).toBeNull();
  });
});

describe('my share', () => {
  it('is my items, my part of the shared ones and my service charge', () => {
    const preview = payPreview(table(), 'mine', 10)!;

    expect(preview.lines).toEqual([
      { kind: 'myItems', amountDram: 9000 },
      { kind: 'myShared', amountDram: 600 },
      { kind: 'service', amountDram: 960 },
      { kind: 'tip', amountDram: 960 },
    ]);
    expect(preview.amountDram).toBe(10560);
    expect(rowsSum(preview)).toBe(preview.amountDram);
    expect(preview.totalDram).toBe(11520);
  });

  it('says what fell to me from somebody who left, and a discount the split took off', () => {
    const preview = payPreview(
      hidden(
        share({
          ownItemsDram: 5000,
          sharedItemsDram: 0,
          absorbedFromRemovedDram: 1000,
          personalDram: 5400,
          serviceChargeDram: 540,
          shareDram: 5940,
          paidDram: 1000,
        }),
      ),
      'mine',
      15,
    )!;

    expect(preview.lines).toEqual([
      { kind: 'myItems', amountDram: 5000 },
      { kind: 'absorbed', amountDram: 1000 },
      { kind: 'discount', amountDram: 600 },
      { kind: 'service', amountDram: 540 },
      { kind: 'paid', amountDram: 1000 },
      { kind: 'tip', amountDram: 810 },
    ]);
    expect(preview.amountDram).toBe(4940);
    expect(rowsSum(preview)).toBe(preview.amountDram);
    expect(preview.totalDram).toBe(5750);
  });

  it('is not available from a read with no share for me', () => {
    expect(payPreview(table({}, null), 'mine', 5)).toBeNull();
    expect(payPreview(undefined, 'mine', 5)).toBeNull();
  });
});

describe('the tip', () => {
  it('rounds half up once, to whole dram, like the server', () => {
    expect(tipOn(1010, 5)).toBe(51); // 50.5
    expect(tipOn(1009, 5)).toBe(50); // 50.45
    expect(tipOn(3333, 15)).toBe(500); // 499.95
  });

  it('is nothing on nothing', () => {
    expect(tipOn(0, 15)).toBe(0);
    expect(tipOn(5000, 0)).toBe(0);
  });
});

describe('a bill request that did not go through', () => {
  const url = 'https://api.test/api/tabs/t1/service-requests';

  it('says there is nothing left to pay when the server refuses the scope', () => {
    const refusal = new ValidationError({
      url,
      status: 422,
      problem: {
        type: 'about:blank',
        title: 'Validation failed',
        status: 422,
        detail: 'Nothing left to pay.',
        code: 'validation-failed',
        traceId: 't',
        context: { fields: [{ field: 'billScope', message: 'Nothing left to pay.' }] },
      },
    });
    expect(billRequestFailure(refusal)).toEqual({ key: 'tab.pay.nothingLeft' });
  });

  it('tells a table that asked too often that somebody is coming', () => {
    expect(
      billRequestFailure(new ServiceRequestRateLimitedError({ url, windowMinutes: 2 })),
    ).toEqual({ key: 'waiter.rateLimited', count: 2 });
    expect(
      billRequestFailure(new ServiceRequestRateLimitedError({ url, windowMinutes: null })),
    ).toEqual({ key: 'waiter.rateLimitedNoWindow' });
  });

  it('says the tab ended, or that it did not go through', () => {
    expect(billRequestFailure(new TabAccessEndedError({ url, tabId: 't1', status: 403 }))).toEqual({
      key: 'tab.accessEnded.body',
    });
    expect(billRequestFailure(new Error('boom'))).toEqual({ key: 'waiter.failed' });
  });
});
