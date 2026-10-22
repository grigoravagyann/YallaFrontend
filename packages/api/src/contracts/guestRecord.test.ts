import { describe, expect, it } from 'vitest';
import {
  NEW_GUEST_RECORD,
  guestRecordStanding,
  hasGoodRecord,
  hasTakeawayNoShows,
  type GuestRecord,
} from './guestRecord';

/**
 * A takeaway order left at the counter in the guest record (2026-10-23): its
 * own count, never neutral, and no good record with one.
 */

const NOW = new Date('2026-10-23T10:00:00Z');

const record = (overrides: Partial<GuestRecord> = {}): GuestRecord => ({
  booked: 4,
  came: 4,
  noShows: 0,
  lateCancellations: 0,
  unmarked: 0,
  isNewGuest: false,
  takeawayNoShows: 0,
  blockedUntilUtc: null,
  ...overrides,
});

describe('takeaway orders not collected in the record', () => {
  it('make a guest who never booked a miss, not a neutral new guest', () => {
    expect(guestRecordStanding(NEW_GUEST_RECORD, NOW)).toBe('new');
    expect(guestRecordStanding({ ...NEW_GUEST_RECORD, takeawayNoShows: 1 }, NOW)).toBe('missed');
    expect(hasTakeawayNoShows({ ...NEW_GUEST_RECORD, takeawayNoShows: 1 })).toBe(true);
    expect(hasTakeawayNoShows(null)).toBe(false);
  });

  it('spoil a good record, as the server judges it', () => {
    expect(hasGoodRecord(record())).toBe(true);
    expect(guestRecordStanding(record(), NOW)).toBe('good');
    expect(hasGoodRecord(record({ takeawayNoShows: 1 }))).toBe(false);
    expect(guestRecordStanding(record({ takeawayNoShows: 1 }), NOW)).toBe('missed');
  });

  it('leave a block first', () => {
    const blocked = record({ takeawayNoShows: 1, blockedUntilUtc: '2026-10-30T10:00:00Z' });
    expect(guestRecordStanding(blocked, NOW)).toBe('blocked');
  });
});
