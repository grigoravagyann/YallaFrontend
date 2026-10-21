import { describe, expect, it } from 'vitest';
import {
  ConcurrencyConflictError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  TooManyRequestsError,
  ValidationError,
} from '../errors';
import {
  BookingNotChangeableError,
  OnMyWayNotOpenError,
  RateLimitedError,
  PreOrderAlreadySentError,
  PreOrderItemsUnavailableError,
  PreOrderLockedError,
  PreOrderNotSendableError,
  PreOrdersNotAcceptedError,
  TabNotAcceptingOrdersError,
  TableBusyError,
} from './errors';
import {
  asksOnYourWay,
  canClearPreOrder,
  canEditPreOrder,
  derivePreOrderState,
  draftFromPreOrder,
  preOrderActionFailure,
  preOrderDraftViolations,
  preOrderFailure,
  readsPreOrderRail,
  type PreOrder,
} from './preOrder';

/**
 * The pre-order rules as the screens read them (PO wire, 2026-10-21): the
 * state's precedence, when to offer the editor and the clear, when to ask
 * "on your way", the bounds in the server's field names, and every refusal
 * as one sentence.
 */

const START = '2026-10-22T15:30:00.000Z';
const before = (minutes: number) => new Date(Date.parse(START) - minutes * 60_000);

const PRE_ORDER: PreOrder = {
  id: 'po-1',
  reservationId: 'r-1',
  state: 'editable',
  lines: [
    {
      id: 'l1',
      menuItemId: 'dish',
      name: 'Khachapuri',
      unitPriceDram: 3200,
      quantity: 2,
      lineTotalDram: 6400,
      note: 'no egg',
      availableNow: true,
    },
  ],
  note: 'salad first',
  totalDram: 6400,
  editableUntilUtc: before(120).toISOString(),
  dueAtUtc: before(30).toISOString(),
  sentAtUtc: null,
  kitchenStatus: null,
  onTab: false,
  notComingAtUtc: null,
  updatedAtUtc: '2026-10-21T09:00:00Z',
};

describe('the state', () => {
  const state = (over: Partial<Parameters<typeof derivePreOrderState>[0]>, now: Date) =>
    derivePreOrderState(
      {
        bookingStatus: 'confirmed',
        startUtc: START,
        sentAtUtc: null,
        notComingAtUtc: null,
        ...over,
      },
      now,
    );

  it('is editable until two hours before, then locked', () => {
    expect(state({}, before(121))).toBe('editable');
    expect(state({}, before(120))).toBe('locked');
    expect(state({ bookingStatus: 'seated' }, before(10))).toBe('locked');
  });

  it('reads Sent > Cancelled > NotComing > Locked', () => {
    expect(state({ sentAtUtc: 'x', bookingStatus: 'noShow' }, before(0))).toBe('sent');
    expect(state({ bookingStatus: 'cancelledByVenue', notComingAtUtc: 'x' }, before(30))).toBe(
      'cancelled',
    );
    expect(state({ bookingStatus: 'completed' }, before(-200))).toBe('cancelled');
    expect(state({ notComingAtUtc: 'x' }, before(30))).toBe('notComing');
  });
});

describe('what to offer', () => {
  const booking = { preOrder: PRE_ORDER, preOrderEditableUntilUtc: before(120).toISOString() };

  it('offers the editor while the server says so and the window is open', () => {
    expect(canEditPreOrder(booking, before(121))).toBe(true);
    expect(canEditPreOrder(booking, before(120))).toBe(false);
    expect(canEditPreOrder({ preOrder: null, preOrderEditableUntilUtc: null }, before(200))).toBe(
      false,
    );
    expect(
      canEditPreOrder({ ...booking, preOrder: { ...PRE_ORDER, state: 'sent' } }, before(200)),
    ).toBe(false);
  });

  it('offers the clear with the branch switched off too', () => {
    expect(
      canClearPreOrder({ preOrder: PRE_ORDER, preOrderEditableUntilUtc: null }, before(200)),
    ).toBe(true);
    expect(canClearPreOrder({ preOrder: PRE_ORDER }, before(120))).toBe(false);
    expect(canClearPreOrder({ preOrder: null }, before(200))).toBe(false);
  });

  it('asks "on your way" from 45 minutes before, until answered or the start', () => {
    const confirmed = { status: 'confirmed' as const, startUtc: START, preOrder: PRE_ORDER };
    expect(asksOnYourWay(confirmed, before(46))).toBe(false);
    expect(asksOnYourWay(confirmed, before(45))).toBe(true);
    expect(asksOnYourWay(confirmed, before(0))).toBe(false);
    expect(asksOnYourWay({ ...confirmed, guestConfirmedOnWayAtUtc: 'x' }, before(30))).toBe(false);
    expect(asksOnYourWay({ ...confirmed, status: 'pendingApproval' }, before(30))).toBe(false);
    expect(asksOnYourWay({ ...confirmed, preOrder: null }, before(30))).toBe(false);
    expect(
      asksOnYourWay({ ...confirmed, preOrder: { ...PRE_ORDER, state: 'sent' } }, before(30)),
    ).toBe(false);
    expect(
      asksOnYourWay({ ...confirmed, preOrder: { ...PRE_ORDER, state: 'notComing' } }, before(30)),
    ).toBe(true);
  });

  it('reads the rail again on signals 6, 5 and 4 only', () => {
    expect(readsPreOrderRail('preOrderChanged')).toBe(true);
    expect(readsPreOrderRail('bookingChanged')).toBe(true);
    // A block-cancel writes only signal 4: without it the cancelled booking's
    // card stays sendable on the rail until the next poll (review S2).
    expect(readsPreOrderRail('bookingCancelledByBlock')).toBe(true);
    expect(readsPreOrderRail('tabAdmitted')).toBe(false);
    expect(readsPreOrderRail(null)).toBe(false);
  });
});

