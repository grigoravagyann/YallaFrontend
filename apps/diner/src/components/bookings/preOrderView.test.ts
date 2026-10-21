import type { PreOrder } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { onYourWayView, preOrderView } from './preOrderView';

/**
 * What a booking says about its pre-order (2026-10-21), decided from the
 * server's fields: offered, editable, read-only and why, or nothing at all.
 */

const NOW = new Date('2026-10-21T12:00:00Z');
const START = '2026-10-22T17:00:00Z';
const UNTIL = '2026-10-22T15:00:00Z';

const PRE_ORDER: PreOrder = {
  id: 'po-1',
  reservationId: 'r-1',
  state: 'editable',
  lines: [
    {
      id: 'l-1',
      menuItemId: 'm-1',
      name: 'Khachapuri',
      unitPriceDram: 3200,
      quantity: 2,
      lineTotalDram: 6400,
      note: null,
      availableNow: true,
    },
  ],
  note: null,
  totalDram: 6400,
  editableUntilUtc: UNTIL,
  dueAtUtc: '2026-10-22T16:30:00Z',
  sentAtUtc: null,
  kitchenStatus: null,
  onTab: false,
  notComingAtUtc: null,
  updatedAtUtc: '2026-10-21T10:00:00Z',
};

describe('preOrderView', () => {
  it('offers one while the branch takes them and the window is open', () => {
    expect(preOrderView({ preOrderEditableUntilUtc: UNTIL }, NOW)).toEqual({
      kind: 'offer',
      editableUntilUtc: UNTIL,
    });
  });

  it('offers nothing once the window shut, or where the branch takes none', () => {
    expect(preOrderView({ preOrderEditableUntilUtc: UNTIL }, new Date(UNTIL))).toEqual({
      kind: 'none',
    });
    expect(preOrderView({}, NOW)).toEqual({ kind: 'none' });
  });

  it('lets an editable pre-order be changed and removed', () => {
    expect(preOrderView({ preOrder: PRE_ORDER, preOrderEditableUntilUtc: UNTIL }, NOW)).toEqual({
      kind: 'editable',
      preOrder: PRE_ORDER,
      canEdit: true,
      canClear: true,
      editableUntilUtc: UNTIL,
    });
  });

  it('keeps one read-only, still removable, when the branch stopped taking them', () => {
    expect(preOrderView({ preOrder: PRE_ORDER }, NOW)).toMatchObject({
      kind: 'editable',
      canEdit: false,
      canClear: true,
    });
  });

  it('reads an editable one past its window as locked', () => {
    expect(
      preOrderView({ preOrder: PRE_ORDER, preOrderEditableUntilUtc: UNTIL }, new Date(UNTIL)),
    ).toEqual({ kind: 'locked', preOrder: PRE_ORDER });
  });

  it.each(['locked', 'sent', 'notComing', 'cancelled'] as const)('says %s as it is', (state) => {
    const preOrder = { ...PRE_ORDER, state };
    expect(preOrderView({ preOrder, preOrderEditableUntilUtc: UNTIL }, NOW)).toEqual({
      kind: state,
      preOrder,
    });
  });
});

describe('onYourWayView', () => {
  const asked = {
    status: 'confirmed' as const,
    startUtc: START,
    preOrder: { ...PRE_ORDER, state: 'locked' as const },
  };
  const at = (minutesBefore: number) => new Date(Date.parse(START) - minutesBefore * 60_000);

  it('asks from 45 minutes before a confirmed booking with a pre-order', () => {
    expect(onYourWayView(asked, at(46))).toBe('none');
    expect(onYourWayView(asked, at(45))).toBe('ask');
  });

  it('says the waiter knows once answered, while the booking is to come', () => {
    const answered = { ...asked, guestConfirmedOnWayAtUtc: at(40).toISOString() };
    expect(onYourWayView(answered, at(30))).toBe('confirmed');
    expect(onYourWayView({ ...answered, status: 'seated' as const }, at(-5))).toBe('none');
    expect(onYourWayView({ ...answered, status: 'cancelledByDiner' as const }, at(30))).toBe(
      'none',
    );
  });

  it('never asks about a sent or cancelled pre-order', () => {
    expect(
      onYourWayView({ ...asked, preOrder: { ...PRE_ORDER, state: 'sent' as const } }, at(30)),
    ).toBe('none');
  });
});
