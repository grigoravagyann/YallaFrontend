// @vitest-environment jsdom
import {
  NetworkError,
  PinLockedError,
  PinRejectedError,
  type EnrolledDevice,
  type StaffRosterEntry,
} from '@yalla/api';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
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
    expect(screen.getByText('Sona, tap your PIN')).toBeTruthy();
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

/**
 * The SMS code screen says "4 attempts left" after the first wrong code. The
 * PIN screen said nothing until the attempt before the lockout, so a waiter
 * read "not recognised" four times and then "locked" with no warning between.
 */
describe('a wrong PIN', () => {
  it('says how many attempts are left from the first one', async () => {
    fake.roster.mockResolvedValue([
      { staffMemberId: 'id-anna', fullName: 'Anna Hakobyan', role: 'waiter' },
    ]);
    fake.signInWithPin.mockRejectedValue(new PinRejectedError({ url: '/api/auth/staff/pin' }));
    const user = userEvent.setup();
    renderPin();

    await user.click(await screen.findByRole('button', { name: 'Anna Hakobyan' }));
    await tapPin(user, '0000');

    expect(await screen.findByText('That PIN was not recognised.')).toBeTruthy();
    expect(screen.getByText('4 attempts left.')).toBeTruthy();
  });
});

describe('one tap, one attempt', () => {
  it('sends four digits once, even where React runs state updaters twice', async () => {
    fake.roster.mockResolvedValue([
      {
        staffMemberId: 'id-anna',
        fullName: 'Anna Hakobyan',
        role: 'waiter',
        onShiftNow: false,
        shift: null,
      },
    ]);
    fake.signInWithPin.mockRejectedValue(new PinRejectedError({ url: '/api/auth/staff/pin' }));
    const user = userEvent.setup();
    render(
      <StrictMode>
        <I18nextProvider i18n={i18next}>
          <PinScreen device={device} lastSignOut={null} />
        </I18nextProvider>
      </StrictMode>,
    );

    await screen.findByRole('button', { name: 'Anna Hakobyan' });
    await tapPin(user, '0000');
    expect(await screen.findByText('That PIN was not recognised.')).toBeTruthy();
    // Twice would be two misses against a five-miss lockout.
    expect(fake.signInWithPin).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/4 attempts left/u)).toBeTruthy();
  });
});

describe('the PIN pad and a physical keyboard (QA 2026-10-16)', () => {
  it('takes digits and Backspace from the keyboard', async () => {
    fake.roster.mockResolvedValue([
      { staffMemberId: 'id-anna', fullName: 'Anna Hakobyan', role: 'waiter' },
    ]);
    const user = userEvent.setup();
    renderPin();

    await user.click(await screen.findByRole('button', { name: 'Anna Hakobyan' }));
    await user.keyboard('19{Backspace}234');

    await waitFor(() =>
      expect(fake.signInWithPin).toHaveBeenCalledWith({ staffMemberId: 'id-anna', pin: '1234' }),
    );
  });
});

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

function person(
  staffMemberId: string,
  fullName: string,
  shift: { from: number; to: number } | null,
  role: StaffRosterEntry['role'] = 'waiter',
): StaffRosterEntry {
  const onShiftNow = shift !== null && shift.from <= 0 && shift.to > 0;
  return {
    staffMemberId,
    fullName,
    role,
    onShiftNow,
    shift: shift
      ? {
          startsAt: '18:00',
          endsAt: '23:00',
          endsNextDay: false,
          startsAtUtc: minutesFromNow(shift.from),
          endsAtUtc: minutesFromNow(shift.to),
        }
      : null,
  };
}

/** The names of the buttons in one list, in order. */
function names(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('button')
    .map((element) => element.getAttribute('aria-label') ?? element.textContent ?? '');
}

