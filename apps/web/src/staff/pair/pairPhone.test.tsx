// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  MOCK_STAFF_PIN,
  createQueryClient,
  createStaffMockGateway,
  type MockRegistry,
  type StaffSession,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../../console/venue/reports/testHarness';
import type * as CurrentUserModule from '../../auth/useCurrentUser';
import { PHONE_QUERY } from '../phone/usePhoneLayout';

/**
 * Pairing a personal phone (staff phone, Main and Pin artboards), through the
 * real staff session over the mock staff auth: the manager's code — written
 * into the registry the console mock writes it to — "is this you?", the
 * person's own PIN, done, the install screen, and then a phone that opens
 * with that person's PIN and nobody else's.
 */

const harness = vi.hoisted(() => ({
  session: null as unknown as StaffSession,
  registry: null as unknown as MockRegistry,
}));

vi.mock('../auth/staffSession', async () => {
  const api = await import('@yalla/api');
  const registry = api.createMockRegistry(() => null);
  const values = new Map<string, string>();
  const session = api.createStaffSession({
    auth: api.createMockStaffAuth({ registry }),
    storage: {
      readDeviceId: async () => values.get('id') ?? null,
      writeDeviceId: async (value) => void values.set('id', value),
      readDeviceToken: async () => values.get('device') ?? null,
      writeDeviceToken: async (value) => void values.set('device', value),
      clearDeviceToken: async () => void values.delete('device'),
      readRenewalToken: async () => values.get('renewal') ?? null,
      writeRenewalToken: async (value) => void values.set('renewal', value),
      clearRenewalToken: async () => void values.delete('renewal'),
    },
    newDeviceId: () => 'browser-1',
    scheduleIdleCheck: () => () => undefined,
  });
  harness.session = session;
  harness.registry = registry;
  return { staffSession: session, staffAuthAvailable: true };
});
vi.mock('../../offline/commandStore', async (importOriginal) =>
  (await import('../testCommandStore')).withMemoryStore(await importOriginal()),
);
vi.mock('../../auth/useCurrentUser', async () => {
  const actual = await vi.importActual<typeof CurrentUserModule>('../../auth/useCurrentUser');
  return { ...actual, useCurrentUser: () => ({ user: null }) };
});
vi.mock('../chime', () => ({ primeChime: () => undefined, playChime: async () => true }));

const { StaffRoute } = await import('../StaffRoute');

const BRANCH = 'b-lumen-north';
/** The branch's manager in the fixture: active, with a PIN that works. */
const PERSON = 'b-lumen-north-manager';
const CODE = 'K7Q2M9XW4P';

function issue(code = CODE, minutes = 10): void {
  harness.registry.phonePairings.set(code, {
    code,
    branchId: BRANCH,
    staffMemberId: PERSON,
    expiresAtUtc: new Date(Date.now() + minutes * 60_000).toISOString(),
    redeemedAtUtc: null,
    supersededAtUtc: null,
  });
}

function viewport(phone: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === PHONE_QUERY ? phone : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

function renderAt(path: string) {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={createStaffMockGateway({ latencyMs: 0, branchId: BRANCH })}>
          <MemoryRouter initialEntries={[path]}>
            <StaffRoute />
          </MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const setupUser = () => userEvent.setup({ delay: null });

async function tapPin(user: ReturnType<typeof setupUser>, digits: string): Promise<void> {
  const pad = screen.getByRole('group', { name: 'PIN keypad' });
  for (const digit of digits) await user.click(within(pad).getByRole('button', { name: digit }));
}

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  await initConsoleTestI18n();
});

beforeEach(() => {
  viewport(true);
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await harness.session.forgetDevice();
  harness.registry.reset();
});

