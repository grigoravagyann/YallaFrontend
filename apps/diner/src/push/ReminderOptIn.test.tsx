import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REMINDER_HOURS_BEFORE, ReminderOptIn, reminderWillBeSent } from './ReminderOptIn';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * The opt-in card promises a reminder only when one is really coming: the
 * server queued it (the booking is far enough out) and this device has a push
 * token on the server. Permission alone is not a token.
 */

const registration = vi.hoisted(() => ({
  permissionState: vi.fn(),
  requestPermission: vi.fn(),
  registerDevice: vi.fn(),
}));
const gateway = vi.hoisted(() => ({ registerPushDevice: vi.fn() }));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('./registration', () => registration);
// The inert build the README documents: no EAS project id.
vi.mock('../config', () => ({ projectId: undefined }));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));

const HOUR_MS = 60 * 60_000;
const tomorrow = () => new Date(Date.now() + 24 * HOUR_MS).toISOString();

beforeEach(() => {
  registration.permissionState.mockReset();
  registration.requestPermission.mockReset();
  registration.registerDevice.mockReset();
});

afterEach(cleanup);

describe('the reminder opt-in', () => {
  it('says no reminder will arrive when permission was granted before but there is no push token', async () => {
    registration.permissionState.mockResolvedValue('granted');
    registration.registerDevice.mockResolvedValue(null);

    render(<ReminderOptIn startUtc={tomorrow()} />);

    expect(await screen.findByText('push.optIn.declined')).toBeTruthy();
    expect(screen.queryByText('push.optIn.granted')).toBeNull();
    expect(registration.registerDevice).toHaveBeenCalledWith(gateway, {
      projectId: undefined,
      locale: 'en',
    });
  });

  it('says no reminder will arrive when registering the granted device fails', async () => {
    registration.permissionState.mockResolvedValue('granted');
    registration.registerDevice.mockRejectedValue(new Error('offline'));

    render(<ReminderOptIn startUtc={tomorrow()} />);

    expect(await screen.findByText('push.optIn.declined')).toBeTruthy();
    expect(screen.queryByText('push.optIn.granted')).toBeNull();
  });

  it('promises the reminder once a granted device is registered', async () => {
    registration.permissionState.mockResolvedValue('granted');
    registration.registerDevice.mockResolvedValue('device-1');

    render(<ReminderOptIn startUtc={tomorrow()} />);

    expect(await screen.findByText('push.optIn.granted')).toBeTruthy();
  });

  it('offers the prompt when the permission was never asked for', async () => {
    registration.permissionState.mockResolvedValue('undetermined');

    render(<ReminderOptIn startUtc={tomorrow()} />);

    expect(await screen.findByText('push.optIn.explain')).toBeTruthy();
    expect(registration.registerDevice).not.toHaveBeenCalled();
  });

  it('says nothing, and asks nothing, for a booking too close for the server to remind', async () => {
    registration.permissionState.mockResolvedValue('granted');
    registration.registerDevice.mockResolvedValue('device-1');
    const soon = new Date(Date.now() + 2 * HOUR_MS).toISOString();

    const { container } = render(<ReminderOptIn startUtc={soon} />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.textContent).toBe('');
    expect(registration.permissionState).not.toHaveBeenCalled();
    expect(registration.registerDevice).not.toHaveBeenCalled();
  });
});

describe('reminderWillBeSent', () => {
  const now = Date.parse('2026-09-15T10:00:00.000Z');
  const at = (hours: number) => new Date(now + hours * HOUR_MS).toISOString();

  it('is true only while the reminder time is still ahead, as the server decides', () => {
    expect(REMINDER_HOURS_BEFORE).toBe(3);
    expect(reminderWillBeSent(at(2), now)).toBe(false);
    expect(reminderWillBeSent(at(3), now)).toBe(false);
    expect(reminderWillBeSent(at(3.01), now)).toBe(true);
    expect(reminderWillBeSent(at(26), now)).toBe(true);
  });

  it('is false for a start it cannot read', () => {
    expect(reminderWillBeSent('not a date', now)).toBe(false);
  });
});
