// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  BASIC_FEATURES,
  createConsoleMockGateway,
  createMockRegistry,
  type ConsoleGateway,
  type ConsoleUser,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppRoutes as AppRoutesComponent } from '../../App';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';

/**
 * A branch's Features page (2026-10-27, in place of the Free/Paid plan): ten
 * switches in four groups, the Basic and Full presets, "apply to all branches
 * of this venue", and the server's refusals said under the switches.
 *
 * Against the real console mock: Mountain View's Նոր Նորք has four unfinished
 * dishes (table service refused), its Քանաքեռ is ready; Cascade Cafe's one
 * branch has tabs open (table service cannot go off).
 */

let AppRoutes: typeof AppRoutesComponent;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'mock');
  await initConsoleTestI18n();
  ({ AppRoutes } = await import('../../App'));
});

afterEach(cleanup);

const ADMIN: ConsoleUser = {
  id: 'u-platform',
  displayName: 'Grigor Avagyan',
  role: 'platformAdmin',
  scope: { venueId: null, branchIds: [] },
};

function renderFeatures(venueId: string, branchId: string, gateway?: ConsoleGateway) {
  // A registry of its own: a switch saved here must not carry into the next case.
  const mock =
    gateway ??
    createConsoleMockGateway({
      latencyMs: 0,
      role: 'platformAdmin',
      registry: createMockRegistry(() => null),
    });
  const harness = createConsoleHarness({ gateway: mock });
  render(
    harness.wrap(
      <AppRoutes user={ADMIN} />,
      `/platform/venues/${venueId}/branches/${branchId}/features`,
    ),
  );
  return mock;
}

const ready = () => screen.findByRole('heading', { level: 2, name: 'Features' }, { timeout: 5000 });
const toggle = (name: string) => screen.getByRole('switch', { name });
const checked = (name: string) => toggle(name).getAttribute('aria-checked');

describe('the Features page', () => {
  it('shows ten switches in four groups, on the Basic preset for a Basic branch', async () => {
    renderFeatures('v-mountain', 'b-mountain-kanaker');
    await ready();

    expect(screen.getAllByRole('switch')).toHaveLength(10);
    for (const group of ['Bookings', 'Orders & service', 'Guests', 'Staff & tools']) {
      expect(screen.getByRole('group', { name: group })).toBeTruthy();
    }
    expect(checked('Table service')).toBe('false');
    expect(checked('Reviews')).toBe('true');
    expect(screen.getByRole('button', { name: 'Basic' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('link', { name: 'Features' }).getAttribute('aria-current')).toBe(
      'page',
    );
    // Nothing changed yet: nothing to save.
    expect(
      (screen.getByRole('button', { name: 'Save features' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('saves the Full preset at a ready branch, and leaves the other branch alone', async () => {
    const user = userEvent.setup();
    const gateway = renderFeatures('v-mountain', 'b-mountain-kanaker');
    await ready();

    await user.click(screen.getByRole('button', { name: 'Full' }));
    expect(checked('Table service')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Save features' }));

    expect(await screen.findByText('Features saved for Քանաքեռ')).toBeTruthy();
    const venue = await gateway.getVenue('v-mountain');
    expect(venue?.branches.find((b) => b.id === 'b-mountain-kanaker')?.features).toHaveLength(10);
    expect(venue?.branches.find((b) => b.id === 'b-mountain-nornork')?.features).toEqual(
      BASIC_FEATURES,
    );
  });

  it('says why table service is refused at an unfinished menu, naming the dishes', async () => {
    const user = userEvent.setup();
    renderFeatures('v-mountain', 'b-mountain-nornork');
    await ready();

    await user.click(toggle('Table service'));
    await user.click(screen.getByRole('button', { name: 'Save features' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Նոր Նորք: 4 dishes on the menu are unfinished. Finish the menu, then turn table service on.',
    );
    // Still the draft: nothing was lost, nothing was moved.
    expect(checked('Table service')).toBe('true');
  });

  it("says why table service cannot go off while the branch's tabs are open", async () => {
    const user = userEvent.setup();
    renderFeatures('v-cascade', 'b-cascade-center');
    await ready();

    await user.click(toggle('Table service'));
    await user.click(screen.getByRole('button', { name: 'Save features' }));

    // The server names the branch and its tabs in the refusal's context.
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Կենտրոն has 15 open tabs. Turning table service off would hide those bills',
    );
  });

  it('warns, before anything is sent, that pre-orders need a booking channel', async () => {
    const user = userEvent.setup();
    const gateway = renderFeatures('v-mountain', 'b-mountain-kanaker');
    const sent = vi.spyOn(gateway, 'setBranchFeatures');
    await ready();

    await user.click(toggle('App bookings'));
    await user.click(toggle('Web bookings'));
    expect(
      screen.getByText(
        'Pre-orders need app bookings or web bookings. Turn one of them on, or pre-orders off.',
      ),
    ).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save features' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(sent).not.toHaveBeenCalled();

    await user.click(toggle('Pre-orders'));
    expect(save.disabled).toBe(false);
  });

  it('applies the set to every branch of the venue after naming the ones that change', async () => {
    const user = userEvent.setup();
    const gateway = renderFeatures('v-mountain', 'b-mountain-kanaker');
    await ready();

    await user.click(toggle('Reviews'));
    await user.click(screen.getByRole('button', { name: 'Apply to all 2 branches of this venue' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Give all 2 branches of Mountain View these features?',
    });
    expect(within(dialog).getByText('2 branches change:')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Apply to all branches' }));

    expect(
      await screen.findByText('Mountain View: every branch has these features now'),
    ).toBeTruthy();
    const venue = await gateway.getVenue('v-mountain');
    expect(venue?.branches.every((branch) => !branch.features.includes('reviews'))).toBe(true);
  });

  it('keeps every branch as it was when one refuses, and names it in the dialog', async () => {
    const user = userEvent.setup();
    const gateway = renderFeatures('v-mountain', 'b-mountain-kanaker');
    await ready();

    await user.click(screen.getByRole('button', { name: 'Full' }));
    await user.click(screen.getByRole('button', { name: 'Apply to all 2 branches of this venue' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Apply to all branches' }));

    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      'Նոր Նորք: 4 dishes on the menu are unfinished',
    );
    await waitFor(async () => {
      const venue = await gateway.getVenue('v-mountain');
      expect(venue?.branches.every((branch) => !branch.features.includes('tableService'))).toBe(
        true,
      );
    });
  });
});
