import type { DinerProfileView } from '@yalla/api';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSession } from './session';

const ACCOUNT: DinerProfileView = {
  dinerUserId: 'diner-1',
  username: 'ani',
  email: 'ani@account.example',
  phoneE164: '+37477123456',
  phoneVerified: true,
  displayName: 'Ani Petrosyan',
  localeCode: 'hy',
  hasPassword: true,
  photo: null,
};

beforeEach(() => {
  useSession.setState({
    signedIn: false,
    phoneE164: null,
    guestName: null,
    email: null,
    profile: null,
  });
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

  it('forgets them, and the profile, when a different number logs in on this phone', () => {
    useSession.setState({
      phoneE164: '+37477123456',
      guestName: 'Ani',
      email: 'ani@example.com',
      profile: ACCOUNT,
    });

    useSession.getState().setVerified({ phoneE164: '+37499000000' });

    expect(useSession.getState()).toMatchObject({
      signedIn: true,
      phoneE164: '+37499000000',
      guestName: null,
      email: null,
      profile: null,
    });
  });

  it('keeps a name typed before the very first verification', () => {
    useSession.getState().setGuestName('Ani');

    useSession.getState().setVerified({ phoneE164: '+37477123456' });

    expect(useSession.getState().guestName).toBe('Ani');
  });
});

describe('what this phone remembers', () => {
  it('sets what it is given and leaves the rest alone', () => {
    useSession.getState().setRemembered({ guestName: 'Ani', email: 'ani@example.com' });
    useSession.getState().setRemembered({ email: null });

    expect(useSession.getState().guestName).toBe('Ani');
    expect(useSession.getState().email).toBeNull();
  });
});

describe('the profile from the server', () => {
  it('brings the remembered number, name and email in step with the account', () => {
    useSession.setState({ phoneE164: '+37477000000', guestName: 'Ani', email: 'old@example.com' });

    useSession.getState().setProfile(ACCOUNT);

    expect(useSession.getState()).toMatchObject({
      profile: ACCOUNT,
      phoneE164: '+37477123456',
      guestName: 'Ani Petrosyan',
      email: 'ani@account.example',
    });
  });

  it('keeps a name typed on this phone when the account has none yet', () => {
    useSession.setState({ guestName: 'Ani' });

    useSession.getState().setProfile({ ...ACCOUNT, displayName: null, email: null });

    expect(useSession.getState().guestName).toBe('Ani');
    expect(useSession.getState().email).toBeNull();
  });

  it('is dropped on sign-out, while the prefill stays', () => {
    useSession.getState().setVerified({ phoneE164: '+37477123456' });
    useSession.getState().setProfile(ACCOUNT);

    useSession.getState().clear();

    expect(useSession.getState()).toMatchObject({
      signedIn: false,
      profile: null,
      phoneE164: '+37477123456',
      guestName: 'Ani Petrosyan',
    });
  });

  it('is dropped when the token session ends, and kept when it starts', () => {
    useSession.getState().setProfile(ACCOUNT);

    useSession.getState().setSignedIn(true);
    expect(useSession.getState().profile).toEqual(ACCOUNT);

    useSession.getState().setSignedIn(false);
    expect(useSession.getState().profile).toBeNull();
  });
});
