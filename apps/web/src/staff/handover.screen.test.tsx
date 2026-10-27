// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type StaffGateway,
  type StaffSessionSnapshot,
  type TableActionCommand,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * A command queued under one person's sign-in, after the tablet changes hands
 * (floor tablet phase 4; the phase 1 review's "A's commands sync under B's
 * token").
 *
 * Sona takes table 2 out of service with the wifi down and hands the tablet
 * over. The command is hers: it is not sent under Aram's sign-in. Aram sees it
 * on the conflicts screen and can send it under his own name, or drop it; if
 * Sona signs in again first, it goes by itself.
 */

const session = vi.hoisted(() => {
  let current: unknown = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next: unknown) => {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock('../offline/commandStore', async (importOriginal) =>
  (await import('./testCommandStore')).withMemoryStore(await importOriginal()),
);
vi.mock('./auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice: async () => undefined,
    roster: async () => [],
    signOut: async () => {
      const now = session.get() as StaffSessionSnapshot;
      session.set({ ...now, state: 'locked', lastSignOut: 'signedOut' });
    },
  },
}));
vi.mock('./auth/useStaffSession', () => ({
  useStaffSessionSnapshot: () => useSyncExternalStore(session.subscribe, session.get),
  useTouchOnInteraction: () => undefined,
}));
vi.mock('../auth/useCurrentUser', async () => {
  const actual = await vi.importActual<typeof CurrentUserModule>('../auth/useCurrentUser');
  return { ...actual, useCurrentUser: () => ({ user: null }) };
});

const { StaffRoute } = await import('./StaffRoute');

const BRANCH = 'b1';

const device: EnrolledDevice = {
  deviceId: 'd1',
  deviceName: 'Counter',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

const SONA = { staffMemberId: 's-sona', fullName: 'Sona Vardanyan' };
const ARAM = { staffMemberId: 's-aram', fullName: 'Aram Sargsyan' };

function signIn(who: typeof SONA): void {
  session.set({
    state: 'signedIn',
    device,
    identity: { ...who, role: 'waiter', branchId: BRANCH, features: FULL_FEATURES },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot);
}

function signOut(): void {
  const now = session.get() as StaffSessionSnapshot;
  session.set({ ...now, state: 'locked', lastSignOut: 'signedOut' });
}

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** The real staff mock, with every table action recorded. */
function recording(
  options: {
    readonly churnOnTables?: readonly string[];
    /** Holds a table's first send until the test lets it go. */
    readonly hold?: { readonly tableId: string; readonly until: Promise<void> };
  } = {},
) {
  const base = createStaffMockGateway({
    latencyMs: 0,
    branchId: BRANCH,
    // As strict as the server: no session, a 401.
    signedIn: () => (session.get() as StaffSessionSnapshot | null)?.state === 'signedIn',
    ...(options.churnOnTables ? { churnOnTables: options.churnOnTables } : {}),
  });
  const actions: TableActionCommand[] = [];
  const floorReads = { count: 0 };
  let held = options.hold;
  const gateway: StaffGateway = {
    ...base,
    getFloor: async (branchId) => {
      floorReads.count += 1;
      return base.getFloor(branchId);
    },
    applyTableAction: async (command) => {
      actions.push(command);
      if (held && command.tableId === held.tableId) {
        const wait = held.until;
        held = undefined;
        await wait;
      }
      return base.applyTableAction(command);
    },
  };
  return { gateway, actions, floorReads };
}

/** Takes a free table out of service from its panel. */
async function outOfService(user: ReturnType<typeof setupUser>, label: string) {
  await user.click(
    await screen.findByRole('button', {
      name: new RegExp(`^Table ${label}, [0-9]+ seats, Free`, 'u'),
    }),
  );
  const panel = await screen.findByRole('dialog', { name: `Actions for table ${label}` });
  await user.click(within(panel).getByRole('button', { name: 'Out of service' }));
  await screen.findByText(new RegExp(`^Table ${label} is out of service`, 'u'));
}

function renderFloor(gateway: StaffGateway) {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={gateway}>
          <MemoryRouter>
            <StaffRoute />
          </MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const setupUser = () => userEvent.setup({ delay: null });

/** Sona takes table 2 out of service offline, then hands the tablet to Aram. */
async function sonaQueuesThenAramSignsIn(user: ReturnType<typeof setupUser>) {
  await user.click(await screen.findByRole('button', { name: /^Table 2, 2 seats, Free/u }));
  const panel = await screen.findByRole('dialog', { name: 'Actions for table 2' });
  act(() => setOnline(false));
  await user.click(within(panel).getByRole('button', { name: 'Out of service' }));
  await screen.findByText('Table 2 is out of service · sent when the connection returns');

  act(() => signOut());
  act(() => signIn(ARAM));
  act(() => setOnline(true));
}

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  await initConsoleTestI18n();
});

afterEach(() => {
  act(() => setOnline(true));
  cleanup();
  resetCommandStore();
});

describe("a command queued under somebody else's sign-in", () => {
  it('is not sent under the next person, and asks them on the conflicts screen', async () => {
    const { gateway, actions } = recording();
    signIn(SONA);
    renderFloor(gateway);
    const user = setupUser();

    await sonaQueuesThenAramSignsIn(user);

    // The chip says something needs a decision; nothing was sent.
    const chip = await screen.findByRole('button', { name: /1 needs a decision/u });
    expect(actions).toEqual([]);

    await user.click(chip);
    const dialog = await screen.findByRole('dialog', { name: 'Needs a decision' });
    const card = within(dialog).getByRole('article', { name: /^Table 2\. Waiting for Sona/u });
    expect(
      within(card).getByText(/Sona’s “mark out of service” from \d\d:\d\d has not been sent/u),
    ).toBeTruthy();

    await user.click(within(card).getByRole('button', { name: 'Send under my name' }));
    await waitFor(() => expect(actions).toHaveLength(1));
    expect(actions[0]).toMatchObject({ kind: 'outOfService', tableId: expect.any(String) });
    expect(await within(dialog).findByText('Under your name; on its way.')).toBeTruthy();
  });

  it('goes by itself when its own person signs in again', async () => {
    const { gateway, actions } = recording();
    signIn(SONA);
    renderFloor(gateway);
    const user = setupUser();

    await sonaQueuesThenAramSignsIn(user);
    await screen.findByRole('button', { name: /1 needs a decision/u });
    expect(actions).toEqual([]);

    act(() => signOut());
    act(() => signIn(SONA));
    await waitFor(() => expect(actions).toHaveLength(1));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /needs a decision/u })).toBeNull(),
    );
  });

  it('is dropped, never sent, when the next person discards it', async () => {
    const { gateway, actions } = recording();
    signIn(SONA);
    renderFloor(gateway);
    const user = setupUser();

    await sonaQueuesThenAramSignsIn(user);
    await user.click(await screen.findByRole('button', { name: /1 needs a decision/u }));
    const dialog = await screen.findByRole('dialog', { name: 'Needs a decision' });
    const card = within(dialog).getByRole('article', { name: /^Table 2\. Waiting for Sona/u });

    await user.click(within(card).getByRole('button', { name: 'Discard the action' }));
    expect(await within(dialog).findByText('Discarded. Nothing was sent.')).toBeTruthy();

    // Sona signing in later finds nothing of it to send.
    act(() => signOut());
    act(() => signIn(SONA));
    await screen.findByRole('heading', { level: 1, name: 'Floor' });
    expect(actions).toEqual([]);
  });
});

