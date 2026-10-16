import { resetBrowserMockWorlds, type MockPersistence } from '@yalla/api';
import { readConfig } from '../config';

/**
 * Where the console's mock worlds are kept between page loads (QA F2).
 *
 * One journal per gateway, in `localStorage`, only in a browser and only
 * outside the test runner: a test that kept its world across cases would be
 * the flakiest test in the repository, and the real data source has nothing
 * to keep.
 */
export function mockPersistence(name: string): MockPersistence | undefined {
  if (readConfig().dataSource !== 'mock') return undefined;
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') return undefined;
  return { key: `yalla.mock.${name}` };
}

/** The "reset mock data" dev action: forget every world, start from the fixture. */
export function resetMockWorld(): void {
  resetBrowserMockWorlds();
  window.location.reload();
}
