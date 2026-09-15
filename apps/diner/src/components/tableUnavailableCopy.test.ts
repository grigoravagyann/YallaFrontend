import { tableCopy, unavailableCopy, type TableAvailability } from '@yalla/api';
import { i18next, initI18n } from '@yalla/i18n';
import { DINER_NAMESPACES, dinerResources } from '@yalla/i18n/diner';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * "Too small for 8 guests." — `table.unavailable.tooSmall` is plural in every
 * locale, so the line has to carry `count`. Both callers read it from the
 * shared copy: `TableSheet` through `tableCopy`, the booking screen through
 * `unavailableCopy`. Rendered here against the real diner bundles, so a
 * dropped `count` shows up as the raw `{{count}}` or the wrong plural form.
 */

const TOO_SMALL: TableAvailability = {
  tableId: 't1',
  tableLabel: '4',
  floorAreaName: null,
  seats: 2,
  isBookable: false,
  unavailableReason: 'tooSmall',
  window: null,
  freeCancellationUntilUtc: null,
  requiresApproval: false,
};

beforeAll(async () => {
  await initI18n({
    resources: dinerResources,
    deviceLocales: ['en'],
    namespaces: [...DINER_NAMESPACES],
    defaultNamespace: 'diner',
  });
});

async function inLocale(locale: string, partySize: number): Promise<[string, string]> {
  await i18next.changeLanguage(locale);
  const sheet = tableCopy(TOO_SMALL, {
    partySize,
    timeZoneId: 'Asia/Yerevan',
    locale: locale as 'en',
  }).unavailable!;
  const booking = unavailableCopy('tooSmall', partySize);
  return [i18next.t(sheet.key, sheet.params), i18next.t(booking.key, booking.params)];
}

describe('table.unavailable.tooSmall carries the party size', () => {
  it.each([
    ['en', 1, 'Too small for 1 guest.'],
    ['en', 8, 'Too small for 8 guests.'],
    ['ru', 1, 'Слишком мал для 1 гостя.'],
    ['ru', 3, 'Слишком мал для 3 гостей.'],
    ['ru', 5, 'Слишком мал для 5 гостей.'],
    ['hy', 6, 'Փոքր է 6 հյուրի համար։'],
  ])('%s, party of %i', async (locale, partySize, expected) => {
    const [sheet, booking] = await inLocale(locale, partySize);
    expect(sheet).toBe(expected);
    expect(booking).toBe(expected);
  });
});
