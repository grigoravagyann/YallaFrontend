import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  compareHistoryItems,
  defaultMessageHistoryFilters,
  isLocalDate,
  localDaysBetween,
  matchesHistorySearch,
  messageHistoryViolations,
  oldestHistoryDate,
  type MessageHistoryFilters,
  type MessageHistoryItem,
} from './messageHistory';

/**
 * Message history's rules (2026-10-24 spec): the default range is today−6 to
 * today; `from` ≤ `to`, at most 366 days, nothing before today−365; the
 * search is the guest's name (contains), the table (exact) or the T-code
 * (with or without `T-`); newest last message first.
 */

const TODAY = '2026-10-24';

function filters(overrides: Partial<MessageHistoryFilters> = {}): MessageHistoryFilters {
  return { ...defaultMessageHistoryFilters(TODAY), ...overrides };
}

const fields = (input: Partial<MessageHistoryFilters> & { limit?: number }) =>
  messageHistoryViolations({ ...filters(input), limit: input.limit }, TODAY).map(
    (violation) => violation.field,
  );

describe('the calendar days', () => {
  it('counts across months and years, and knows a real day from a near miss', () => {
    expect(addLocalDays('2026-10-24', -6)).toBe('2026-10-18');
    expect(addLocalDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addLocalDays('2026-01-01', -365)).toBe('2025-01-01');
    expect(localDaysBetween('2026-10-18', '2026-10-24')).toBe(6);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-10-24T00:00')).toBe(false);
    expect(isLocalDate('2026-10-24')).toBe(true);
    expect(oldestHistoryDate(TODAY)).toBe('2025-10-24');
  });

  it('defaults to the last seven days, every kind, no search', () => {
    expect(defaultMessageHistoryFilters(TODAY)).toEqual({
      from: '2026-10-18',
      to: TODAY,
      kind: 'all',
      q: '',
      unansweredOnly: false,
    });
  });
});

describe('the bad fields, named as the server names them', () => {
  it('lets the defaults and the whole kept year through', () => {
    expect(fields({})).toEqual([]);
    expect(fields({ from: '2025-10-24', to: TODAY })).toEqual([]);
  });

  it('refuses a start after the end, before the kept year, or a range over 366 days', () => {
    expect(fields({ from: '2026-10-25', to: TODAY })).toEqual(['from']);
    expect(fields({ from: '2025-10-23', to: '2025-10-30' })).toEqual(['from']);
    expect(fields({ from: '2025-10-24', to: '2026-10-25' })).toEqual(['to']);
  });

  it('refuses a date that is not one, a long search, and a page out of bounds', () => {
    expect(fields({ from: '24.10.2026' })).toEqual(['from']);
    expect(fields({ q: 'x'.repeat(61) })).toEqual(['q']);
    expect(fields({ q: `  ${'x'.repeat(60)}  ` })).toEqual([]);
    expect(fields({ limit: 0 })).toEqual(['limit']);
    expect(fields({ limit: 101 })).toEqual(['limit']);
    expect(fields({ limit: 100 })).toEqual([]);
  });
});

describe('the search', () => {
  const booking = { kind: 'reservation' as const, label: '6', guestName: 'Անի Մարտիրոսյան' };
  const order = { kind: 'takeaway' as const, label: 'T-482', guestName: 'Karen Sargsyan' };

  it('finds a guest by part of the name, in any case', () => {
    expect(matchesHistorySearch(booking, 'անի')).toBe(true);
    expect(matchesHistorySearch(order, 'sARG')).toBe(true);
    expect(matchesHistorySearch(order, 'Ani')).toBe(false);
  });

  it('finds a table only by its whole label', () => {
    expect(matchesHistorySearch(booking, '6')).toBe(true);
    expect(matchesHistorySearch({ ...booking, label: '16' }, '6')).toBe(false);
  });

  it('finds an order by its code with or without the T-', () => {
    for (const q of ['T-482', 't-482', 't482', '482']) {
      expect(matchesHistorySearch(order, q)).toBe(true);
    }
    expect(matchesHistorySearch(order, '48')).toBe(false);
  });

  it('matches everything when empty', () => {
    expect(matchesHistorySearch(order, '   ')).toBe(true);
  });
});

describe('the order', () => {
  it('puts the newest last message first, the id breaking a tie', () => {
    const row = (id: string, lastAtUtc: string) =>
      ({ conversationId: id, lastAtUtc }) as MessageHistoryItem;
    const sorted = [
      row('a', '2026-10-20T10:00:00Z'),
      row('c', '2026-10-24T10:00:00Z'),
      row('b', '2026-10-24T10:00:00Z'),
    ].sort(compareHistoryItems);
    expect(sorted.map((item) => item.conversationId)).toEqual(['c', 'b', 'a']);
  });
});
