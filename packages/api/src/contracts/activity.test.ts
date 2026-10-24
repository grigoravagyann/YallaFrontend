import { describe, expect, it } from 'vitest';
import {
  activityViolations,
  defaultActivityFilters,
  hasTimeline,
  matchesActivitySearch,
  medianSeconds,
  performanceRange,
  type ActivityEntry,
} from './activity';

/** The activity rules the screen and the mock share with the server (2026-10-24). */

const TODAY = '2026-10-24';

const ENTRY: ActivityEntry = {
  id: 'a-1',
  occurredAtUtc: '2026-10-24T14:00:00Z',
  actor: { kind: 'staff', staffMemberId: 's-1', name: 'Արամ' },
  device: { id: null, label: '', isConsole: false },
  category: 'order',
  action: 'order.sent',
  subject: { type: 'tab', id: 'tab-1' },
  tableLabel: '4',
  guestName: 'Անի Մարտիրոսյան',
  amountAmd: 6200,
  isMoney: false,
  before: null,
  after: null,
  reason: null,
  params: { itemName: 'Խոզի խորոված', code: 'T-482' },
};

describe('the feed’s filters', () => {
  it('opens on today, everyone, every kind', () => {
    expect(activityViolations(defaultActivityFilters(TODAY), TODAY)).toEqual([]);
  });

  it('names a bad day, a future day, one older than money is kept, and a long search', () => {
    const base = defaultActivityFilters(TODAY);
    const fields = (date: string, q = '') =>
      activityViolations({ ...base, date, q }, TODAY).map((v) => `${v.field}:${v.bound}`);
    expect(fields('2026-02-30')).toEqual(['date:required']);
    expect(fields('2026-10-25')).toEqual(['date:max']);
    expect(fields('2023-10-23')).toEqual(['date:min']);
    expect(fields(TODAY, 'x'.repeat(61))).toEqual(['q:max']);
  });

  it('matches a table exactly, a code with or without T-, a guest or a dish by part', () => {
    expect(matchesActivitySearch(ENTRY, '4')).toBe(true);
    expect(matchesActivitySearch(ENTRY, '14')).toBe(false);
    expect(matchesActivitySearch(ENTRY, 't482')).toBe(true);
    expect(matchesActivitySearch(ENTRY, '482')).toBe(true);
    expect(matchesActivitySearch(ENTRY, 'անի')).toBe(true);
    expect(matchesActivitySearch(ENTRY, 'խորոված')).toBe(true);
    expect(matchesActivitySearch(ENTRY, '  ')).toBe(true);
  });

  it('opens a timeline for a bill, a booking or an order only', () => {
    expect(hasTimeline({ type: 'tab', id: 't' })).toBe(true);
    expect(hasTimeline({ type: 'menuItem', id: 'm' })).toBe(false);
    expect(hasTimeline({ type: 'reservation', id: null })).toBe(false);
  });
});

describe('results', () => {
  it('reads a period as days on the branch calendar, both ends in', () => {
    expect(performanceRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(performanceRange('week', TODAY)).toEqual({ from: '2026-10-18', to: TODAY });
    expect(performanceRange('month', TODAY)).toEqual({ from: '2026-09-25', to: TODAY });
  });

  it('takes the median, never 0 for nothing', () => {
    expect(medianSeconds([])).toBeNull();
    expect(medianSeconds([80, 31, 55])).toBe(55);
    expect(medianSeconds([30, 61])).toBe(46);
  });
});