describe('the FT4 review fixes', () => {
  it('B1: "…anyway" goes as a live decision, lands, and leaves no second refusal', async () => {
    const { gateway, actions } = recording({ churnOnTables: ['t2'] });
    signIn(SONA);
    renderFloor(gateway);
    const user = setupUser();

    await screen.findByRole('button', { name: /^Table 2, 2 seats, Free/u });
    act(() => setOnline(false));
    await outOfService(user, '2');
    act(() => setOnline(true));

    await user.click(await screen.findByRole('button', { name: /1 needs a decision/u }));
    const dialog = await screen.findByRole('dialog', { name: 'Needs a decision' });
    const card = within(dialog).getByRole('article', { name: /^Table 2 is free again/u });
    await user.click(within(card).getByRole('button', { name: 'Mark it out of service anyway' }));

    await waitFor(() => expect(actions).toHaveLength(2));
    expect(actions[1]).toMatchObject({ kind: 'outOfService', queued: false, precondition: null });
    // It landed: nothing is left to decide, and no new card for table 2.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /needs a decision/u })).toBeNull(),
    );
    // The settled card stays dimmed; no open one comes back for table 2.
    expect(
      within(dialog).queryAllByRole('article', {
        name: /^Table 2 is free again, but it has been used since$/u,
      }),
    ).toEqual([]);
  });

  it("B2: a send still in flight when the tablet changes hands sends nothing more of the first person's", async () => {
    let release!: () => void;
    const until = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { gateway, actions } = recording({ hold: { tableId: 't2', until } });
    signIn(SONA);
    renderFloor(gateway);
    const user = setupUser();

    await screen.findByRole('button', { name: /^Table 2, 2 seats, Free/u });
    act(() => setOnline(false));
    await outOfService(user, '2');
    await outOfService(user, '4');
    act(() => setOnline(true));
    // The first send is on its way and hangs there.
    await waitFor(() => expect(actions.map((action) => action.tableId)).toEqual(['t2']));

    act(() => signOut());
    act(() => signIn(ARAM));
    await act(async () => {
      release();
      await until;
    });

    // Sona's second command waits for Sona; it never went under Aram.
    expect(await screen.findByRole('button', { name: /1 needs a decision/u })).toBeTruthy();
    expect(actions.map((action) => action.tableId)).toEqual(['t2']);
  });

  it('S2 and N2: a held table says whom it waits for, the chip does not count it twice, and acting behind it says so', async () => {
    const { gateway } = recording();
    signIn(SONA);
    renderFloor(gateway);
    const user = setupUser();

    await sonaQueuesThenAramSignsIn(user);
    await screen.findByRole('button', { name: /1 needs a decision/u });

    const card = await screen.findByRole('button', { name: /^Table 2, 2 seats, Out of service/u });
    expect(within(card).getByText('waiting for Sona')).toBeTruthy();
    // Waiting for a person is not "waiting to sync".
    expect(screen.queryByRole('button', { name: /waiting to sync/u })).toBeNull();

    await user.click(card);
    const panel = await screen.findByRole('dialog', { name: 'Actions for table 2' });
    await user.click(within(panel).getByRole('button', { name: 'Return to service' }));
    expect(
      await screen.findByText(
        'Table 2 · waits for an action of Sona’s first · decide on “Needs a decision”',
      ),
    ).toBeTruthy();
  });

  it('QA5: the floor is not read under the gate when the connection comes back after an offline sign-out', async () => {
    const { gateway, floorReads } = recording();
    signIn(SONA);
    renderFloor(gateway);
    const user = setupUser();

    await screen.findByRole('button', { name: /^Table 2, 2 seats, Free/u });
    act(() => setOnline(false));
    // A read asked for offline is paused, not dropped.
    await user.click(screen.getByRole('button', { name: /^Offline/u }));
    act(() => signOut());
    const before = floorReads.count;
    act(() => setOnline(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(floorReads.count).toBe(before);
  });
});
