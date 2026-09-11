// @vitest-environment jsdom
import { NetworkError, type EnrolledDevice } from '@yalla/api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../../console/venue/reports/testHarness';
import { I18nextProvider, i18next } from '@yalla/i18n';
import type * as DeviceStoreModule from './deviceStore';

const fake = vi.hoisted(() => ({
  roster: vi.fn(),
  signInWithPin: vi.fn(),
}));

vi.mock('./staffSession', () => ({ staffSession: fake, staffAuthAvailable: true }));
vi.mock('./deviceStore', async () => {
  const actual = await vi.importActual<typeof DeviceStoreModule>('./deviceStore');
  return { ...actual, staffDeviceStore: actual.createMemoryDeviceStore() };
});

const { PinScreen } = await import('./PinScreen');
const { staffDeviceStore } = await import('./deviceStore');

const device: EnrolledDevice = {
  deviceId: 'd1',
  deviceName: 'Counter',
  branchId: 'b1',
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

beforeAll(async () => {
  await initConsoleTestI18n();
});

beforeEach(() => {
  fake.roster.mockReset();
  fake.signInWithPin.mockReset();
  fake.signInWithPin.mockImplementation(async ({ staffMemberId }: { staffMemberId: string }) => ({
    staffMemberId,
    fullName: 'Signed In',
    role: 'waiter',
    branchId: 'b1',
  }));
});

afterEach(async () => {
  cleanup();
  for (const person of await staffDeviceStore.readKnownStaff()) {
    await staffDeviceStore.forgetStaff(person.staffMemberId);
  }
});

function renderPin() {
  render(
    <I18nextProvider i18n={i18next}>
      <PinScreen device={device} lastSignOut={null} />
    </I18nextProvider>,
  );
}

async function tapPin(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const digit of digits) {
    await user.click(screen.getByRole('button', { name: digit }));
  }
}

describe('the branch roster on the PIN screen', () => {
  it('lists the roster and signs in with the id of the name tapped', async () => {
    fake.roster.mockResolvedValue([
      { staffMemberId: 'id-anna', fullName: 'Anna Hakobyan', role: 'waiter' },
      { staffMemberId: 'id-sona', fullName: 'Sona Vardanyan', role: 'kitchen' },
    ]);
    const user = userEvent.setup();
    renderPin();

    await user.click(await screen.findByRole('button', { name: 'Sona Vardanyan' }));
    expect(screen.getByText('Sona Vardanyan, tap your PIN')).toBeTruthy();
    expect(screen.queryByLabelText(/staff member id/i)).toBeNull();

    await tapPin(user, '1234');

    await waitFor(() =>
      expect(fake.signInWithPin).toHaveBeenCalledWith({ staffMemberId: 'id-sona', pin: '1234' }),
    );
  });

  it('falls back to the typed id, and keeps people this tablet knows, when the roster fails', async () => {
    fake.roster.mockRejectedValue(new NetworkError({ url: '/api/auth/staff/roster' }));
    await staffDeviceStore.rememberStaff({ staffMemberId: 'id-known', fullName: 'Known Person' });
    await staffDeviceStore.rememberStaff({ staffMemberId: 'id-known-2', fullName: 'Second Known' });
    const user = userEvent.setup();
    renderPin();

    expect(await screen.findByText(/could not load the staff list/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Known Person' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /someone else/i }));
    await user.type(screen.getByLabelText(/staff member id/i), 'typed-id');
    await tapPin(user, '5678');

    await waitFor(() =>
      expect(fake.signInWithPin).toHaveBeenCalledWith({ staffMemberId: 'typed-id', pin: '5678' }),
    );
  });
});
