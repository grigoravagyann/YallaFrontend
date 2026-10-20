import { i18next, initI18n } from '@yalla/i18n';
import { DINER_NAMESPACES, dinerResources } from '@yalla/i18n/diner';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * What the guest is told about their record (review round 2, 2026-10-21),
 * against the real diner bundles: everything a venue sees — the counts, the
 * bookings nobody marked, and the pause on booking while it lasts — said by
 * the privacy line (Book, Confirm, the record card, About) and by Help.
 */

beforeAll(async () => {
  await initI18n({
    resources: dinerResources,
    deviceLocales: ['en'],
    namespaces: [...DINER_NAMESPACES],
    defaultNamespace: 'diner',
  });
});

const say = (key: string, lng: string, params: Record<string, unknown> = {}) =>
  i18next.t(key, { ns: 'diner', lng, ...params });

describe('what venues see, in the privacy line', () => {
  it('says the counts, the unmarked ones and the pause — counts only, never where', () => {
    expect(say('privacy.guestRecord', 'en')).toBe(
      'Venues you book with see how many of your bookings in the last 12 months, at all venues, you kept, missed or cancelled late, and how many were not marked. While booking is paused after three missed bookings in three days, they see that too. Just the numbers, never where.',
    );
  });

  it('says the same in Armenian, with «վայր» for the venue, and in Russian', () => {
    const hy = say('privacy.guestRecord', 'hy');
    expect(hy).toContain('բոլոր վայրերում');
    expect(hy).toContain('չեն նշվել');
    expect(hy).toContain('դադարեցված');
    expect(hy).not.toMatch(/աստատությ/u);
    const ru = say('privacy.guestRecord', 'ru');
    expect(ru).toContain('по всем заведениям');
    expect(ru).toContain('не отмечено');
    expect(ru).toContain('приостановлено');
  });
});

describe('what venues see, in Help', () => {
  it('answers it in every language, with the unmarked ones and the pause', () => {
    for (const lng of ['en', 'hy', 'ru']) {
      expect(say('help.faq.venuesSee.question', lng)).not.toBe('help.faq.venuesSee.question');
      expect(say('help.faq.venuesSee.answer', lng)).not.toBe('help.faq.venuesSee.answer');
    }
    const en = say('help.faq.venuesSee.answer', 'en');
    expect(en).toContain('not marked');
    expect(en).toContain('three bookings in three days');
    expect(en).toContain('never where');
    expect(say('help.faq.venuesSee.answer', 'hy')).not.toMatch(/աստատությ/u);
  });
});

describe('the record line in Russian', () => {
  it('reads "Вы пришли на 11 из 12 броней"', () => {
    expect(say('bookings.record.came', 'ru', { came: 11, count: 12 })).toBe(
      'Вы пришли на 11 из 12 броней',
    );
    expect(say('bookings.record.came', 'ru', { came: 1, count: 1 })).toBe(
      'Вы пришли на 1 из 1 брони',
    );
    expect(say('bookings.record.came', 'ru', { came: 2, count: 3 })).toBe(
      'Вы пришли на 2 из 3 броней',
    );
    expect(say('bookings.record.came', 'ru', { came: 20, count: 21 })).toBe(
      'Вы пришли на 20 из 21 брони',
    );
  });
});
