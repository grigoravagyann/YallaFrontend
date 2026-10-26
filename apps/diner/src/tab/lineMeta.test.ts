import type { CopyLine } from '@yalla/api';
import { i18next, initI18n } from '@yalla/i18n';
import { DINER_NAMESPACES, dinerResources } from '@yalla/i18n/diner';
import { beforeAll, describe, expect, it } from 'vitest';
import { lineMetaParts, lineMetaText, lineOrderedAt } from './lineMeta';
import type { RenderedLine } from './projection';

/**
 * The line under a dish on the bill: "who · HH:mm", in the branch's zone,
 * rendered against the real diner bundles so a wrong key or a dropped
 * parameter shows up as raw text.
 */

const YEREVAN = 'Asia/Yerevan';
/** 15:08 UTC is 19:08 in Yerevan (UTC+4), 18:08 in Moscow (UTC+3). */
const ORDERED = '2026-10-22T15:08:00Z';

type MetaLine = Pick<
  RenderedLine,
  'isMine' | 'orderedByName' | 'orderedAtUtc' | 'isShared' | 'sharedWithCount'
>;

function line(overrides: Partial<MetaLine> = {}): MetaLine {
  return {
    isMine: false,
    orderedByName: 'Աննա',
    orderedAtUtc: ORDERED,
    isShared: false,
    sharedWithCount: 0,
    ...overrides,
  };
}

const translate = (copy: CopyLine) => i18next.t(copy.key, copy.params);

async function text(meta: MetaLine, locale: 'en' | 'hy' | 'ru', zone = YEREVAN): Promise<string> {
  await i18next.changeLanguage(locale);
  return lineMetaText(lineMetaParts(meta, zone, locale), translate);
}

beforeAll(async () => {
  await initI18n({
    resources: dinerResources,
    deviceLocales: ['en'],
    namespaces: [...DINER_NAMESPACES],
    defaultNamespace: 'diner',
  });
});

describe('who and when, under each line', () => {
  it('says who and the time their order went in', async () => {
    expect(await text(line(), 'hy')).toBe('Աննա · 19:08');
    expect(await text(line({ orderedByName: 'Ani' }), 'en')).toBe('Ani · 19:08');
  });

  it('puts the time after "Yours", "For the table" and before how it splits', async () => {
    expect(await text(line({ isMine: true }), 'en')).toBe('Yours · 19:08');
    expect(await text(line({ orderedByName: null }), 'en')).toBe('For the table · 19:08');
    expect(await text(line({ isMine: true, isShared: true, sharedWithCount: 3 }), 'en')).toBe(
      'Yours · 19:08 · Shared 3 ways',
    );
    expect(
      await text(line({ orderedByName: null, isShared: true, sharedWithCount: 1 }), 'en'),
    ).toBe('For the table · 19:08 · Shared with the table');
  });

  it('says who alone when the line carries no time', async () => {
    expect(await text(line({ orderedAtUtc: null }), 'hy')).toBe('Աննա');
    expect(await text(line({ isMine: true, orderedAtUtc: null }), 'en')).toBe('Yours');
    expect(await text(line({ orderedAtUtc: null, isShared: true, sharedWithCount: 2 }), 'en')).toBe(
      'Աննա · Shared 2 ways',
    );
    // Not an instant at all: still who alone, never a broken clock.
    expect(await text(line({ orderedAtUtc: 'yesterday' }), 'en')).toBe('Աննա');
  });

  it("reads the branch's clock, never the device's", async () => {
    expect(await text(line(), 'en', YEREVAN)).toBe('Աննա · 19:08');
    expect(await text(line(), 'en', 'Europe/Moscow')).toBe('Աննա · 18:08');
    expect(await text(line(), 'en', 'UTC')).toBe('Աննա · 15:08');
  });

  it('is a 24-hour clock in every locale', async () => {
    const evening = line({ orderedAtUtc: '2026-10-22T19:45:00Z' });
    for (const locale of ['en', 'hy', 'ru'] as const) {
      expect(await text(evening, locale)).toBe('Աննա · 23:45');
    }
  });
});

describe('the time alone, as the paid receipt reads it', () => {
  it("is the order's time on the branch's clock", () => {
    expect(lineOrderedAt({ orderedAtUtc: ORDERED }, YEREVAN, 'hy')).toBe('19:08');
    expect(lineOrderedAt({ orderedAtUtc: ORDERED }, 'Europe/Moscow', 'en')).toBe('18:08');
  });

  it('is nothing when the line carries no time, or one that is not an instant', () => {
    expect(lineOrderedAt({ orderedAtUtc: null }, YEREVAN, 'en')).toBeNull();
    expect(lineOrderedAt({ orderedAtUtc: 'yesterday' }, YEREVAN, 'en')).toBeNull();
  });
});
