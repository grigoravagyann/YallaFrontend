import { ApiError, ServerError, parseProblem, type ActivityEntry } from '@yalla/api';
import { i18next } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { csvFailureText } from '../../kit/fileExport';
import { initConsoleTestI18n } from '../reports/testHarness';
import { actionLabel, detailParts, deviceLabel, durationLabel, phoneOwnerOf } from './activityText';

/**
 * The History's device wording (2026-10-25): phones paired and unpaired, a
 * tablet connected by Time to Eat, and the server's English device labels said in
 * the reader's language.
 */

let en: TFunction;
let ru: TFunction;
let hy: TFunction;
beforeAll(async () => {
  await initConsoleTestI18n();
  en = i18next.getFixedT('en', ['admin', 'common']);
  ru = i18next.getFixedT('ru', ['admin', 'common']);
  hy = i18next.getFixedT('hy', ['admin', 'common']);
});

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 'e-1',
    occurredAtUtc: '2026-10-25T12:00:00Z',
    local: '2026-10-25 16:00',
    actor: { kind: 'staff', staffMemberId: 's-lilit', name: 'Lilit Avetisyan' },
    device: { id: 'd-1', label: '', isConsole: false },
    category: 'device',
    action: 'device.phone-paired',
    subject: { type: 'device', id: 'd-1', code: null },
    tableSessionId: null,
    tableLabel: null,
    guestName: null,
    itemNames: null,
    amountAmd: null,
    isMoney: false,
    before: null,
    after: null,
    reason: null,
    params: {},
    lines: [],
    seconds: null,
    ...overrides,
  };
}

describe('device labels', () => {
  it('words a phone, a tablet and the console from the parts the server keeps', () => {
    const phone = entry({
      device: {
        id: 'd-1',
        label: "Aram's phone",
        isConsole: false,
        kind: 'phone',
        ownerName: 'Արամ Պետրոսյան',
      },
    });
    expect(deviceLabel(en, phone)).toBe('Արամ’s phone');
    expect(deviceLabel(ru, phone)).toBe('Телефон: Արամ');
    expect(deviceLabel(hy, phone)).toBe('Հեռախոս՝ Արամ');

    // The label is never read apart when the parts are there: a tablet named like a phone is its name.
    const tablet = entry({
      device: {
        id: 'd-2',
        label: "Aram's phone",
        isConsole: false,
        kind: 'tablet',
        ownerName: null,
      },
    });
    expect(deviceLabel(hy, tablet)).toBe("Aram's phone");

    // A phone whose person was not found keeps the name the server gave it.
    const nobody = entry({
      device: {
        id: 'd-3',
        label: 'iPhone · Safari',
        isConsole: false,
        kind: 'phone',
        ownerName: null,
      },
    });
    expect(deviceLabel(ru, nobody)).toBe('iPhone · Safari');

    const console = entry({
      device: { id: null, label: 'Console', isConsole: false, kind: 'console', ownerName: null },
    });
    expect(deviceLabel(hy, console)).toBe('Վահանակ');
  });

  it('says a personal phone on an older entry in the reader’s language, from the name part', () => {
    const phone = entry({ device: { id: 'd-1', label: "Aram's phone", isConsole: false } });
    expect(deviceLabel(en, phone)).toBe('Aram’s phone');
    expect(deviceLabel(ru, phone)).toBe('Телефон: Aram');
    expect(deviceLabel(hy, phone)).toBe('Հեռախոս՝ Aram');
    // A typographic apostrophe and stray spaces read the same.
    expect(phoneOwnerOf('  Լիլիթ’s phone ')).toBe('Լիլիթ');
  });

  it('keeps a tablet’s own name, says the console in the reader’s language, and nothing as nothing', () => {
    const tablet = entry({ device: { id: 'd-2', label: 'Hall tablet', isConsole: false } });
    expect(deviceLabel(ru, tablet)).toBe('Hall tablet');
    // Names that only look close stay as they were given.
    for (const label of ["'s phone", 'Phone of Aram', "Aram's phones", 'My phone']) {
      expect(phoneOwnerOf(label)).toBeNull();
      expect(deviceLabel(en, entry({ device: { id: 'd-3', label, isConsole: false } }))).toBe(
        label,
      );
    }
    const console = entry({ device: { id: null, label: 'Console', isConsole: true } });
    expect(deviceLabel(ru, console)).toBe('Консоль');
    expect(deviceLabel(en, entry({ device: { id: null, label: '', isConsole: false } }))).toBe(
      null,
    );
  });
});

