import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_ACTIONS,
  activityViolations,
  defaultActivityFilters,
  hasTimeline,
  isKnownActivityAction,
  matchesActivitySearch,
  medianSeconds,
  performanceRange,
  timelineSubjectOf,
  type ActivityEntry,
} from './activity';

/** The activity rules the screen and the mock share with the server (2026-10-24). */

const TODAY = '2026-10-24';

const ENTRY: ActivityEntry = {
  id: 'a-1',
  occurredAtUtc: '2026-10-24T14:00:00Z',
  local: '2026-10-24 18:00',
  actor: { kind: 'staff', staffMemberId: 's-1', name: 'Արամ' },
  device: { id: null, label: '', isConsole: false },
  category: 'order',
  action: 'order.sent',
  subject: { type: 'tab', id: 'tab-1', code: 'T-482' },
  tableSessionId: 'ts-1',
  tableLabel: '4',
  guestName: 'Անի Մարտիրոսյան',
  itemNames: 'Խոզի խորոված, Թան',
  amountAmd: 6200,
  isMoney: false,
  before: null,
  after: null,
  reason: null,
  params: {},
  lines: [],
  seconds: null,
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

  it('opens a call’s or a sitting’s bill by the tab its summary names', () => {
    const call = {
      ...ENTRY,
      subject: { type: 'serviceRequest' as const, id: 'sr-1' },
      params: { tabId: 'tab-9' },
    };
    expect(timelineSubjectOf(call)).toEqual({ type: 'tab', id: 'tab-9' });
    expect(timelineSubjectOf({ ...call, params: {} })).toBeNull();
    expect(timelineSubjectOf(ENTRY)).toEqual({ type: 'tab', id: 'tab-1' });
  });

  it('knows the server’s action codes, kebab-case, and nothing else', () => {
    expect(isKnownActivityAction('booking.auto-declined')).toBe(true);
    expect(isKnownActivityAction('table.call-claimed')).toBe(true);
    expect(isKnownActivityAction('booking.autoDeclined')).toBe(false);
    expect(ACTIVITY_ACTIONS.every((code) => /^[a-z]+\.[a-z-]+$/u.test(code))).toBe(true);
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
