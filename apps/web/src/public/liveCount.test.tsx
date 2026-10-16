// @vitest-environment jsdom
import type { PublicBranch } from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BranchStatus } from './LiveCount';
import { initTestI18n } from './testHarness';

/**
 * The header at 01:21 on a Friday that opens at 09:00 used to read, in three
 * lines: "Closed today", "8 tables free right now", "Closed right now — you
 * can still book ahead." One of those was wrong and the other two disagreed.
 * The status is one sentence now, and it names the opening.
 */

const YEREVAN = 'Asia/Yerevan';

// 01:21 on Friday 16 October, Yerevan.
const SMALL_HOURS = new Date('2026-10-15T21:21:00Z');

function branch(overrides: Partial<PublicBranch>): PublicBranch {
  return {
    venue: {
      id: 'v',
      slug: 'v',
      name: 'Yalla Demo',
      type: 'restaurant',
      description: null,
      coverPhoto: null,
    },
    id: 'b',
    slug: 'b',
    name: 'Yerevan Centre',
    status: 'live',
    addressLine: 'Abovyan 1',
    latitude: null,
    longitude: null,
    phoneE164: null,
    timeZoneId: YEREVAN,
    openState: { isOpen: false, closesAtUtc: null, opensAtUtc: '2026-10-16T05:00:00.000Z' },
    weeklyHours: [{ day: 5, blocks: [{ opensAt: '09:00', closesAt: '01:00' }] }],
    freeTables: 8,
    totalTables: 8,
    asOfUtc: SMALL_HOURS.toISOString(),
    policy: { turnTimeMinutes: 120, minLeadMinutes: 30, cancellationDeadlineMinutes: 120 },
    bookingWindowDays: 14,
    acceptsWebBookings: true,
    acceptsAppBookings: true,
    ...overrides,
  } as PublicBranch;
}

function show(b: PublicBranch, now = SMALL_HOURS) {
  render(
    <I18nextProvider i18n={i18next}>
      <BranchStatus branch={b} locale="en" now={now} />
    </I18nextProvider>,
  );
}

beforeAll(() => initTestI18n());
afterEach(() => cleanup());

describe('the status line while the venue is shut', () => {
  it('names this morning\'s opening, once, and does not count tables "right now"', () => {
    show(branch({}));
    expect(screen.getByText('Closed · opens 09:00')).toBeTruthy();
    expect(screen.queryByText(/free right now/u)).toBeNull();
    expect(screen.queryByText('Closed today')).toBeNull();
    expect(screen.getByText('You can still book ahead.')).toBeTruthy();
  });

  it('names the day when the next opening is not today', () => {
    // Sunday 22:00; shut until Tuesday 09:00.
    show(
      branch({
        openState: { isOpen: false, closesAtUtc: null, opensAtUtc: '2026-10-20T05:00:00.000Z' },
      }),
      new Date('2026-10-18T18:00:00Z'),
    );
    expect(screen.getByText('Closed · opens Tuesday 09:00')).toBeTruthy();
  });

  it('says only "closed right now" when nothing is scheduled', () => {
    show(
      branch({
        openState: { isOpen: false, closesAtUtc: null, opensAtUtc: null },
        acceptsWebBookings: false,
      }),
    );
    expect(screen.getByText('Closed right now')).toBeTruthy();
    expect(screen.queryByText('You can still book ahead.')).toBeNull();
  });
});

describe('the status line while the venue is open', () => {
  it('shows the closing time and the live count', () => {
    show(
      branch({
        openState: { isOpen: true, closesAtUtc: '2026-10-16T21:00:00.000Z', opensAtUtc: null },
      }),
      new Date('2026-10-16T18:00:00Z'),
    );
    expect(screen.getByText('Open until 01:00')).toBeTruthy();
    expect(screen.getByText('8 tables free right now')).toBeTruthy();
    expect(screen.queryByText('You can still book ahead.')).toBeNull();
  });
});
