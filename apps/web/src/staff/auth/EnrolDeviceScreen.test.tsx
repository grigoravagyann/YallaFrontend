// @vitest-environment jsdom
import {
  EnrolmentCodeExpiredError,
  EnrolmentCodeSpentError,
  NetworkError,
  UnauthorizedError,
  type EnrolledDevice,
} from '@yalla/api';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../../console/venue/reports/testHarness';
import { I18nextProvider, i18next } from '@yalla/i18n';
import type { EnrolDeviceScreenProps } from './EnrolDeviceScreen';

const fake = vi.hoisted(() => ({ enrol: vi.fn() }));

vi.mock('./staffSession', () => ({ staffSession: fake, staffAuthAvailable: true }));

const { EnrolDeviceScreen } = await import('./EnrolDeviceScreen');

const device: EnrolledDevice = {
  deviceId: 'd1',
  deviceName: 'Hall 1',
  branchId: 'b1',
  branchName: 'Cascade',
  venueName: 'Cascade Cafe',
  enrolledAtUtc: '2026-10-21T00:00:00Z',
  lastSeenAtUtc: null,
};

const URL = '/api/auth/staff/enrol';

beforeAll(async () => {
  await initConsoleTestI18n();
});

beforeEach(() => {
  fake.enrol.mockReset();
  fake.enrol.mockResolvedValue(device);
});

afterEach(cleanup);

function renderEnrol(props: Partial<EnrolDeviceScreenProps> = {}) {
  render(
    <I18nextProvider i18n={i18next}>
      <EnrolDeviceScreen reason="never" {...props} />
    </I18nextProvider>,
  );
  return {
    code: () => screen.getByRole('textbox', { name: 'One-time code' }),
    submit: () =>
      screen.getByRole('button', { name: /to go|Pick a name|Connect the tablet|Connecting/ }),
  };
}

describe('typing the code', () => {
  it('takes it in any case, groups it as the console shows it, and counts', async () => {
    const user = userEvent.setup();
    const view = renderEnrol();

    await user.type(view.code(), 'h7kq2m');

    expect(view.code()).toHaveProperty('value', 'H7KQ2-M');
    expect(screen.getByText('6 / 10')).toBeTruthy();
    expect(view.submit().textContent).toBe('4 characters to go');
  });

  it('drops a character no code contains, and says why it vanished', async () => {
    const user = userEvent.setup();
    const view = renderEnrol();

    await user.type(view.code(), 'H7O');

    expect(view.code()).toHaveProperty('value', 'H7');
    expect(screen.getByText(/No code contains “O”/)).toBeTruthy();
  });

  it('takes a pasted code with its dash and spaces', async () => {
    const user = userEvent.setup();
    const view = renderEnrol();

    await user.click(view.code());
    await user.paste(' h7kq2 - mxp9d ');

    expect(view.code()).toHaveProperty('value', 'H7KQ2-MXP9D');
  });
});