describe('phone and device entries', () => {
  it('words a phone paired by its person, again, and for somebody else', () => {
    const own = entry({ params: { staffMemberId: 's-lilit', staffName: 'Lilit Avetisyan' } });
    expect(actionLabel(en, own)).toBe('Paired their phone');
    expect(
      actionLabel(
        en,
        entry({ params: { staffMemberId: 's-lilit', staffName: 'Lilit A', repaired: true } }),
      ),
    ).toBe('Paired their phone again');
    expect(
      actionLabel(en, entry({ params: { staffMemberId: 's-aram', staffName: 'Aram Petrosyan' } })),
    ).toBe('Paired Aram P.’s phone');
    expect(actionLabel(ru, own)).toBe('Привязал(а) свой телефон');
  });

  it('words an unpairing by its cause', () => {
    const unpaired = (cause: string, actor = 's-nare') =>
      entry({
        action: 'device.phone-unpaired',
        actor: { kind: 'staff', staffMemberId: actor, name: 'Nare Petrosyan' },
        params: { staffMemberId: 's-gor', staffName: 'Gor Melkonyan', cause },
      });
    expect(actionLabel(en, unpaired('console'))).toBe('Unpaired Gor M.’s phone');
    expect(detailParts(en, unpaired('console'), 'en')).toEqual([]);
    expect(actionLabel(en, unpaired('its-owner', 's-gor'))).toBe('Unpaired their phone');
    expect(detailParts(en, unpaired('deactivated'), 'en')).toEqual(['the person was deactivated']);
    expect(detailParts(en, unpaired('kitchen'), 'en')).toEqual(['now works in the kitchen']);
    expect(detailParts(en, unpaired('other-branch'), 'en')).toEqual([
      'now works at another branch',
    ]);
    expect(detailParts(en, unpaired('replaced', 's-gor'), 'en')).toEqual([
      'a new phone was paired',
    ]);
    // A cause this build does not know adds nothing.
    expect(detailParts(en, unpaired('something-new'), 'en')).toEqual([]);
    expect(actionLabel(hy, unpaired('console'))).toBe('Անջատեց հեռախոսը՝ Gor M.');
  });

  it('says a tablet Time to Eat connected by its name, and whose code it was where it knows', () => {
    const enrolled = entry({
      action: 'device.enrolled',
      actor: { kind: 'system', staffMemberId: null, name: '' },
      params: { name: 'Hall tablet', codeCreatedByStaffMemberId: 's-nare' },
    });
    expect(actionLabel(en, enrolled)).toBe('Hall tablet connected');
    expect(actionLabel(en, entry({ action: 'device.enrolled', params: {} }))).toBe(
      'Connected a device',
    );
    expect(detailParts(en, enrolled, 'en')).toEqual([]);
    expect(
      detailParts(en, enrolled, 'en', (id) => (id === 's-nare' ? 'Nare Petrosyan' : null)),
    ).toEqual(['code by Nare P.']);
    expect(detailParts(en, enrolled, 'en', () => null)).toEqual([]);
  });
});

describe('medians and CSV refusals (review 2026-10-25)', () => {
  it('writes a median as minutes and two-digit seconds, as the boards do', () => {
    expect(durationLabel(en, 125)).toBe('2 min 05 s');
    expect(durationLabel(hy, 95)).toBe('1 ր 35 վ');
    expect(durationLabel(ru, 61)).toBe('1 мин 01 с');
    expect(durationLabel(en, 48)).toBe('48 s');
    expect(durationLabel(en, 240)).toBe('4 min');
    expect(durationLabel(en, null)).toBeNull();
  });

  it('says a too-large export with the server’s limit, and how to narrow it', () => {
    const tooLarge = new ApiError('Export too large', {
      status: 422,
      url: '/api/branches/b/activity.csv',
      problem: parseProblem({
        status: 422,
        code: 'activity-export-too-large',
        context: { rows: 25_000, maxRows: 20_000 },
      }),
    });
    expect(csvFailureText(en, tooLarge, 'en')).toBe(
      'That day has more than 20,000 entries for one file. Narrow it by a person, a kind or a search.',
    );
    expect(csvFailureText(ru, tooLarge, 'ru')).toContain('20');
    expect(csvFailureText(hy, tooLarge, 'hy')).toContain('20');
    expect(csvFailureText(en, new ServerError({ status: 500, url: '/x' }), 'en')).toBe(
      'The file could not be made. Try again.',
    );
  });
});