describe('the draft', () => {
  it('starts from the pre-order there is', () => {
    expect(draftFromPreOrder(PRE_ORDER)).toEqual({
      lines: [{ menuItemId: 'dish', quantity: 2, note: 'no egg' }],
      note: 'salad first',
    });
    expect(draftFromPreOrder(null)).toEqual({ lines: [], note: null });
  });

  it('names what breaks a bound, in the server field names', () => {
    expect(preOrderDraftViolations({ lines: [{ menuItemId: 'a', quantity: 1 }] })).toEqual([]);
    expect(preOrderDraftViolations({ lines: [] }).map((v) => v.field)).toEqual(['lines']);
    const many = Array.from({ length: 31 }, (_, index) => ({
      menuItemId: `d${index}`,
      quantity: 1,
    }));
    expect(preOrderDraftViolations({ lines: many }).map((v) => v.field)).toEqual(['lines']);
    const heavy = Array.from({ length: 4 }, (_, index) => ({
      menuItemId: `d${index}`,
      quantity: 16,
    }));
    expect(preOrderDraftViolations({ lines: heavy })).toMatchObject([
      { field: 'lines', bound: 'max', max: 60 },
    ]);
    expect(
      preOrderDraftViolations({
        lines: [
          { menuItemId: 'a', quantity: 0 },
          { menuItemId: 'b', quantity: 2, note: 'n'.repeat(201) },
        ],
        note: 'x'.repeat(501),
      }).map((v) => v.field),
    ).toEqual(['lines[0].quantity', 'lines[1].note', 'note']);
  });
});

describe('a refusal, as a sentence', () => {
  const url = 'mock';
  const read = (error: unknown, dishName?: string) =>
    preOrderFailure(error, 'Asia/Yerevan', 'en', { dishName });

  it('says each guest refusal in its own words', () => {
    expect(
      read(new PreOrderLockedError({ url, lockedAtUtc: '2026-10-22T13:30:00Z' })),
    ).toMatchObject({
      kind: 'locked',
      lockedAtUtc: '2026-10-22T13:30:00Z',
      line: { key: 'preOrder.error.lockedAt', params: { time: '17:30' } },
    });
    expect(read(new PreOrderLockedError({ url })).line.key).toBe('preOrder.error.locked');
    expect(read(new PreOrderAlreadySentError({ url })).kind).toBe('alreadySent');
    expect(read(new PreOrdersNotAcceptedError({ url })).kind).toBe('notAccepted');
    expect(read(new BookingNotChangeableError({ url })).kind).toBe('notChangeable');
    expect(read(new OnMyWayNotOpenError({ url })).kind).toBe('onMyWayNotOpen');
    expect(read(new NotFoundError({ url })).kind).toBe('notFound');
    expect(read(new NetworkError({ url })).kind).toBe('unknown');
    expect(read(new Error('?')).line.key).toBe('preOrder.error.generic');
  });

  it('names one dish, or counts several', () => {
    const one = new PreOrderItemsUnavailableError({
      url,
      items: [{ menuItemId: 'dish', reason: 'soldOut' }],
    });
    expect(read(one, 'Khachapuri')).toMatchObject({
      kind: 'itemsUnavailable',
      items: [{ menuItemId: 'dish', reason: 'soldOut' }],
      line: { key: 'preOrder.error.itemUnavailable', params: { name: 'Khachapuri' } },
    });
    const two = new PreOrderItemsUnavailableError({
      url,
      items: [
        { menuItemId: 'a', reason: 'soldOut' },
        { menuItemId: 'b', reason: 'notForPreOrder' },
      ],
    });
    expect(read(two).line).toEqual({
      key: 'preOrder.error.itemsUnavailable',
      params: { count: 2 },
    });
  });

  it('keeps the fields a bound named', () => {
    const error = new ValidationError({
      url,
      status: 422,
      problem: {
        type: '',
        title: '',
        status: 422,
        detail: '',
        code: 'validation-failed',
        traceId: '',
        context: { fields: [{ field: 'note', message: 'too long' }] },
      },
    });
    expect(read(error)).toMatchObject({ kind: 'invalid', violations: [{ field: 'note' }] });
  });

  it("says each of the waiter's refusals", () => {
    expect(preOrderActionFailure(new PreOrderNotSendableError({ url })).kind).toBe('notSendable');
    expect(preOrderActionFailure(new PreOrderAlreadySentError({ url })).kind).toBe('alreadySent');
    expect(preOrderActionFailure(new TabNotAcceptingOrdersError({ url, tabId: 't' })).kind).toBe(
      'tabClosing',
    );
    expect(preOrderActionFailure(new TableBusyError({ url })).line.key).toBe(
      'preOrders.error.busy',
    );
    expect(preOrderActionFailure(new ForbiddenError({ url })).kind).toBe('forbidden');
    // The booking's table kept changing under the send: the rail is re-read,
    // and the copy says so rather than a bare "try again".
    expect(preOrderActionFailure(new ConcurrencyConflictError({ url })).line.key).toBe(
      'preOrders.error.changed',
    );
    expect(preOrderActionFailure(new TooManyRequestsError({ url })).line.key).toBe(
      'preOrders.error.rateLimited',
    );
    expect(preOrderActionFailure(new RateLimitedError({ url, retryAtUtc: null })).kind).toBe(
      'rateLimited',
    );
    expect(preOrderActionFailure(new Error('?')).kind).toBe('generic');
  });
});