describe('naming the tablet', () => {
  it('names nothing for the staff, and the button says the name is what is missing', async () => {
    const user = userEvent.setup();
    const view = renderEnrol();

    await user.type(view.code(), 'H7KQ2MXP9D');
    expect(view.submit().textContent).toBe('Pick a name for the device');
    expect(view.submit().getAttribute('aria-disabled')).toBe('true');

    await user.click(view.submit());
    expect(fake.enrol).not.toHaveBeenCalled();
  });

  it('sends the code as the server hashed it and the preset tapped', async () => {
    const user = userEvent.setup();
    const view = renderEnrol();

    await user.type(view.code(), 'h7kq2-mxp9d');
    await user.click(screen.getByRole('button', { name: 'Terrace' }));
    expect(screen.getByRole('button', { name: 'Terrace' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Connect the tablet' }));

    expect(fake.enrol).toHaveBeenCalledWith({ code: 'H7KQ2MXP9D', deviceName: 'Terrace' });
  });

  it('submits from the keyboard with a name of its own', async () => {
    const user = userEvent.setup();
    const view = renderEnrol();

    await user.type(view.code(), 'H7KQ2MXP9D');
    await user.type(screen.getByRole('textbox', { name: 'Device name' }), '  Patio  {Enter}');

    expect(fake.enrol).toHaveBeenCalledWith({ code: 'H7KQ2MXP9D', deviceName: 'Patio' });
  });
});

describe('a refused code', () => {
  async function refusedWith(error: Error) {
    fake.enrol.mockRejectedValue(error);
    const user = userEvent.setup();
    const view = renderEnrol();
    await user.type(view.code(), 'H7KQ2MXP9D');
    await user.click(screen.getByRole('button', { name: 'Bar' }));
    await user.click(screen.getByRole('button', { name: 'Connect the tablet' }));
    return { user, view };
  }

  it('says an expired code is expired, under the code, and selects it for the next one', async () => {
    const { view } = await refusedWith(new EnrolmentCodeExpiredError({ url: URL }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('That code has expired.');
    expect(alert.textContent).toContain('Ask the manager for a new one.');
    expect(view.code().getAttribute('aria-invalid')).toBe('true');
    expect(view.code().getAttribute('aria-describedby')).toContain(alert.id);
    expect(document.activeElement).toBe(view.code());
    const input = view.code() as HTMLInputElement;
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'H7KQ2-MXP9D'.length]);
  });

  it('says a spent code works once', async () => {
    await refusedWith(new EnrolmentCodeSpentError({ url: URL }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'That code has already been used.',
    );
  });

  it('calls an unknown code unrecognised, and clears that when the code changes', async () => {
    const { user, view } = await refusedWith(new UnauthorizedError({ url: URL }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'That code was not recognised.',
    );

    await user.type(view.code(), 'K');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(view.code().getAttribute('aria-invalid')).toBeNull();
  });

  it('keeps the code, and does not blame it, when the tablet is offline', async () => {
    const { view } = await refusedWith(new NetworkError({ url: URL }));

    expect((await screen.findByRole('alert')).textContent).toContain('No connection.');
    expect(view.code()).toHaveProperty('value', 'H7KQ2-MXP9D');
    expect(view.code().getAttribute('aria-invalid')).toBeNull();
  });
});

describe('the steps beside the form', () => {
  it('marks a step done as the staff get past it', async () => {
    const user = userEvent.setup();
    const view = renderEnrol();
    const current = () => document.querySelector('[aria-current="step"]')?.textContent ?? '';

    expect(current()).toContain('A manager generates a code');
    await user.type(view.code(), 'H7K');
    expect(current()).toContain('Type the 10-character code');
    await user.type(view.code(), 'Q2MXP9D');
    expect(current()).toContain('Name the tablet');
  });
});

describe('a revoked tablet, and a connected one', () => {
  it('says the tablet is no longer connected and why', () => {
    renderEnrol({ reason: 'revoked' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'This tablet is no longer connected',
    );
    expect(screen.getByText(/disconnected this tablet from the console/)).toBeTruthy();
  });

  it('shows where the tablet is bound before the keypad, and goes on when asked', async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    renderEnrol({ reason: 'revoked', enrolled: device, onContinue });

    expect(screen.getByRole('status').textContent).toContain('Cascade Cafe · Cascade');
    expect(screen.getByText('As “Hall 1”. Staff can now sign in with their PIN.')).toBeTruthy();
    expect(screen.queryByText('This tablet is no longer connected')).toBeNull();
    const go = screen.getByRole('button', { name: 'Go to the PIN pad' });
    expect(document.activeElement).toBe(go);

    await user.click(go);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe('a phone that chose a floor tablet', () => {
  it('can go back to pairing the phone', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    renderEnrol({ onBack });

    await user.click(screen.getByRole('button', { name: 'Back to pairing my phone' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers no way back on a tablet', () => {
    renderEnrol();
    expect(screen.queryByRole('button', { name: 'Back to pairing my phone' })).toBeNull();
  });
});