describe('who is on shift (floor tablet gap 1)', () => {
  it('lists the people on shift first, and everybody else under "Someone else"', async () => {
    fake.roster.mockResolvedValue([
      person('id-anna', 'Anna Off', null),
      person('id-davit', 'Davit Later', { from: 90, to: 400 }),
      person('id-sona', 'Sona On', { from: -60, to: 240 }),
      person('id-zara', 'Zara On', { from: -10, to: 30 }, 'kitchen'),
    ]);
    const user = userEvent.setup();
    renderPin();

    const onShift = await screen.findByRole('group', { name: 'On shift now' });
    expect(names(onShift)).toEqual(['Sona On', 'Zara On', expect.stringMatching(/^Someone else/u)]);
    expect(within(onShift).getByText('Waiter · until 23:00')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Anna Off' })).toBeNull();

    const other = within(onShift).getByRole('button', { name: /^Someone else/u });
    expect(other.getAttribute('aria-expanded')).toBe('false');
    await user.click(other);
    expect(other.getAttribute('aria-expanded')).toBe('true');

    const everyoneElse = screen.getByRole('group', { name: 'Someone else' });
    expect(names(everyoneElse)).toEqual(['Anna Off', 'Davit Later', 'By staff ID']);
    expect(within(everyoneElse).getByText('Waiter · from 18:00')).toBeTruthy();

    // Off shift is never refused: Anna signs in like anybody else.
    await user.click(within(everyoneElse).getByRole('button', { name: 'Anna Off' }));
    await tapPin(user, '1234');
    await waitFor(() =>
      expect(fake.signInWithPin).toHaveBeenCalledWith({ staffMemberId: 'id-anna', pin: '1234' }),
    );
  });

  it('takes a typed staff id from "Someone else"', async () => {
    fake.roster.mockResolvedValue([
      person('id-anna', 'Anna Off', null),
      person('id-sona', 'Sona On', { from: -60, to: 240 }),
    ]);
    const user = userEvent.setup();
    renderPin();

    await user.click(await screen.findByRole('button', { name: /^Someone else/u }));
    await user.click(screen.getByRole('button', { name: 'By staff ID' }));
    await user.type(screen.getByLabelText(/staff member id/i), 'typed-id');
    await tapPin(user, '5678');
    await waitFor(() =>
      expect(fake.signInWithPin).toHaveBeenCalledWith({ staffMemberId: 'typed-id', pin: '5678' }),
    );
  });

  it('lists everybody at once when nobody is on shift', async () => {
    fake.roster.mockResolvedValue([
      person('id-anna', 'Anna Off', null),
      person('id-davit', 'Davit Later', { from: 90, to: 400 }),
    ]);
    renderPin();

    const all = await screen.findByRole('group', { name: 'Who is signing in' });
    expect(names(all)).toEqual([
      'Anna Off',
      'Davit Later',
      expect.stringMatching(/^Someone else/u),
    ]);
    expect(screen.queryByRole('group', { name: 'On shift now' })).toBeNull();
  });

  it('moves a person up when their shift starts while the gate stays open', async () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    try {
      fake.roster.mockResolvedValue([
        person('id-anna', 'Anna Soon', { from: 1, to: 120 }),
        person('id-sona', 'Sona On', { from: -60, to: 240 }),
      ]);
      renderPin();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(names(screen.getByRole('group', { name: 'On shift now' }))).toEqual([
        'Sona On',
        expect.stringMatching(/^Someone else/u),
      ]);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2 * 60_000);
      });
      // Everybody is on shift now, so nobody is left to fold away.
      expect(names(screen.getByRole('group', { name: 'On shift now' }))).toEqual([
        'Anna Soon',
        'Sona On',
        expect.stringMatching(/^Someone else/u),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the gate when a PIN cannot be taken', () => {
  it('locks the pad for that person after the server locks the PIN, and says who can unlock it', async () => {
    fake.roster.mockResolvedValue([
      person('id-anna', 'Anna Hakobyan', null),
      person('id-sona', 'Sona Vardanyan', null),
    ]);
    fake.signInWithPin.mockRejectedValue(
      new PinLockedError({ url: '/api/auth/staff/pin', lockedUntilUtc: null }),
    );
    const user = userEvent.setup();
    renderPin();

    await user.click(await screen.findByRole('button', { name: 'Anna Hakobyan' }));
    await tapPin(user, '0000');

    expect(await screen.findByText('Too many wrong PINs. This PIN is locked.')).toBeTruthy();
    expect(
      screen.getByText('A manager can unlock it in the console: Staff → Unlock PIN.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: '5' })).toHaveProperty('disabled', true);

    // Somebody else can still sign in on this tablet.
    await user.click(screen.getByRole('button', { name: 'Sona Vardanyan' }));
    expect(screen.getByRole('button', { name: '5' })).toHaveProperty('disabled', false);
  });

  it('says a PIN sign-in needs the network, and turns the pad off, while offline', async () => {
    fake.roster.mockResolvedValue([person('id-anna', 'Anna Hakobyan', null)]);
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      renderPin();
      await screen.findByRole('button', { name: 'Anna Hakobyan' });
      expect(screen.getByText('No connection. Signing in needs the server.')).toBeTruthy();
      expect(screen.getByRole('button', { name: '5' })).toHaveProperty('disabled', true);
      expect(screen.getByText(/Counter · no connection/u)).toBeTruthy();

      online.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(screen.queryByText('No connection. Signing in needs the server.')).toBeNull();
      expect(screen.getByRole('button', { name: '5' })).toHaveProperty('disabled', false);
    } finally {
      online.mockRestore();
    }
  });

  it('marks the dots and says what is left after a wrong PIN', async () => {
    fake.roster.mockResolvedValue([person('id-anna', 'Anna Hakobyan', null)]);
    fake.signInWithPin.mockRejectedValue(new PinRejectedError({ url: '/api/auth/staff/pin' }));
    const user = userEvent.setup();
    renderPin();

    await screen.findByRole('button', { name: 'Anna Hakobyan' });
    await tapPin(user, '0000');
    expect(await screen.findByText('That PIN was not recognised.')).toBeTruthy();
    expect(screen.getByRole('status', { name: '0 digits entered' }).className).toMatch(/is-wrong/u);
  });
});

describe('the gate from review S6/S7 and its nits', () => {
  it('takes focus when it opens, so the lock does not leave it on the floor behind', async () => {
    fake.roster.mockResolvedValue([person('id-anna', 'Anna Hakobyan', null)]);
    renderPin();
    await screen.findByRole('button', { name: 'Anna Hakobyan' });
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('moves into the people off shift when "Someone else" opens them', async () => {
    fake.roster.mockResolvedValue([
      person('id-anna', 'Anna Off', null),
      person('id-sona', 'Sona On', { from: -60, to: 240 }),
    ]);
    const user = userEvent.setup();
    renderPin();
    await user.click(await screen.findByRole('button', { name: /^Someone else/u }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Anna Off' }));
  });

  it('says a wrong PIN in one live region, not an alert inside another', async () => {
    fake.roster.mockResolvedValue([person('id-anna', 'Anna Hakobyan', null)]);
    fake.signInWithPin.mockRejectedValue(new PinRejectedError({ url: '/api/auth/staff/pin' }));
    const user = userEvent.setup();
    renderPin();
    await screen.findByRole('button', { name: 'Anna Hakobyan' });
    await tapPin(user, '0000');
    const message = await screen.findByText('That PIN was not recognised.');
    const regions = [];
    for (let node: HTMLElement | null = message; node; node = node.parentElement) {
      if (node.getAttribute('aria-live') || node.getAttribute('role') === 'alert')
        regions.push(node);
    }
    expect(regions).toHaveLength(1);
  });

  it('reads the roster once on opening, and again when the connection comes back', async () => {
    fake.roster.mockResolvedValue([person('id-anna', 'Anna Hakobyan', null)]);
    renderPin();
    await screen.findByRole('button', { name: 'Anna Hakobyan' });
    expect(fake.roster).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(fake.roster).toHaveBeenCalledTimes(2));
  });

  it('drops digits typed before the connection went', async () => {
    fake.roster.mockResolvedValue([person('id-anna', 'Anna Hakobyan', null)]);
    const user = userEvent.setup();
    renderPin();
    await screen.findByRole('button', { name: 'Anna Hakobyan' });
    await tapPin(user, '12');
    expect(screen.getByRole('status', { name: '2 digits entered' })).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status', { name: '0 digits entered' })).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
  });

  it('keeps counting attempts when the same person is tapped again', async () => {
    fake.roster.mockResolvedValue([
      person('id-anna', 'Anna Hakobyan', null),
      person('id-sona', 'Sona Vardanyan', null),
    ]);
    fake.signInWithPin.mockRejectedValue(new PinRejectedError({ url: '/api/auth/staff/pin' }));
    const user = userEvent.setup();
    renderPin();
    await user.click(await screen.findByRole('button', { name: 'Anna Hakobyan' }));
    await tapPin(user, '0000');
    await screen.findByText(/4 attempts left/u);
    await user.click(screen.getByRole('button', { name: 'Anna Hakobyan' }));
    await tapPin(user, '0000');
    expect(await screen.findByText(/3 attempts left/u)).toBeTruthy();
  });
});
