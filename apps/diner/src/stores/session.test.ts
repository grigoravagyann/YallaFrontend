import { beforeEach, describe, expect, it } from 'vitest';
import { useSession } from './session';

beforeEach(() => {
  useSession.setState({ signedIn: false, phoneE164: null, guestName: null, email: null });
});

describe('verifying a number', () => {
  it('keeps the remembered name and email when it is the same number', () => {
    useSession.setState({ phoneE164: '+37477123456', guestName: 'Ani', email: 'ani@example.com' });

    useSession.getState().setVerified({ phoneE164: '+37477123456' });

    expect(useSession.getState()).toMatchObject({
      signedIn: true,
      phoneE164: '+37477123456',
      guestName: 'Ani',
      email: 'ani@example.com',
    });
  });

  it('forgets them when a different number logs in on this phone', () => {
    useSession.setState({ phoneE164: '+37477123456', guestName: 'Ani', email: 'ani@example.com' });

    useSession.getState().setVerified({ phoneE164: '+37499000000' });

    expect(useSession.getState()).toMatchObject({
      signedIn: true,
      phoneE164: '+37499000000',
      guestName: null,
      email: null,
    });
  });

  it('keeps a name typed before the very first verification', () => {
    useSession.getState().setGuestName('Ani');

    useSession.getState().setVerified({ phoneE164: '+37477123456' });

    expect(useSession.getState().guestName).toBe('Ani');
  });
});

describe('the profile from sign-up', () => {
  it('sets what it is given and leaves the rest alone', () => {
    useSession.getState().setProfile({ guestName: 'Ani', email: 'ani@example.com' });
    useSession.getState().setProfile({ email: null });

    expect(useSession.getState().guestName).toBe('Ani');
    expect(useSession.getState().email).toBeNull();
  });
});
