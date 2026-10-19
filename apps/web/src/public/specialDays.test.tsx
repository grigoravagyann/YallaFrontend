// @vitest-environment jsdom
import type { PublicBranch } from '@yalla/api';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { OpeningHours } from './BranchDetails';
import { initTestI18n } from './testHarness';

/**
 * Special days on the public branch page (VC3 wire §1): holidays and
 * closures replace the week's hours on their date, so they are listed where
 * the week is, outside its fold, where nobody misses them.
 */

beforeAll(async () => {
  await initTestI18n();
});

afterEach(cleanup);

function branch(specialDays: PublicBranch['specialDays']): PublicBranch {
  return {
    timeZoneId: 'Asia/Yerevan',
    weeklyHours: [{ day: 4, blocks: [{ opensAt: '09:00', closesAt: '23:00' }] }],
    specialDays,
  } as unknown as PublicBranch;
}

function show(b: PublicBranch) {
  render(
    <I18nextProvider i18n={i18next}>
      <OpeningHours branch={b} locale="en" />
    </I18nextProvider>,
  );
}

describe('special days on the public page', () => {
  it('lists each date with its note and hours, a closed one as closed', () => {
    show(
      branch([
        {
          date: '2026-12-31',
          note: 'New Year’s Eve',
          blocks: [{ opensAt: '18:00', closesAt: '03:00' }],
        },
        { date: '2027-01-01', note: null, blocks: [] },
      ]),
    );

    const table = screen.getByRole('table', { name: 'Special days' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toMatch(/December 31 · New Year’s Eve18:00–03:00$/u);
    expect(rows[1]!.textContent).toMatch(/January 1.*Closed$/u);
  });

  it('shows nothing extra when there are none', () => {
    show(branch([]));
    expect(screen.queryByRole('table', { name: 'Special days' })).toBeNull();
  });
});

describe("yesterday's special night", () => {
  it('is not listed as a day ahead', () => {
    const yesterday = new Date(Date.now() - 86_400_000 * 2).toISOString().slice(0, 10);
    show(
      branch([
        { date: yesterday, note: 'Gone', blocks: [{ opensAt: '20:00', closesAt: '02:00' }] },
      ]),
    );
    expect(screen.queryByRole('table', { name: 'Special days' })).toBeNull();
  });
});