describe('pairing a phone', () => {
  it('takes a typed code to "is this you?", the PIN, done, the install screen, then the phone', async () => {
    issue();
    renderAt('/staff/pair');
    const user = setupUser();

    expect(
      await screen.findByRole('heading', { name: 'Pair your phone with the venue' }),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Enter the code by hand' }));
    await user.type(await screen.findByLabelText('Pairing code'), 'k7q2m9xw4p');
    expect((screen.getByLabelText('Pairing code') as HTMLInputElement).value).toBe('K7Q2M-9XW4P');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: 'Is this you?' })).toBeTruthy();
    expect(screen.getByText('Nare Petrosyan')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Yes, it’s me' }));

    expect(await screen.findByRole('heading', { name: 'Enter your PIN' })).toBeTruthy();
    await tapPin(user, '0000');
    expect(await screen.findByText(/^Wrong PIN · try again/u)).toBeTruthy();
    await tapPin(user, MOCK_STAFF_PIN);

    expect(await screen.findByRole('heading', { name: 'Phone paired' })).toBeTruthy();
    expect(harness.session.getSnapshot().state).toBe('signedIn');
    expect(harness.registry.devices.values()[0]).toMatchObject({
      kind: 'phone',
      boundStaffMemberId: PERSON,
    });

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByRole('heading', { name: 'Two things, and you’re ready' }),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    // The phone's own screens, a manager's Today first.
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeTruthy();
  });

  it('reads #code= from the QR link straight to "is this you?", and "No" goes back to the start', async () => {
    issue();
    renderAt(`/staff/pair#code=K7Q2M-9XW4P`);
    const user = setupUser();
    expect(await screen.findByRole('heading', { name: 'Is this you?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'No, wrong code' }));
    expect(
      await screen.findByRole('heading', { name: 'Pair your phone with the venue' }),
    ).toBeTruthy();
  });

  it('says a code has expired, and that only a new one helps', async () => {
    issue(CODE, -1);
    renderAt(`/staff/pair#code=${CODE}`);
    expect(
      await screen.findByText(
        'That code has expired or a newer one replaced it. Ask your manager for a new one.',
      ),
    ).toBeTruthy();
  });

  it('says so when the typed code is too short, without asking the server', async () => {
    renderAt('/staff/pair');
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Enter the code by hand' }));
    await user.type(screen.getByLabelText('Pairing code'), 'K7Q2');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('The code has ten characters.')).toBeTruthy();
    expect(screen.getByLabelText('Pairing code').getAttribute('aria-invalid')).toBe('true');
  });

  it('sends an unpaired phone to pairing, and a tablet-sized screen to the tablet’s code', async () => {
    renderAt('/staff');
    expect(
      await screen.findByRole('heading', { name: 'Pair your phone with the venue' }),
    ).toBeTruthy();
    cleanup();

    viewport(false);
    renderAt('/staff');
    expect(
      await screen.findByRole('heading', { name: 'Connect this tablet to your venue' }),
    ).toBeTruthy();
  });

  it('refuses to pair over a browser that is the venue’s floor tablet, and goes back to it', async () => {
    const tabletCode = 'TBKT2345XY';
    harness.registry.enrolmentCodes.set(tabletCode, {
      code: tabletCode,
      branchId: BRANCH,
      expiresAtUtc: new Date(Date.now() + 60 * 60_000).toISOString(),
      spentAtUtc: null,
    });
    await harness.session.enrol({ code: tabletCode, deviceName: 'Bar tablet' });
    const tabletToken = harness.registry.devices.values()[0]?.deviceToken;
    issue();

    // Even straight from the manager's QR link.
    renderAt(`/staff/pair#code=${CODE}`);
    const user = setupUser();

    expect(
      await screen.findByRole('heading', { name: 'This browser is the venue’s floor tablet' }),
    ).toBeTruthy();
    expect(screen.getByText(/Lumen Coffee · Northern Avenue/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yes, it’s me' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'PIN keypad' })).toBeNull();

    // Nothing was paired: the tablet is still the one device, still a tablet.
    expect(harness.registry.devices.values()).toHaveLength(1);
    expect(harness.registry.devices.values()[0]).toMatchObject({ deviceToken: tabletToken });
    expect(harness.registry.devices.values()[0]?.kind ?? 'tablet').toBe('tablet');
    expect(harness.registry.phonePairings.get(CODE)?.redeemedAtUtc).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Back to the floor tablet' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'This browser is the venue’s floor tablet' }),
      ).toBeNull(),
    );
    expect(harness.session.getSnapshot().device?.deviceName).toBe('Bar tablet');
  });

  it('offers the tablet’s code instead, from a phone-sized screen', async () => {
    renderAt('/staff/pair');
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Enrol a tablet with its code' }));
    expect(
      await screen.findByRole('heading', { name: 'Connect this tablet to your venue' }),
    ).toBeTruthy();
  });
});

describe('a paired phone’s PIN screen', () => {
  it('shows its own person only, and opens with their PIN', async () => {
    issue();
    renderAt(`/staff/pair#code=${CODE}`);
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Yes, it’s me' }));
    await tapPin(user, MOCK_STAFF_PIN);
    await screen.findByRole('heading', { name: 'Phone paired' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByRole('navigation', { name: 'Main' });

    await harness.session.lock('signedOut');
    const gate = await screen.findByRole('dialog', { name: 'Hi, Nare' });
    // No list of names, no "someone else": the phone is Nare's.
    expect(within(gate).queryByRole('button', { name: /Someone else/u })).toBeNull();
    expect(within(gate).getByText('Lumen Coffee · Northern Avenue')).toBeTruthy();

    await tapPin(user, '9999');
    expect(await within(gate).findByText(/^Wrong PIN · try again/u)).toBeTruthy();
    await tapPin(user, MOCK_STAFF_PIN);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Hi, Nare' })).toBeNull());
    expect(harness.session.getSnapshot().state).toBe('signedIn');
  });
});
