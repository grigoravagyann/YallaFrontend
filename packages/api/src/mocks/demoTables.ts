import { mockTableCode } from './tableCodes';

/**
 * The codes a developer needs to walk every scan outcome without a printer.
 *
 * Strictly a development affordance. Consumers must gate rendering on `__DEV__`
 * *and* on running against mock data, exactly as the SMS code banner does — the
 * rule is the same one: a build shipped to a phone in a cafe must be incapable
 * of showing this, not merely unlikely to.
 *
 * Each entry deliberately lands on a different branch of the scan handler, so
 * "all five outcomes handled" is something you can check rather than assert.
 */
export interface MockDemoTable {
  /** What to type into the manual-entry fallback. */
  readonly code: string;
  /** Which of the five outcomes this exercises. */
  readonly outcome: 'tabOpened' | 'joinPending' | 'outOfService' | 'unknownCode' | 'tabClosed';
  /** Where it is, for orientation while testing. */
  readonly where: string;
}

export const MOCK_DEMO_TABLES: readonly MockDemoTable[] = [
  {
    code: mockTableCode('b-lumen-north-t1'),
    outcome: 'tabOpened',
    where: 'Lumen Coffee · Northern Avenue · table 1',
  },
  {
    code: mockTableCode('b-lumen-north-t9'),
    outcome: 'joinPending',
    where: 'Lumen Coffee · Northern Avenue · table 9 (Aram is hosting)',
  },
  {
    code: mockTableCode('b-lumen-north-t14'),
    outcome: 'outOfService',
    where: 'Lumen Coffee · Northern Avenue · table 14',
  },
  {
    code: mockTableCode('b-greenbean-main-t16'),
    outcome: 'tabClosed',
    where: 'Green Bean · Mashtots Avenue · table 16 (already paid)',
  },
  {
    // Deliberately not a code any table hashes to.
    code: 'ZZZZZZ',
    outcome: 'unknownCode',
    where: 'Nothing — a sticker from somewhere else',
  },
];
