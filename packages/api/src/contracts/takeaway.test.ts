import { describe, expect, it } from 'vitest';
import {
  TAKEAWAY_LIMITS,
  canMarkTakeawayNoShow,
  defaultTakeawayReadyAtUtc,
  isTakeawayActive,
  isTakeawayInProgress,
  isTakeawayNotificationKind,
  isTakeawayable,
  stepTakeawayReadyAtUtc,
  takeawayItemCount,
  takeawayNoShowFromUtc,
  takeawayNote,
  takeawayOrderViolations,
  takeawaySettingsViolations,
  type TakeawayStatus,
} from './takeaway';
import type { MenuItemDetail } from './ordering';

/**
 * The takeaway rules the screens and the mocks read (2026-10-22): which
 * statuses are still moving, when "No-show" opens, the tablet's ready-time
 * stepper, the dishes on offer, and the bounds an order and the settings are
 * held to — in the server's field names.
 */

const NOW = new Date('2026-10-22T15:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

describe('where an order stands', () => {
  it('is active while sent, accepted or ready; in progress only while sent or accepted', () => {
    const all: TakeawayStatus[] = [
      'sent',
      'accepted',
      'ready',
      'collected',
      'declined',
      'cancelled',
      'noShow',
      'unknown',
    ];
    expect(all.filter(isTakeawayActive)).toEqual(['sent', 'accepted', 'ready']);
    expect(all.filter(isTakeawayInProgress)).toEqual(['sent', 'accepted']);
  });

  it('counts the dishes', () => {
    expect(takeawayItemCount([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  });

  it('knows its own notifications', () => {
    expect(isTakeawayNotificationKind('takeaway-ready')).toBe(true);
    expect(isTakeawayNotificationKind('booking-reminder')).toBe(false);
    expect(isTakeawayNotificationKind(null)).toBe(false);
  });
});

describe('"No-show"', () => {
  it("opens thirty minutes after the later of the promise and the kitchen's ready", () => {
    expect(takeawayNoShowFromUtc({ readyAtUtc: at(0), readyMarkedAtUtc: at(10) })).toBe(at(40));
    expect(takeawayNoShowFromUtc({ readyAtUtc: at(10), readyMarkedAtUtc: at(0) })).toBe(at(40));
    expect(takeawayNoShowFromUtc({ readyAtUtc: at(5), readyMarkedAtUtc: null })).toBe(at(35));
    expect(takeawayNoShowFromUtc({ readyAtUtc: null, readyMarkedAtUtc: null })).toBeNull();
  });

  it('is offered only on a ready order past that time', () => {
    const ready = {
      status: 'ready' as const,
      noShowFromUtc: at(-1),
      readyAtUtc: at(-31),
      readyMarkedAtUtc: null,
    };
    expect(canMarkTakeawayNoShow(ready, NOW)).toBe(true);
    expect(canMarkTakeawayNoShow({ ...ready, noShowFromUtc: at(1) }, NOW)).toBe(false);
    expect(canMarkTakeawayNoShow({ ...ready, status: 'accepted' }, NOW)).toBe(false);
    // A server that did not say: derived from the times.
    expect(canMarkTakeawayNoShow({ ...ready, noShowFromUtc: null }, NOW)).toBe(true);
  });
});

describe("the tablet's ready time", () => {
  it('starts from the requested time, never in the past', () => {
    expect(defaultTakeawayReadyAtUtc({ requestedPickupUtc: at(20) }, NOW)).toBe(at(20));
    expect(defaultTakeawayReadyAtUtc({ requestedPickupUtc: at(-5) }, NOW)).toBe(at(0));
  });

  it('steps by five minutes, never before now', () => {
    expect(stepTakeawayReadyAtUtc(at(20), 1, NOW)).toBe(at(25));
    expect(stepTakeawayReadyAtUtc(at(20), -2, NOW)).toBe(at(10));
    expect(stepTakeawayReadyAtUtc(at(5), -2, NOW)).toBe(at(0));
  });
});

describe('the dishes on offer', () => {
  const dish = { isAvailable: true } as MenuItemDetail;

  it('offers a dish not sold out and not hall-only; absent reads as yes', () => {
    expect(isTakeawayable(dish)).toBe(true);
    expect(isTakeawayable({ ...dish, availableForTakeaway: false })).toBe(false);
    expect(isTakeawayable({ ...dish, isAvailable: false })).toBe(false);
  });
});

describe('the bounds', () => {
  it('names each order field the server would', () => {
    expect(takeawayOrderViolations({ lines: [] }).map((v) => v.field)).toEqual(['lines']);
    expect(
      takeawayOrderViolations({
        lines: [
          { menuItemId: 'a', quantity: 0 },
          { menuItemId: 'b', quantity: 2 },
        ],
        note: 'x'.repeat(TAKEAWAY_LIMITS.maxNote + 1),
      }).map((v) => v.field),
    ).toEqual(['lines[0].quantity', 'note']);
    expect(
      takeawayOrderViolations({
        lines: [
          { menuItemId: 'a', quantity: 20 },
          { menuItemId: 'b', quantity: 20 },
          { menuItemId: 'c', quantity: 20 },
          { menuItemId: 'd', quantity: 1 },
        ],
      }).map((v) => v.field),
    ).toEqual(['lines']);
    expect(takeawayOrderViolations({ lines: [{ menuItemId: 'a', quantity: 1 }] })).toEqual([]);
  });

  it('names each setting out of bounds or off its step', () => {
    const fine = {
      enabled: true,
      autoAccept: false,
      prepMinutes: 20,
      lastOrderMinutes: 30,
      maxInProgress: 5,
    };
    expect(takeawaySettingsViolations(fine)).toEqual([]);
    expect(
      takeawaySettingsViolations({
        ...fine,
        prepMinutes: 22,
        lastOrderMinutes: 135,
        maxInProgress: 0,
      }).map((v) => v.field),
    ).toEqual(['prepMinutes', 'lastOrderMinutes', 'maxInProgress']);
  });

  it('keeps a note trimmed, blank as none', () => {
    expect(takeawayNote('  bag  ')).toBe('bag');
    expect(takeawayNote('   ')).toBeNull();
    expect(takeawayNote(undefined)).toBeNull();
  });
});
