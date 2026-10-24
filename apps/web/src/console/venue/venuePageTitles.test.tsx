// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { createConsoleMockGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppRoutes as AppRoutesComponent } from '../../App';
import { createConsoleHarness, initConsoleTestI18n } from './reports/testHarness';

/**
 * One h1 on every venue page (review, phase 1). The old venue header carried
 * the venue's name as the page's h1; the shared shell names the venue in the
 * sidebar instead, so each page's own title is its h1 now — exactly one, so
 * a screen reader's "go to the main heading" lands on what the page is.
 */

let AppRoutes: typeof AppRoutesComponent;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'mock');
  await initConsoleTestI18n();
  ({ AppRoutes } = await import('../../App'));
  // The rooms editor measures its canvas.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(cleanup);

const PAGES: readonly (readonly [string, string])[] = [
  ['/venue', 'Overview'],
  ['/venue/menu', 'Menu'],
  ['/venue/floorplan', 'Rooms'],
  ['/venue/hours', 'Opening hours'],
  ['/venue/policy', 'Reservation policy'],
  ['/venue/public', 'Public page'],
  ['/venue/staff', 'Staff'],
  ['/venue/reviews', 'Reviews'],
  ['/venue/messages', 'Messages'],
  ['/venue/reports', 'Reports'],
  ['/venue/account', 'My account'],
];

// Each page is a lazy chunk compiled on first import; on a busy CI runner the
// Reports chunk (charts) has taken over 5 s. The wait is for the import, not
// for the page: the heading itself renders at once.
const LAZY_CHUNK_MS = 20_000;

describe('every venue page', () => {
  it.each(PAGES)(
    '%s has one h1: "%s"',
    async (path, title) => {
      const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
      const user = await gateway.getCurrentUser();
      const harness = createConsoleHarness({ gateway });
      render(harness.wrap(<AppRoutes user={user} />, path));
      expect(
        await screen.findByRole('heading', { level: 1, name: title }, { timeout: LAZY_CHUNK_MS }),
      ).toBeTruthy();
      await waitFor(() => expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1));
    },
    LAZY_CHUNK_MS + 5_000,
  );
});
